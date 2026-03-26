'use strict';

const { execFileSync } = require('child_process');

/**
 * Check whether a named tmux session exists and is running.
 * Returns false for falsy input or any error (tmux not found, session absent, etc.).
 * Never throws.
 */
function isTmuxSessionActive(sessionName) {
  if (!sessionName) return false;
  try {
    execFileSync('tmux', ['has-session', '-t', sessionName], { stdio: 'ignore' });
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
    return execFileSync('tmux', ['capture-pane', '-p', '-t', sessionName], { encoding: 'utf8' });
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

  // Claude Code activity indicator — only present while Claude is actively processing.
  // Matches the timer in the status line: "(4m 19s · ↓ 539 tokens" or "(30s · ↓"
  // This takes priority over everything else: if the timer is visible, Claude is working.
  if (/·\s*↓\s*[\d.]+/.test(output) || /·\s*thinking\)/.test(output)) {
    return 'working';
  }

  // Unambiguous waiting-for-input prompts (numbered selection, y/n, explicit prompts)
  const waitingPatterns = [
    />\s+\d+\./,
    /\[y\/n\]/i,
    /\(y\/n\)/i,
    /Press Enter/i,
    /Select an option/i,
  ];
  for (const pattern of waitingPatterns) {
    if (pattern.test(output)) return 'waiting';
  }

  // Session exists but Claude isn't actively processing → waiting for user input
  return 'waiting';
}

module.exports = { isTmuxSessionActive, detectSessionState, detectRateLimit };
