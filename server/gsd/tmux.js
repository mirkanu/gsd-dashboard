'use strict';

const { execFileSync, execFile } = require('child_process');
const { promisify } = require('util');
const stripAnsi = require('strip-ansi');

const execFileAsync = promisify(execFile);

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
  if (!isTmuxSessionActive(sessionName)) return 'paused';

  const output = await capturePaneTextAsync(sessionName);
  if (output === null) return 'paused';

  const timerPatterns = [
    /\(\s*\d+[ms]+\s*·\s*↓/,
    /·\s*↓\s*[\d.]+/,
    /·\s*↑\s*\d+.*·\s*↓/,
    /\(\s*thinking\s*\)/,
    /·\s*thinking\)/,
  ];
  for (const pattern of timerPatterns) {
    if (pattern.test(output)) return 'working';
  }

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
  for (const name of sessionNames) {
    if (!name || !isTmuxSessionActive(name)) continue;
    const text = await capturePaneTextAsync(name);
    if (!text) continue;
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

module.exports = { isTmuxSessionActive, capturePaneText, detectSessionState, detectRateLimit, extractStatusLine, _testDetectFromOutput, waitForIdle, _testWaitForIdle, capturePaneTextAsync, detectSessionStateAsync, detectRateLimitAsync };
