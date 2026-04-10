'use strict';

// Proxy-mode state broadcaster.
//
// Runs on Railway (where GSD_DATA_URL is set and tmux is not available).
// Polls the upstream /api/gsd/projects every 2s, diffs each project's
// sessionState against the previous snapshot, and broadcasts a
// `project_state_change` WebSocket message when a transition is detected.
//
// This is the proxy-side counterpart to stateBroadcaster.js (which runs
// on the local machine where tmux lives). Both push the same WS message
// shape so the client can handle them identically.

const DEFAULT_POLL_INTERVAL_MS = 2000;

// projectName -> { sessionState, stateEnteredAt, currentTask, statusText }
const snapshot = new Map();

/**
 * Poll upstream and broadcast any state transitions.
 * Exported for unit testing via dependency injection.
 *
 * @param {Function} fetchProjectsFn - async () => { projects: Array }
 * @param {Function} broadcastFn - (type, data) => void
 * @returns {Promise<number>} number of transitions broadcast
 */
async function _pollUpstreamOnce(fetchProjectsFn, broadcastFn) {
  let payload;
  try {
    payload = await fetchProjectsFn();
  } catch {
    // Upstream unreachable — preserve snapshot, skip tick silently
    return 0;
  }

  const projects = Array.isArray(payload?.projects) ? payload.projects : [];
  let transitions = 0;

  for (const p of projects) {
    if (!p || !p.name) continue;

    const sessionState = p.sessionState || 'archived';
    const currentTask = p.currentTask ?? null;
    const statusText = p.statusText ?? null;
    const stateEnteredAt = p.stateEnteredAt ?? new Date().toISOString();

    const prev = snapshot.get(p.name);

    if (!prev) {
      // Initial seed — record silently, no broadcast
      snapshot.set(p.name, { sessionState, stateEnteredAt, currentTask, statusText });
      continue;
    }

    if (prev.sessionState === sessionState) {
      // Same state — refresh task/status but keep enteredAt
      snapshot.set(p.name, {
        sessionState,
        stateEnteredAt: prev.stateEnteredAt,
        currentTask,
        statusText,
      });
      continue;
    }

    // Transition detected — broadcast
    snapshot.set(p.name, { sessionState, stateEnteredAt, currentTask, statusText });
    broadcastFn('project_state_change', {
      project: p.name,
      sessionState,
      statusText,
      currentTask,
      stateEnteredAt,
    });
    transitions++;
  }

  return transitions;
}

/**
 * Start the proxy poller. Fires 500ms after call, then every intervalMs.
 *
 * @param {string} upstreamUrl - GSD_DATA_URL (without trailing slash)
 * @param {Function} broadcastFn - (type, data) => void
 * @param {number} [intervalMs]
 * @returns {Function} stop function
 */
function startProxyStateBroadcaster(upstreamUrl, broadcastFn, intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  if (!upstreamUrl) return () => {};
  let stopped = false;

  async function fetchProjects() {
    const res = await fetch(`${upstreamUrl}/api/gsd/projects`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    return res.json();
  }

  async function tick() {
    if (stopped) return;
    try {
      await _pollUpstreamOnce(fetchProjects, broadcastFn);
    } catch {
      // Swallow — retry next tick
    }
    if (!stopped) setTimeout(tick, intervalMs);
  }

  setTimeout(tick, 500);

  return () => {
    stopped = true;
  };
}

function _resetSnapshot() {
  snapshot.clear();
}

module.exports = {
  startProxyStateBroadcaster,
  _pollUpstreamOnce,
  _resetSnapshot,
};
