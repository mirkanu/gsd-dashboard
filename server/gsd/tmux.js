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

  const waitingPatterns = [
    />\s+\d+\./,
    /\?\s/,
    /Press Enter/i,
    /Select an option/i,
  ];
  for (const pattern of waitingPatterns) {
    if (pattern.test(output)) return 'waiting';
  }

  const pausedPatterns = [
    /out of credit/i,
    /insufficient credits/i,
    /rate limit/i,
  ];
  for (const pattern of pausedPatterns) {
    if (pattern.test(output)) return 'paused';
  }

  return 'working';
}

module.exports = { isTmuxSessionActive, detectSessionState };
