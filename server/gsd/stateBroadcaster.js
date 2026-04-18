'use strict';

const {
  detectSessionStateAsync,
  capturePaneTextAsync,
  extractCurrentTask,
  extractStatusLine,
} = require('./tmux');
const busyMarkers = require('./busyMarkers');

// In-memory snapshot: projectName -> { sessionState, stateEnteredAt, currentTask, statusText, busy_markers? }
const snapshot = new Map();

const DEFAULT_POLL_INTERVAL_MS = 2000;

/**
 * Poll a single project once and, if state changed, update snapshot + broadcast.
 * Exposed as _testPollOnce for unit tests via dependency injection.
 * @param {{ name: string, tmux_session: string|null, archived?: boolean }} project
 * @param {Function} detectFn - async (sessionName) => state
 * @param {Function} captureFn - async (sessionName) => string|null
 * @param {Function} broadcastFn - (type, data) => void
 * @param {Function} [getBusyMarkersFn] - (sessionName) => { count, kinds } (injectable for tests)
 * @returns {Promise<boolean>} true if a transition was broadcast
 */
async function _testPollOnce(
  project,
  detectFn,
  captureFn,
  broadcastFn,
  getBusyMarkersFn = busyMarkers.getMarkers,
) {
  if (!project || project.archived || !project.tmux_session) return false;

  let sessionState;
  let paneText = null;
  try {
    sessionState = await detectFn(project.tmux_session);
    paneText = await captureFn(project.tmux_session);
  } catch {
    // Transient tmux failure — preserve snapshot, skip tick silently
    return false;
  }

  const currentTask = extractCurrentTask(paneText);
  const statusText =
    sessionState === 'working' ? (extractStatusLine(paneText) || null) : null;

  // Cheap: per-session JSON file read (Plan 01 contract); self-purges expired.
  let markersInfo = null;
  try {
    markersInfo = getBusyMarkersFn(project.tmux_session);
  } catch {
    markersInfo = null;
  }
  const busy_markers =
    markersInfo && markersInfo.count > 0 ? markersInfo : undefined;

  const prev = snapshot.get(project.name);
  const nowIso = new Date().toISOString();

  if (!prev) {
    // Initial seed — record silently, no broadcast (avoid boot-time broadcast storm)
    snapshot.set(project.name, {
      sessionState,
      stateEnteredAt: nowIso,
      currentTask,
      statusText,
      ...(busy_markers ? { busy_markers } : {}),
    });
    return false;
  }

  if (prev.sessionState === sessionState) {
    // Same state — keep stateEnteredAt, refresh currentTask / statusText
    snapshot.set(project.name, {
      sessionState,
      stateEnteredAt: prev.stateEnteredAt,
      currentTask,
      statusText,
      ...(busy_markers ? { busy_markers } : {}),
    });
    // Broadcast on busy_markers change within same state (newly appeared / kinds or count changed / cleared).
    const prevKey = prev.busy_markers ? JSON.stringify(prev.busy_markers) : '';
    const nextKey = busy_markers ? JSON.stringify(busy_markers) : '';
    if (prevKey !== nextKey) {
      broadcastFn('project_state_change', {
        project: project.name,
        sessionState,
        statusText,
        currentTask,
        stateEnteredAt: prev.stateEnteredAt,
        ...(busy_markers ? { busy_markers } : {}),
      });
      return true;
    }
    return false;
  }

  // Transition — update snapshot and broadcast
  const entry = {
    sessionState,
    stateEnteredAt: nowIso,
    currentTask,
    statusText,
    ...(busy_markers ? { busy_markers } : {}),
  };
  snapshot.set(project.name, entry);
  broadcastFn('project_state_change', {
    project: project.name,
    sessionState,
    statusText,
    currentTask,
    stateEnteredAt: nowIso,
    ...(busy_markers ? { busy_markers } : {}),
  });
  return true;
}

/**
 * Start the background poller. Fire-and-forget — never blocks startup.
 * Uses recursive setTimeout (not setInterval) to avoid overlapping ticks when
 * a poll pass takes longer than the interval.
 *
 * @param {Function} loadProjectsFn - () => { projects: Array }
 * @param {Function} broadcastFn - (type, data) => void
 * @param {number} [intervalMs]
 * @returns {Function} stop function (for tests)
 */
function startStateBroadcaster(loadProjectsFn, broadcastFn, intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const config = loadProjectsFn() || {};
      const projects = Array.isArray(config.projects) ? config.projects : [];
      await Promise.all(
        projects.map((p) =>
          _testPollOnce(p, detectSessionStateAsync, capturePaneTextAsync, broadcastFn)
        )
      );
    } catch {
      // Config load failure — retry next tick silently
    }
    if (!stopped) setTimeout(tick, intervalMs);
  }

  // Kick off first tick after a small delay so server startup is not blocked.
  setTimeout(tick, 500);

  return () => {
    stopped = true;
  };
}

function getProjectStateSnapshot() {
  const out = {};
  for (const [name, entry] of snapshot.entries()) {
    out[name] = { ...entry };
  }
  return out;
}

function _resetSnapshot() {
  snapshot.clear();
}

module.exports = {
  startStateBroadcaster,
  getProjectStateSnapshot,
  _testPollOnce,
  _resetSnapshot,
};
