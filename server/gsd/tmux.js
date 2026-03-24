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

module.exports = { isTmuxSessionActive };
