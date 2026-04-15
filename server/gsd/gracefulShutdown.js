'use strict';

const { execFileSync } = require('child_process');
const { isTmuxSessionActive, capturePaneText } = require('./tmux');
const { sendNotification } = require('./telegram');

const PAUSE_WORK_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;
const GRACE_BUFFER_MS = 1_000;

// Markers indicating /gsd:pause-work completed successfully in the pane
const PAUSE_WORK_MARKERS = [
  /wip:/i,            // commit message "wip: [phase] paused at task X/Y"
  /Handoff created/i,
  /commit [a-f0-9]{7}/i,
];

function _sendKeysToTmux(sessionName, text) {
  execFileSync('tmux', ['send-keys', '-t', sessionName, text, 'Enter'], { stdio: 'ignore', timeout: 5000 });
}

function _killTmuxSession(sessionName) {
  execFileSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore', timeout: 5000 });
}

async function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Injectable test variant. All I/O goes through injected functions.
 * Real gracefulShutdown() calls this with production implementations.
 *
 * @param {string} sessionName - tmux session name
 * @param {string} projectName - project name for Telegram notifications
 * @param {object} opts - optional overrides: { pauseWorkTimeout, graceBuffer }
 * @param {object} fns - injectable I/O functions for testing
 * @returns {Promise<{ok: boolean, pauseWorkCompleted: boolean, message?: string}>}
 */
async function _testGracefulShutdown(sessionName, projectName, opts = {}, fns = {}) {
  const {
    isTmuxActiveFn = isTmuxSessionActive,
    sendKeysFn = _sendKeysToTmux,
    captureFn = capturePaneText,
    killFn = _killTmuxSession,
    notifyFn = sendNotification,
    sleepFn = _sleep,
  } = fns;

  const timeout = opts.pauseWorkTimeout ?? PAUSE_WORK_TIMEOUT_MS;
  const graceBuffer = opts.graceBuffer ?? GRACE_BUFFER_MS;

  if (!isTmuxActiveFn(sessionName)) {
    return { ok: true, message: 'Session already inactive', pauseWorkCompleted: false };
  }

  // Send /gsd:pause-work into pane
  sendKeysFn(sessionName, '/gsd:pause-work');

  // Poll for completion markers
  const deadline = Date.now() + timeout;
  let pauseWorkCompleted = false;

  while (Date.now() < deadline) {
    await sleepFn(POLL_INTERVAL_MS);
    const captured = captureFn(sessionName);
    if (captured && PAUSE_WORK_MARKERS.some(p => p.test(captured))) {
      pauseWorkCompleted = true;
      break;
    }
  }

  // Grace buffer before kill (only when pause-work succeeded)
  if (pauseWorkCompleted) await sleepFn(graceBuffer);

  // Kill session (ignore errors — session may have exited on its own)
  try { killFn(sessionName); } catch { /* session already dead */ }

  // Telegram notification
  if (pauseWorkCompleted) {
    await notifyFn(projectName, `Idle session auto-closed after idle threshold. Handoff saved via /gsd:pause-work.`);
  } else {
    await notifyFn(projectName, `Idle session killed but pause-work timed out — manual /gsd:resume-work checkpoint may be needed for project ${projectName}.`);
  }

  return { ok: true, pauseWorkCompleted };
}

/**
 * Gracefully shut down a tmux session by sending /gsd:pause-work,
 * polling for completion, then killing the session and sending a Telegram notification.
 *
 * @param {string} sessionName - tmux session name
 * @param {string} projectName - project name for Telegram notifications
 * @param {object} opts - optional overrides: { pauseWorkTimeout, graceBuffer }
 * @returns {Promise<{ok: boolean, pauseWorkCompleted: boolean, message?: string}>}
 */
async function gracefulShutdown(sessionName, projectName, opts = {}) {
  return _testGracefulShutdown(sessionName, projectName, opts);
}

module.exports = { gracefulShutdown, _testGracefulShutdown };
