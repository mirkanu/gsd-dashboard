'use strict';

const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const crypto = require('crypto');
const stripAnsi = require('strip-ansi');

const execFileAsync = promisify(execFile);

// Module-level cache for the output-change heuristic. Maps sessionName to
// { hash, lastChangedAt }. In-memory only — never persisted, does not survive
// process restart. Keeps STAT-02 detection responsive without any DB writes.
const paneHashCache = new Map();

// Window within which a non-changing capture is still considered "working"
// after the most recent content change. Tuned to 3s because:
//   - Claude Code tool calls often hold the pane static for 1-2s
//     between streaming bursts.
//   - 3s is short enough to flip to 'waiting' quickly after true idle.
const CHANGE_HEURISTIC_WINDOW_MS = 3000;

function _resetPaneHashCache() {
  paneHashCache.clear();
}

/**
 * Strip the user-input box and footer status bar from a tmux capture so that
 * hashing only reflects Claude's output area. Without this, the output-change
 * heuristic fires when the user types into the input box (false-working).
 *
 * Claude Code's input region is anchored at the bottom of the pane. Two
 * common layouts:
 *   1. Box-drawing bordered: `╭─...─╮` / `│ > ... │` / `╰─...─╯`
 *   2. Horizontal-rule bordered: `─────` / `❯ ...` / `─────`
 *
 * Both are followed by a status bar ("⬆ /command", "⏵⏵ bypass permissions", etc).
 *
 * Strategy: Drop everything from the last non-empty line up through the first
 * horizontal separator (─) we hit while walking upward. This effectively
 * removes the entire input region regardless of which layout is used.
 */
function stripInputBoxForHash(output) {
  if (!output) return '';
  const lines = output.split('\n');
  // Drop trailing empty lines
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();

  // Walk upward stripping: footer chrome → bottom rule → input line → top rule.
  // Stop after we pass the SECOND separator rule (the top of the input box).
  const maxStrip = 20;
  let rulesSeen = 0;
  let stripped = 0;
  const isRule = (s) => /^[─━═]{3,}/.test(s) || /^[─━═╭╰╮╯│\s]+$/.test(s);
  const isBoxSide = (s) => /^[│]/.test(s) || /[│]$/.test(s);

  while (lines.length > 0 && stripped < maxStrip) {
    const line = stripAnsi(lines[lines.length - 1]).trim();

    if (rulesSeen === 0) {
      // Still in footer chrome — pop everything until we hit a rule
      if (isRule(line) || isBoxSide(line)) {
        rulesSeen = 1;
        lines.pop();
        stripped++;
        continue;
      }
      // Footer chrome line (status bar, permissions, etc) — pop
      lines.pop();
      stripped++;
      continue;
    }

    if (rulesSeen === 1) {
      // Between bottom rule and top rule — this is the input line (or multi-line input)
      lines.pop();
      stripped++;
      if (isRule(line) || isBoxSide(line)) {
        rulesSeen = 2;
      }
      continue;
    }

    // rulesSeen >= 2: we've passed both rules, done stripping
    break;
  }

  return lines.join('\n');
}

/**
 * Pure helper for the output-change heuristic. No tmux calls, no pattern
 * matching, no module state. Returns 'working' if the capture indicates the
 * session is actively producing output, or null if the heuristic has no
 * opinion and the caller should fall through to pattern matching.
 *
 * @param {{ hash: string, lastChangedAt: number } | null | undefined} prev
 * @param {string} currentOutput
 * @param {number} nowMs
 * @returns {'working'|null}
 */
function _testDetectWithChangeHeuristic(prev, currentOutput, nowMs) {
  const stripped = stripInputBoxForHash(currentOutput);
  const hash = crypto.createHash('sha1').update(stripped).digest('hex').slice(0, 16);
  if (prev && prev.hash !== hash) return 'working';
  if (prev && prev.hash === hash && (nowMs - prev.lastChangedAt) < CHANGE_HEURISTIC_WINDOW_MS) {
    return 'working';
  }
  return null;
}

/**
 * Check whether a named tmux session exists and is running.
 * Returns false for falsy input or any error (tmux not found, session absent, etc.).
 * Never throws.
 */
function isTmuxSessionActive(sessionName) {
  if (!sessionName) return false;
  try {
    execFileSync('tmux', ['has-session', '-t', sessionName], { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Async variant of isTmuxSessionActive. Never blocks the event loop.
 * Returns false for falsy input or any error (tmux not found, session absent, etc.).
 * Never throws.
 * @param {string} sessionName
 * @returns {Promise<boolean>}
 */
async function isTmuxSessionActiveAsync(sessionName) {
  if (!sessionName) return false;
  try {
    await execFileAsync('tmux', ['has-session', '-t', sessionName], { stdio: 'ignore', timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Capture raw pane text for a session. Returns null on any error.
 * @param {string} sessionName
 * @returns {string|null}
 */
function capturePaneText(sessionName) {
  try {
    return execFileSync('tmux', ['capture-pane', '-p', '-J', '-t', sessionName], { encoding: 'utf8', timeout: 2000 });
  } catch {
    return null;
  }
}

/**
 * Try to parse a reset timestamp from a rate-limit message.
 * Handles patterns like:
 *   "try again in 2 hours"
 *   "try again in 47 minutes"
 *   "resets at 3:00 PM"
 *   "resets in 1 hour 23 minutes"
 *   ISO timestamp after "after" or "at"
 * Returns a Date or null.
 * @param {string} text
 * @returns {Date|null}
 */
function parseResetTime(text) {
  const now = Date.now();

  // "in X hours Y minutes" / "in X hours" / "in Y minutes"
  const inMatch = text.match(/in\s+(?:(\d+)\s*hours?\s*)?(?:(\d+)\s*minutes?)?/i);
  if (inMatch && (inMatch[1] || inMatch[2])) {
    const h = parseInt(inMatch[1] || '0', 10);
    const m = parseInt(inMatch[2] || '0', 10);
    if (h + m > 0) return new Date(now + (h * 60 + m) * 60_000);
  }

  // "resets at HH:MM" or "at HH:MM AM/PM"
  const atMatch = text.match(/(?:resets?\s+at|after|at)\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i);
  if (atMatch) {
    const candidate = new Date(`${new Date().toDateString()} ${atMatch[1]}`);
    if (!isNaN(candidate.getTime())) {
      // If the time has already passed today, assume tomorrow
      return candidate.getTime() > now ? candidate : new Date(candidate.getTime() + 86_400_000);
    }
  }

  // ISO timestamp
  const isoMatch = text.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  if (isoMatch) {
    const d = new Date(isoMatch[0]);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

// Patterns must match actual error messages from Claude/Anthropic, not prose.
// Require explicit error context words to avoid matching commit messages, docs, etc.
const RATE_LIMIT_PATTERNS = [
  /rate.?limit(?:ed| exceeded| reached)/i,  // "rate limited", "rate limit exceeded"
  /(?:hit|reached|exceeded).*(?:rate.?limit|usage.?limit)/i,
  /out of credit/i,
  /insufficient credits?/i,
  /usage.?limit(?:\s+(?:hit|reached|exceeded))/i,
  /too many requests/i,
  /quota exceeded/i,
  /please try again in \d/i,               // "please try again in X hours"
];

/**
 * Scan a list of active tmux session names for rate-limit signals.
 * Returns { active: false } or { active: true, resetAt: ISO string | null }.
 * Never throws.
 * @param {string[]} sessionNames
 * @returns {{ active: boolean, resetAt: string|null }}
 */
function detectRateLimit(sessionNames) {
  for (const name of sessionNames) {
    if (!name || !isTmuxSessionActive(name)) continue;
    const text = capturePaneText(name);
    if (!text) continue;
    // Only scan the last 10 lines — rate limit notices appear in recent output,
    // not buried in scrollback that may contain code/docs with matching words.
    const recent = text.split('\n').slice(-10).join('\n');
    for (const pattern of RATE_LIMIT_PATTERNS) {
      if (pattern.test(recent)) {
        const resetAt = parseResetTime(recent);
        return { active: true, resetAt: resetAt ? resetAt.toISOString() : null };
      }
    }
  }
  return { active: false, resetAt: null };
}

/**
 * Detect the current state of a tmux session by capturing its output.
 * Returns one of: 'archived' | 'waiting' | 'paused' | 'working'.
 * Never throws.
 *
 * @param {string|null|undefined} sessionName
 * @returns {'archived'|'waiting'|'paused'|'working'}
 */
function detectSessionState(sessionName) {
  if (!sessionName) return 'archived';
  if (!isTmuxSessionActive(sessionName)) return 'paused';

  const output = capturePaneText(sessionName);
  if (output === null) return 'paused';

  // Claude Code activity indicators — only present while Claude is actively processing.
  // timerPatterns covers all known Claude Code output variants showing active work.
  const timerPatterns = [
    /\(\s*\d+[ms]+\s*·\s*↓/,   // "(4m 19s · ↓" or "(30s · ↓"
    /·\s*↓\s*[\d.]+/,           // "· ↓ 539" or "· ↓ 3.2" standalone
    /·\s*↑\s*\d+.*·\s*↓/,      // "· ↑ 22 tokens · ↓ 539"
    /\(\s*thinking\s*\)/,        // "(thinking)"
    /·\s*thinking\)/,            // "· thinking)" existing variant
    /esc\s+to\s+interrupt/i,      // modern Claude Code active-processing footer
    /Bypassing\s+Permissions/i,    // visible during --dangerously-skip-permissions tool exec
    /^⏺\s+\w+\(/m,                 // tool-call indicator line (Write/Read/Bash/Edit)
    /tokens?\s*·\s*esc/i,          // token counter footer variant
    /\d+\s*tokens?\s+(?:used|·)/i, // standalone token counter
  ];
  for (const pattern of timerPatterns) {
    if (pattern.test(output)) return 'working';
  }

  // Unambiguous waiting-for-input prompts (numbered selection, y/n, explicit prompts)
  const waitingPatterns = [
    />\s+\d+\./,
    /\[y\/n\]/i,
    /\(y\/n\)/i,
    /Press Enter/i,
    /Select an option/i,
    /^Choice\s+\(/mi,
  ];
  for (const pattern of waitingPatterns) {
    if (pattern.test(output)) return 'waiting';
  }

  // Session exists but Claude isn't actively processing → waiting for user input
  return 'waiting';
}

/**
 * Test hook: skip real tmux calls, run pattern logic on provided string.
 * Used by server/__tests__/tmux.test.js to verify pattern coverage without tmux.
 * @param {string} output
 * @returns {'working'|'waiting'}
 */
function _testDetectFromOutput(output) {
  const timerPatterns = [
    /\(\s*\d+[ms]+\s*·\s*↓/,
    /·\s*↓\s*[\d.]+/,
    /·\s*↑\s*\d+.*·\s*↓/,
    /\(\s*thinking\s*\)/,
    /·\s*thinking\)/,
    /esc\s+to\s+interrupt/i,
    /Bypassing\s+Permissions/i,
    /^⏺\s+\w+\(/m,
    /tokens?\s*·\s*esc/i,
    /\d+\s*tokens?\s+(?:used|·)/i,
  ];
  const waitingPatterns = [
    />\s+\d+\./,
    /\[y\/n\]/i,
    /\(y\/n\)/i,
    /Press Enter/i,
    /Select an option/i,
    /^Choice\s+\(/mi,
  ];
  for (const p of timerPatterns) { if (p.test(output)) return 'working'; }
  for (const p of waitingPatterns) { if (p.test(output)) return 'waiting'; }
  return 'waiting';
}

/**
 * Poll for a tmux session to become idle (not 'working').
 * Resolves when detectSessionState returns anything other than 'working'.
 * Rejects with a timeout error if the session doesn't become idle in time.
 *
 * @param {string|null} sessionName
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<void>}
 */
function waitForIdle(sessionName, timeoutMs = 15000) {
  return _testWaitForIdle(detectSessionState, sessionName, timeoutMs);
}

/**
 * Test hook: injectable detectFn variant of waitForIdle.
 * Allows tests to provide a custom detect function without tmux calls.
 *
 * @param {Function} detectFn - (sessionName) => 'working'|'waiting'|'paused'|'archived'
 * @param {string|null} sessionName
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function _testWaitForIdle(detectFn, sessionName, timeoutMs) {
  if (!sessionName) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const start = Date.now();

    function poll() {
      const state = detectFn(sessionName);
      if (state !== 'working') {
        return resolve();
      }
      const elapsed = Date.now() - start;
      if (elapsed >= timeoutMs) {
        return reject(new Error(`Timeout waiting for idle session: ${sessionName}`));
      }
      const remaining = timeoutMs - elapsed;
      const delay = Math.min(1000, remaining);
      setTimeout(poll, delay);
    }

    poll();
  });
}

/**
 * Extract the last status line (working/completion indicator) from raw tmux text.
 * Looks for lines starting with ✻ or ✶ symbols, scanning from bottom up.
 * Returns the trimmed status text, or null if not found.
 * @param {string|null|undefined} rawText
 * @returns {string|null}
 */
function extractStatusLine(rawText) {
  if (!rawText) return null;
  const lines = rawText.split('\n');
  const statusPattern = /^[✻✶]/;
  for (let i = lines.length - 1; i >= 0; i--) {
    const clean = stripAnsi(lines[i]).trim();
    if (clean && statusPattern.test(clean)) return clean;
  }
  return null;
}

/**
 * Extract a meaningful "current task" preview line from a tmux capture-pane buffer.
 * Scans from bottom up in the last 20 lines, skips UI chrome (prompts, shortcuts,
 * box drawing, numeric selection menus, known Claude Code footer), strips leading
 * marker characters, and returns the first meaningful line (>= 4 chars after cleanup).
 * Returns null if no such line is found. Max 120 chars; longer lines truncated with "…".
 *
 * Intended for STAT-04 task preview — different from extractStatusLine (which looks
 * specifically for ✻/✶ spinner lines).
 *
 * @param {string|null|undefined} rawText
 * @returns {string|null}
 */
function extractCurrentTask(rawText) {
  if (!rawText) return null;
  const lines = rawText.split('\n');
  const chromePatterns = [
    /esc\s+to\s+interrupt/i,
    /\?\s+for\s+shortcuts/i,
    /^\s*\(y\/n\)/i,
    /Bypassing\s+Permissions/i,
    /bypass\s+permissions\s+on/i,
    /accept\s+edits\s+on/i,
    /^[⏵▶►]+\s*/,                        // footer permission indicators
    /^[-─═─\s]+$/,                       // separator lines
    /^\s*>?\s*\d+\.\s/,                  // numeric menu "1. Option"
    /^[✻✶⚡]/,                            // spinner/status lines
    /^\s*\d+\s+shells?/i,                // "4 shells still running"
    /context\s+left\s+until\s+auto/i,    // context usage footer
    /Try\s+"claude/i,                    // welcome message
    /^\s*╭|^\s*╰|^\s*│\s*$/,             // empty box-drawing lines
    /(Opus|Sonnet|Haiku)\s+[\d.]+.*context/i,  // status bar "Opus 4.6 (1M context)"
    /[█▓▒░]+/,                           // progress bar chars
    /^\s*[⬆↑]\s*\/gsd:/,                 // status bar command prefix
    /^\s*[⬆↑↓]\s+/,                      // other arrow-prefixed status lines
    /^\s*\d+:\s+\w+\s+\d+:/,             // session rating UI "1: Bad 2: Fine 3: Good"
    /Hashing…?/i,                        // tool progress (not user-visible task)
    /^Rate this session/i,
    /^Dismiss\s*$/i,
  ];

  // Strategy 1: find the most recent user input line. Claude Code wraps user
  // input in box-drawing chars like "│ > their request here │"
  // Scan the ENTIRE buffer (not just last N) because after a task completes
  // and a rating UI shows, the user input may be hundreds of lines back.
  for (let i = lines.length - 1; i >= 0; i--) {
    const clean = stripAnsi(lines[i]).trim();
    const promptMatch = clean.match(/^[│|]\s*>\s+(.+?)(?:\s*[│|])?$/) || clean.match(/^>\s+(.+)$/);
    if (promptMatch) {
      let content = promptMatch[1].replace(/[│|]+$/, '').trim();
      // Skip slash commands (they're not descriptive tasks)
      if (content.startsWith('/')) continue;
      if (content.length >= 4 && !chromePatterns.some((p) => p.test(content))) {
        if (content.length > 120) content = content.slice(0, 119) + '…';
        return content;
      }
    }
  }

  // Strategy 2: fall back to last meaningful non-chrome line in recent buffer
  const recentLines = lines.slice(-30);
  for (let i = recentLines.length - 1; i >= 0; i--) {
    let clean = stripAnsi(recentLines[i]).trim();
    if (!clean) continue;
    if (chromePatterns.some((p) => p.test(clean))) continue;
    clean = clean.replace(/^[│|>·⏺⏵▶►\s]+/, '').replace(/[│|]+$/, '').trim();
    if (clean.length < 4) continue;
    if (chromePatterns.some((p) => p.test(clean))) continue;
    if (clean.length > 120) clean = clean.slice(0, 119) + '…';
    return clean;
  }
  return null;
}

/**
 * Async variant of capturePaneText. Returns null on any error.
 * Uses execFile (non-blocking) instead of execFileSync.
 * @param {string} sessionName
 * @returns {Promise<string|null>}
 */
async function capturePaneTextAsync(sessionName) {
  try {
    const { stdout } = await execFileAsync('tmux', ['capture-pane', '-p', '-J', '-t', sessionName], { encoding: 'utf8', timeout: 2000 });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Async variant of detectSessionState. Returns the same string literals.
 * Uses capturePaneTextAsync to avoid blocking the event loop.
 * @param {string|null|undefined} sessionName
 * @returns {Promise<'archived'|'waiting'|'paused'|'working'>}
 */
async function detectSessionStateAsync(sessionName) {
  if (!sessionName) return 'archived';
  if (!(await isTmuxSessionActiveAsync(sessionName))) return 'paused';

  const output = await capturePaneTextAsync(sessionName);
  if (output === null) return 'paused';

  // Check the last 15 lines only (active Claude Code UI region, not scrollback).
  const recentLines = output.split('\n').slice(-15).join('\n');

  // Active timer check FIRST — if Claude shows a live animated timer
  // (e.g. "Architecting… (3m 13s · ↓ 5.0k tokens)"), it's actively working
  // regardless of whether an old session-rating UI is still visible above it.
  const timerPatterns = [
    /\(\s*\d+[ms]+\s*·\s*↓/,
    /·\s*↓\s*[\d.]+/,
    /·\s*↑\s*\d+.*·\s*↓/,
    /\(\s*thinking\s*\)/,
    /·\s*thinking\)/,
    /esc\s+to\s+interrupt/i,
    /Bypassing\s+Permissions/i,
    /^⏺\s+\w+\(/m,
    /tokens?\s*·\s*esc/i,
  ];
  for (const pattern of timerPatterns) {
    if (pattern.test(recentLines)) return 'working';
  }

  // No active timer — check "done" signals. Rating UI means Claude finished
  // and is waiting for user dismissal or a new task.
  const donePatterns = [
    /●\s+How is Claude doing this session/i,
    /Rate this session/i,
    /^\s*1:\s+Bad\s+2:\s+Fine\s+3:\s+Good/mi,
  ];
  for (const pattern of donePatterns) {
    if (pattern.test(recentLines)) return 'waiting';
  }

  // Output-change heuristic: if capture-pane content differs from the last
  // capture (or has recently changed within CHANGE_HEURISTIC_WINDOW_MS), the
  // session is actively producing output even when the timer UI isn't visible
  // (tool use, file edits, etc.). Fixes the STAT-02 false-"Waiting" bug.
  //
  // We strip the input box + footer before hashing so user typing into the
  // input field doesn't count as "working" output.
  const strippedForHash = stripInputBoxForHash(output);
  const hash = crypto.createHash('sha1').update(strippedForHash).digest('hex').slice(0, 16);
  const prev = paneHashCache.get(sessionName);
  const nowMs = Date.now();
  if (prev && prev.hash !== hash) {
    paneHashCache.set(sessionName, { hash, lastChangedAt: nowMs });
    return 'working';
  }
  if (prev && prev.hash === hash && (nowMs - prev.lastChangedAt) < CHANGE_HEURISTIC_WINDOW_MS) {
    return 'working';
  }
  if (!prev) paneHashCache.set(sessionName, { hash, lastChangedAt: nowMs });

  const waitingPatterns = [
    />\s+\d+\./,
    /\[y\/n\]/i,
    /\(y\/n\)/i,
    /Press Enter/i,
    /Select an option/i,
    /^Choice\s+\(/mi,
  ];
  for (const pattern of waitingPatterns) {
    if (pattern.test(output)) return 'waiting';
  }

  return 'waiting';
}

/**
 * Async variant of detectRateLimit. Uses capturePaneTextAsync to avoid blocking.
 * @param {string[]} sessionNames
 * @returns {Promise<{ active: boolean, resetAt: string|null }>}
 */
async function detectRateLimitAsync(sessionNames) {
  const results = await Promise.all(
    sessionNames.filter(Boolean).map(async (name) => {
      if (!(await isTmuxSessionActiveAsync(name))) return null;
      const text = await capturePaneTextAsync(name);
      if (!text) return null;
      const recent = text.split('\n').slice(-10).join('\n');
      for (const pattern of RATE_LIMIT_PATTERNS) {
        if (pattern.test(recent)) {
          const resetAt = parseResetTime(recent);
          return { active: true, resetAt: resetAt ? resetAt.toISOString() : null };
        }
      }
      return null;
    })
  );
  const hit = results.find(Boolean);
  return hit ?? { active: false, resetAt: null };
}

module.exports = { isTmuxSessionActive, isTmuxSessionActiveAsync, capturePaneText, detectSessionState, detectRateLimit, extractStatusLine, extractCurrentTask, _testDetectFromOutput, waitForIdle, _testWaitForIdle, capturePaneTextAsync, detectSessionStateAsync, detectRateLimitAsync, _testDetectWithChangeHeuristic, _resetPaneHashCache };
