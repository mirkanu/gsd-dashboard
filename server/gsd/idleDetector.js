'use strict';

const fs = require('fs');
const path = require('path');
const { paneHashCache, detectSessionStateAsync } = require('./tmux');
const { gracefulShutdown } = require('./gracefulShutdown');
const { getTmuxCostForSession, logDailyTmuxCosts } = require('./costMeasurement');
const busyMarkers = require('./busyMarkers');
const verifyOrchestrator = require('./verifyOrchestrator');

const DEFAULT_IDLE_THRESHOLD_MS = 120 * 60 * 1000; // 2 hours
// Quick task 260418-khw: 6h force-kill branch removed — user prefers manual
// intervention over auto-kill for stuck working sessions.
const POLL_INTERVAL_MS = 60 * 1000; // 60 seconds

const IDLE_SKIP_LOG_PATH = path.resolve(__dirname, '../../data/logs/idle-skip.log');

/**
 * Append a single JSONL line to data/logs/idle-skip.log documenting a skip decision.
 * Never throws — audit logging must not break the idle detector.
 */
function _testAppendSkipLog(entry) {
  try {
    fs.mkdirSync(path.dirname(IDLE_SKIP_LOG_PATH), { recursive: true });
    fs.appendFileSync(IDLE_SKIP_LOG_PATH, JSON.stringify(entry) + '\n');
  } catch {
    // Never let audit logging break the idle detector
  }
}

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
    getCostFn = getTmuxCostForSession,
    logCostFn = logDailyTmuxCosts,
    isAutopilotFn = hasActiveAutopilotRun,
    getThresholdFn = getIdleThresholdMs,
    hasBusyMarkersFn = busyMarkers.hasBusyMarkers,
    getBusyMarkersFn = busyMarkers.getMarkers,
    logSkipFn = _testAppendSkipLog,
    isVerifyingFn = verifyOrchestrator.isVerifying,
  } = fns;

  const thresholdMs = getThresholdFn();
  if (thresholdMs === 0) return null; // auto-close disabled

  const state = await detectFn(project.tmux_session);

  // Quick task 260418-khw: 6h force-kill branch removed. Working sessions are
  // simply not auto-closed — user prefers manual intervention.
  if (state === 'working') return null;

  // Autopilot sessions use 2× threshold
  const isAutopilot = isAutopilotFn(project.name);
  const effectiveThresholdMs = isAutopilot ? thresholdMs * 2 : thresholdMs;

  const idle = await _testIsSessionIdle(project.tmux_session, effectiveThresholdMs, { detectFn, paneCache, nowMs });
  if (!idle) return null;

  // Phase 53: skip auto-close when a verify is currently running for this project
  if (isVerifyingFn(project.name)) {
    logSkipFn({
      ts: new Date(nowMs).toISOString(),
      session: project.tmux_session,
      project: project.name,
      reason: 'verify-in-progress',
    });
    return {
      action: 'skipped',
      reason: 'verify-in-progress',
      project: project.name,
    };
  }

  // Busy-marker awareness — skip auto-close when Claude is waiting on its own in-flight
  // background work (bash_bg, agent, wakeup). Every skip is logged as JSONL for audit.
  if (hasBusyMarkersFn(project.tmux_session)) {
    const markers = getBusyMarkersFn(project.tmux_session);
    logSkipFn({
      ts: new Date(nowMs).toISOString(),
      session: project.tmux_session,
      project: project.name,
      reason: 'busy-markers-present',
      markers,
    });
    return {
      action: 'skipped',
      reason: 'busy-markers-present',
      project: project.name,
      markers,
    };
  }

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
  startIdleDetector,
  _testIsSessionIdle,
  _testCheckAndCloseSession,
  hasActiveAutopilotRun,
  _testAppendSkipLog,
  IDLE_SKIP_LOG_PATH,
};
