'use strict';

const { execFileSync } = require('child_process');
const { paneHashCache, detectSessionStateAsync } = require('./tmux');
const { gracefulShutdown } = require('./gracefulShutdown');
const { getTmuxCostForSession, logDailyTmuxCosts } = require('./costMeasurement');

const DEFAULT_IDLE_THRESHOLD_MS = 120 * 60 * 1000; // 2 hours
const FORCE_KILL_WORKING_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours
const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * Read idle threshold from app_settings. Falls back to 120 minutes.
 * Returns 0 if disabled (threshold = 0 means "never auto-close").
 */
function getIdleThresholdMs() {
  try {
    const { getSecret } = require('../crypto');
    const val = getSecret('idle_timeout_minutes');
    if (val == null) return DEFAULT_IDLE_THRESHOLD_MS;
    const mins = parseInt(val, 10);
    if (isNaN(mins)) return DEFAULT_IDLE_THRESHOLD_MS;
    return mins * 60 * 1000; // 0 means disabled
  } catch {
    return DEFAULT_IDLE_THRESHOLD_MS;
  }
}

/**
 * Check if a project has an active autopilot run.
 * Returns true if status IN ('idle', 'running') — these sessions need 2× threshold.
 */
function hasActiveAutopilotRun(projectName, dbOverride) {
  try {
    const db = dbOverride || require('../db').db;
    const row = db.prepare(
      "SELECT COUNT(*) as cnt FROM autopilot_runs WHERE project_id = ? AND status IN ('idle', 'running')"
    ).get(projectName);
    return row && row.cnt > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a session is idle.
 *
 * Accepts two calling signatures:
 *
 * 1. Pure options object (used by tests and simple callers):
 *    isSessionIdle(sessionName, { sessionState, lastChangedAt, threshold, isAutopilot })
 *    Returns Promise<boolean>
 *
 * 2. Injectable async variant (used internally by _testCheckAndCloseSession):
 *    _testIsSessionIdle(sessionName, thresholdMs, { detectFn, paneCache, nowMs })
 *    Returns Promise<boolean>
 *
 * Both are wired through the same underlying logic.
 *
 * @param {string} sessionName
 * @param {number|object} thresholdMsOrOpts
 * @param {object} [fns]
 * @returns {Promise<boolean>}
 */
async function isSessionIdle(sessionName, thresholdMsOrOpts, fns = {}) {
  // Detect calling signature
  if (thresholdMsOrOpts !== null && typeof thresholdMsOrOpts === 'object') {
    // Options-object signature: { sessionState, lastChangedAt, threshold, isAutopilot }
    const { sessionState, lastChangedAt, threshold = DEFAULT_IDLE_THRESHOLD_MS, isAutopilot = false } = thresholdMsOrOpts;

    if (sessionState !== 'waiting') return false;
    if (!lastChangedAt) return false;

    const effectiveThreshold = isAutopilot ? threshold * 2 : threshold;
    const elapsed = Date.now() - lastChangedAt;
    return elapsed > effectiveThreshold;
  }

  // Injectable async signature: (sessionName, thresholdMs, fns)
  const thresholdMs = typeof thresholdMsOrOpts === 'number' ? thresholdMsOrOpts : DEFAULT_IDLE_THRESHOLD_MS;
  const {
    detectFn = detectSessionStateAsync,
    paneCache = paneHashCache,
    nowMs = Date.now(),
  } = fns;

  const state = await detectFn(sessionName);
  if (state !== 'waiting') return false;

  const cacheEntry = paneCache.get(sessionName);
  if (!cacheEntry || !cacheEntry.lastChangedAt) return false;

  const elapsed = nowMs - cacheEntry.lastChangedAt;
  return elapsed > thresholdMs;
}

// Alias for internal use in _testCheckAndCloseSession
async function _testIsSessionIdle(sessionName, thresholdMs, fns = {}) {
  return isSessionIdle(sessionName, thresholdMs, fns);
}

/**
 * Check if a working session has been stuck (no pane change) for > FORCE_KILL threshold.
 * Injectable for tests: accepts { paneCache, nowMs }.
 */
function _isStuckWorking(sessionName, fns = {}) {
  const { paneCache = paneHashCache, nowMs = Date.now() } = fns;
  const entry = paneCache.get(sessionName);
  if (!entry || !entry.lastChangedAt) return false;
  return (nowMs - entry.lastChangedAt) > FORCE_KILL_WORKING_THRESHOLD_MS;
}

function _forceKill(sessionName) {
  try {
    execFileSync('tmux', ['kill-session', '-t', sessionName], { stdio: 'ignore', timeout: 5000 });
  } catch { /* already dead */ }
}

/**
 * Force-kill a working session that has been stuck for > forceKillThresholdMs.
 * Used by tests and internal idle detector loop.
 *
 * @param {string} sessionName
 * @param {string} projectName
 * @param {object} opts - { sessionState, stateEnteredAt, forceKillThresholdMs, killFn, gracefulShutdownFn, notifyFn }
 * @returns {Promise<{ forceKilled: boolean }>}
 */
async function forceKillIfOverdue(sessionName, projectName, opts = {}) {
  const {
    sessionState,
    stateEnteredAt,
    forceKillThresholdMs = FORCE_KILL_WORKING_THRESHOLD_MS,
    killFn = _forceKill,
    gracefulShutdownFn = gracefulShutdown,
    notifyFn = async () => {},
  } = opts;

  if (sessionState !== 'working') {
    return { forceKilled: false };
  }

  const enteredAt = stateEnteredAt ? new Date(stateEnteredAt).getTime() : null;
  if (!enteredAt) return { forceKilled: false };

  const elapsed = Date.now() - enteredAt;
  if (elapsed <= forceKillThresholdMs) return { forceKilled: false };

  // Force-kill — no graceful shutdown
  killFn(sessionName);
  await notifyFn(projectName, `Working session force-killed after being stuck for ${Math.round(elapsed / 3600000)}h with no pane change.`);

  return { forceKilled: true };
}

/**
 * Check and potentially close a single project session.
 * Injectable for tests via fns parameter.
 */
async function _testCheckAndCloseSession(project, fns = {}) {
  if (!project || project.archived || !project.tmux_session) return null;

  const {
    detectFn = detectSessionStateAsync,
    paneCache = paneHashCache,
    nowMs = Date.now(),
    gracefulShutdownFn = gracefulShutdown,
    forceKillFn = _forceKill,
    getCostFn = getTmuxCostForSession,
    logCostFn = logDailyTmuxCosts,
    isAutopilotFn = hasActiveAutopilotRun,
    getThresholdFn = getIdleThresholdMs,
  } = fns;

  const thresholdMs = getThresholdFn();
  if (thresholdMs === 0) return null; // auto-close disabled

  const state = await detectFn(project.tmux_session);

  // Force-kill hung working sessions (> 6h with no pane change)
  if (state === 'working') {
    if (_isStuckWorking(project.tmux_session, { paneCache, nowMs })) {
      forceKillFn(project.tmux_session);
      const cost = getCostFn(project.tmux_session);
      logCostFn([{ sessionName: project.tmux_session, dailyCostUsd: cost.dailyCostUsd, rssGb: cost.rssGb }]);
      return { action: 'force-killed', reason: 'stuck-working-6h', project: project.name };
    }
    return null;
  }

  // Autopilot sessions use 2× threshold
  const isAutopilot = isAutopilotFn(project.name);
  const effectiveThresholdMs = isAutopilot ? thresholdMs * 2 : thresholdMs;

  const idle = await _testIsSessionIdle(project.tmux_session, effectiveThresholdMs, { detectFn, paneCache, nowMs });
  if (!idle) return null;

  // Graceful shutdown
  const result = await gracefulShutdownFn(project.tmux_session, project.name);
  const cost = getCostFn(project.tmux_session);
  logCostFn([{ sessionName: project.tmux_session, dailyCostUsd: cost.dailyCostUsd, rssGb: cost.rssGb }]);

  return {
    action: 'graceful-shutdown',
    pauseWorkCompleted: result.pauseWorkCompleted,
    project: project.name,
    isAutopilot,
  };
}

/**
 * Start the idle detector background loop.
 * Runs every 60s, checks all projects.
 * @param {Function} loadProjectsFn - () => { projects: Array }
 * @returns {Function} stop function
 */
function startIdleDetector(loadProjectsFn) {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const config = loadProjectsFn() || {};
      const projects = Array.isArray(config.projects) ? config.projects : [];
      for (const p of projects) {
        await _testCheckAndCloseSession(p);
      }
    } catch {
      // Tick failure — retry next interval silently
    }
    if (!stopped) setTimeout(tick, POLL_INTERVAL_MS);
  }

  // First tick after 5 minutes at startup (avoid killing sessions on fresh deploy)
  setTimeout(tick, 5 * 60 * 1000);
  return () => { stopped = true; };
}

module.exports = {
  isSessionIdle,
  forceKillIfOverdue,
  startIdleDetector,
  _testIsSessionIdle,
  _testCheckAndCloseSession,
  hasActiveAutopilotRun,
};
