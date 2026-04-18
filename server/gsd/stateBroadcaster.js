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

  // Quick task 260418-khw: when a waiting pane has busy markers, emit
  // state='working' (user's mental model: waiting = needs human input).
  // stateEnteredAt tracks the raw pane transition so "how long waiting"
  // stays correct across marker appear/clear cycles.
  const effectiveState =
    sessionState === 'waiting' && busy_markers ? 'working' : sessionState;

  const prev = snapshot.get(project.name);
  const nowIso = new Date().toISOString();

  if (!prev) {
    // Initial seed — record silently, no broadcast (avoid boot-time broadcast storm)
    snapshot.set(project.name, {
      sessionState: effectiveState,
      rawPaneState: sessionState,
      stateEnteredAt: nowIso,
      currentTask,
      statusText,
      ...(busy_markers ? { busy_markers } : {}),
    });
    return false;
  }

  // Detect pane-state transitions via rawPaneState (fallback to sessionState
  // for snapshots seeded pre-pivot).
  const prevRaw = prev.rawPaneState ?? prev.sessionState;
  const paneTransitioned = prevRaw !== sessionState;

  if (!paneTransitioned) {
    // Same pane state — keep stateEnteredAt, may still need to broadcast if
    // markers appeared/cleared/changed (which can also flip effectiveState
    // between waiting↔working for a stable pane-waiting session).
    snapshot.set(project.name, {
      sessionState: effectiveState,
      rawPaneState: sessionState,
      stateEnteredAt: prev.stateEnteredAt,
      currentTask,
      statusText,
      ...(busy_markers ? { busy_markers } : {}),
    });
    const prevKey = prev.busy_markers ? JSON.stringify(prev.busy_markers) : '';
    const nextKey = busy_markers ? JSON.stringify(busy_markers) : '';
    if (prevKey !== nextKey) {
      broadcastFn('project_state_change', {
        project: project.name,
        sessionState: effectiveState,
        statusText,
        currentTask,
        stateEnteredAt: prev.stateEnteredAt,
        ...(busy_markers ? { busy_markers } : {}),
      });
      return true;
    }
    return false;
  }

  // Pane-state transitioned — update snapshot and broadcast
  const entry = {
    sessionState: effectiveState,
    rawPaneState: sessionState,
    stateEnteredAt: nowIso,
    currentTask,
    statusText,
    ...(busy_markers ? { busy_markers } : {}),
  };
  snapshot.set(project.name, entry);
  broadcastFn('project_state_change', {
    project: project.name,
    sessionState: effectiveState,
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
