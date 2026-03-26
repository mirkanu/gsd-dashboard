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

  let output;
  try {
    output = execFileSync('tmux', ['capture-pane', '-p', '-t', sessionName], { encoding: 'utf8' });
  } catch {
    return 'paused';
  }

  // Claude Code activity indicator — only present while Claude is actively processing.
  // Matches the timer in the status line: "(4m 19s · ↓ 539 tokens" or "(30s · ↓"
  // This takes priority over everything else: if the timer is visible, Claude is working.
  if (/·\s*↓\s*[\d.]+/.test(output) || /·\s*thinking\)/.test(output)) {
    return 'working';
  }

  const pausedPatterns = [
    /out of credit/i,
    /insufficient credits/i,
    /rate limit/i,
  ];
  for (const pattern of pausedPatterns) {
    if (pattern.test(output)) return 'paused';
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

module.exports = { isTmuxSessionActive, detectSessionState };
