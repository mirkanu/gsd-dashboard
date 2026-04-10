---
phase: 43-project-status-accuracy
plan: 02
subsystem: backend-realtime
tags: [websocket, state-broadcaster, poller, projects-api, stat-01, stat-03, stat-04]

# Dependency graph
requires:
  - phase: 43-01
    provides: detectSessionStateAsync, capturePaneTextAsync, extractCurrentTask, extractStatusLine
provides:
  - server/gsd/stateBroadcaster.js — background state poller with in-memory snapshot
  - project_state_change WebSocket message — sub-second transition push
  - /api/gsd/projects response fields: stateEnteredAt (ISO), currentTask (string|null)
  - getProjectStateSnapshot() — canonical source for client-side elapsed-time rendering
affects: [43-03-project-status-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Silent initial seed: first observation of a project never broadcasts — avoids boot-time broadcast storms"
    - "Recursive setTimeout loop (not setInterval) to prevent overlapping ticks when a poll pass takes longer than the interval"
    - "Dependency-injected _testPollOnce: unit tests provide fake detect/capture/broadcast functions, no tmux touched"
    - "Snapshot-preferred merge in GET /projects: broadcaster snapshot wins when sessionState matches, fresh capture is fallback"

key-files:
  created:
    - server/gsd/stateBroadcaster.js
    - server/__tests__/stateBroadcaster.test.js
    - .planning/phases/43-project-status-accuracy/43-02-SUMMARY.md
  modified:
    - server/index.js
    - server/routes/gsd.js

key-decisions:
  - "Silent initial seed — first poll of a fresh project records state + stateEnteredAt but does NOT broadcast. Avoids a burst of project_state_change messages every time the server (re)starts."
  - "2000ms default poll interval — fast enough for sub-second perceived transitions after first tick, slow enough to keep tmux capture-pane off the hot path."
  - "Proxy mode gating via !process.env.GSD_DATA_URL — Railway (proxy) never polls tmux (it has none); the upstream local server is the single source of truth, and Railway forwards snapshots through the existing projects cache."
  - "Broadcaster runs via recursive setTimeout — overlapping ticks impossible even if a poll pass is slow."
  - "Route-level snapshot-preferred merge: when snapshot.sessionState matches detected state we use snapshot.stateEnteredAt (canonical transition moment). On a miss — e.g. the broadcaster has not yet observed the project, or it just transitioned since the snapshot — we fall back to a fresh capture + `now` as the entry moment. This keeps API responses consistent with WebSocket messages when they agree and safely degrades when they don't."
  - "Transient detect/capture failures are swallowed per-project — the poller continues, the previous snapshot entry is preserved. Matches the existing silent-fail style in routes/gsd.js and honors 'non-blocking hook ingestion behavior' rule."

patterns-established:
  - "In-memory Map snapshot keyed by project name, exposed through getProjectStateSnapshot() — any future route can read the last known state without hitting tmux."
  - "WebSocket message pattern: `{ type: 'project_state_change', data: { project, sessionState, statusText, currentTask, stateEnteredAt } }` — a stable shape Plan 03 will consume in GSD.tsx."

requirements-completed: [STAT-01, STAT-03, STAT-04]

# Metrics
duration: ~15min
completed: 2026-04-06
---

# Phase 43 Plan 02: Background State Broadcaster + Projects API Augmentation Summary

**Server-side push layer for real-time project state: a 2s tmux poller broadcasts `project_state_change` over the existing WebSocket, and `/api/gsd/projects` now carries `stateEnteredAt` and `currentTask` so clients can render live elapsed time and task previews without extra round trips.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-06
- **Tasks:** 2 (Task 1 TDD, Task 2 wiring)
- **Files created:** 2
- **Files modified:** 2
- **New tests:** 8 (all green)

## Accomplishments

- **New module `server/gsd/stateBroadcaster.js`** — background poller with an in-memory Map snapshot per project. Exports `startStateBroadcaster`, `getProjectStateSnapshot`, `_testPollOnce`, `_resetSnapshot`.
- **Transition detection** — first observation is silent (seed), subsequent polls only broadcast on state change. Same-state polls refresh `currentTask` / `statusText` but preserve `stateEnteredAt`.
- **Broadcast payload** — `project_state_change` with `{ project, sessionState, statusText, currentTask, stateEnteredAt }`. Stable shape consumed by Plan 03.
- **Projects API augmentation** — `GET /api/gsd/projects` returns new `stateEnteredAt` (ISO string) and `currentTask` (string|null) fields on each project row. Existing fields (`sessionState`, `statusText`, `tmuxActive`, etc.) unchanged (additive, backward-compatible).
- **Proxy mode inert** — Railway (where `GSD_DATA_URL` is set) does NOT start the poller. Upstream local server is the single source of truth; Railway forwards snapshots transparently via the existing projects cache.
- **8 unit tests** covering: silent seed, same-state no-broadcast, transition broadcast, payload shape, snapshot output, transient failure swallowing, archived-project skip, sessionless-project skip. All injected-dependency — no tmux touched.

## Task Commits

1. **Task 1: stateBroadcaster module + tests (TDD)** — `f277845` (RED then GREEN in single commit)
2. **Task 2: server/index.js boot wiring + /api/gsd/projects augmentation** — `15bf0a4`

## Files Created/Modified

- `server/gsd/stateBroadcaster.js` *(created)* — snapshot Map, `_testPollOnce(project, detectFn, captureFn, broadcastFn)`, `startStateBroadcaster(loadProjectsFn, broadcastFn, intervalMs=2000)`, `getProjectStateSnapshot()`, `_resetSnapshot()`.
- `server/__tests__/stateBroadcaster.test.js` *(created)* — 8 behavior tests, `beforeEach(_resetSnapshot)` for isolation.
- `server/index.js` *(modified)* — imports `startStateBroadcaster`, calls it once inside `startServer` after `initWebSocket` and gated on `!process.env.GSD_DATA_URL`. Loads projects from `GSD_PROJECTS_PATH || ../gsd-projects.json` (same resolution rule as `routes/gsd.js`).
- `server/routes/gsd.js` *(modified)* — imports `getProjectStateSnapshot` and `extractCurrentTask`. Captures `const stateSnapshot = getProjectStateSnapshot()` once per request (non-proxy branch only). Per-project mapper merges snapshot values when `sessionState` matches, otherwise falls back to a fresh capture + `now` timestamp. Returns `stateEnteredAt` and `currentTask` in each row alongside existing fields.

## Decisions Made

See `key-decisions` in frontmatter. Summary:

1. **Silent initial seed** — boot-time broadcasts are suppressed; only real transitions push.
2. **2000ms poll interval** — matches Plan's STAT-01 requirement for sub-second perceived visibility after the first tick.
3. **Proxy-mode gating via `!GSD_DATA_URL`** — Railway never pollutes upstream with redundant polls; it forwards the canonical snapshot through its existing cache.
4. **Recursive setTimeout** — no overlapping ticks even if tmux capture-pane runs slow.
5. **Snapshot-preferred merge in the route** — API and WebSocket messages stay consistent while handling the cold-start window (broadcaster hasn't seen a project yet) gracefully.
6. **Per-project try/catch in `_testPollOnce`** — a single failing session cannot take down the whole tick.

## Deviations from Plan

None material. The plan's action snippet for the per-project mapper was followed exactly. Two tiny judgment calls worth noting:

1. **`require` placement in `server/index.js`**: the plan's snippet hoisted the const for `path` and `fs` inside the gating block. I used the already-imported top-level `path` and localized only `fs` inline inside the loader — cleaner, same semantics.
2. **`startStateBroadcaster` placement**: the plan's wording allowed "after initWebSocket". I placed it inside `startServer` (right after `attachTerminalWS`), rather than in the `require.main === module` block. This keeps the broadcaster co-located with the WebSocket init it depends on and ensures it runs for any `startServer` caller, not just the CLI entry path.

No Rule 1/2/3 auto-fixes were required — the plan was precise and the underlying primitives from 43-01 were ready to consume.

## Verification

- **`node --test server/__tests__/stateBroadcaster.test.js`** → 8/8 pass.
- **`node --test server/__tests__/tmux.test.js`** → 29/29 pass (no regression from Plan 01 work).
- **`node --test server/__tests__/stateBroadcaster.test.js server/__tests__/tmux.test.js server/__tests__/circuitBreaker.test.js server/__tests__/config.test.js server/__tests__/auth.test.js`** → 64/64 pass.
- **`node --test server/__tests__/api.test.js`** → 105/107 pass. The 2 failures (`readProjectMeta version` and `POST /api/sessions proxy`) are **pre-existing** and documented in 43-01 SUMMARY as out-of-scope. Neither asserts anything about the projects response shape, so the new fields cannot break them.
- **Full suite (`npm run test:server`)** was NOT run because `autopilotManager.test.js` hangs indefinitely — a pre-existing condition documented in 43-01-SUMMARY.md as deferred. Targeted runs of every adjacent test file were clean.

## Issues Encountered

- None specific to this plan. Carried-over deferral: `autopilotManager.test.js` still hangs — needs a future quick-task fix to unblock full `npm run test:server`.

## Deferred Issues

- Pre-existing hang in `autopilotManager.test.js` (carry-over from 43-01).
- Pre-existing 2 failures in `api.test.js` (carry-over from 43-01).

## Next Phase Readiness

Plan 03 (client UI) can now consume:

- **HTTP polling response**: each project row includes `stateEnteredAt` (ISO) and `currentTask` (string|null) — ready for STAT-03 elapsed-time and STAT-04 task-preview rendering.
- **WebSocket push**: `{ type: 'project_state_change', data: { project, sessionState, statusText, currentTask, stateEnteredAt } }` messages arrive within ~2s of real tmux transitions. Client code only needs to subscribe to the existing `/ws` stream and route by `data.project` into the projects map.
- **Proxy safety**: Railway transparently forwards both via the existing projects cache. No client-side branching needed.

## Self-Check

**File existence:**

- `server/gsd/stateBroadcaster.js` — exists (verified via Write + git commit).
- `server/__tests__/stateBroadcaster.test.js` — exists (verified via Write + git commit).
- `.planning/phases/43-project-status-accuracy/43-02-SUMMARY.md` — this file.
- `server/index.js` — modified (broadcaster wire-up).
- `server/routes/gsd.js` — modified (new fields + snapshot merge).

**Commit existence:** verified via `git log` below during final commit step.

- `f277845` — Task 1 (feat(43-02): add stateBroadcaster module...)
- `15bf0a4` — Task 2 (feat(43-02): wire stateBroadcaster into boot...)

**Test verification:**

- 8/8 new tests pass.
- 29/29 tmux tests pass (Plan 01 regression check).
- 105/107 api tests — 2 pre-existing unrelated failures documented.

## Self-Check: PASSED

---
*Phase: 43-project-status-accuracy*
*Completed: 2026-04-06*
