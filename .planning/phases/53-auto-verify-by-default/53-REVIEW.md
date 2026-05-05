---
phase: 53-auto-verify-by-default
reviewed: 2026-05-05T10:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - server/gsd/verifyOrchestrator.js
  - server/gsd/stateBroadcaster.js
  - server/gsd/idleDetector.js
  - server/routes/gsd.js
  - server/__tests__/verifyOrchestrator.test.js
  - server/__tests__/idle-detector.test.js
  - server/__tests__/pause-route.test.js
  - server/routes/__tests__/gsd-pause-session.test.js
  - client/src/components/VerifyBadge.tsx
  - client/src/lib/types.ts
  - client/src/pages/GSD.tsx
  - server/db.js
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
---

# Phase 53: Code Review Report

**Reviewed:** 2026-05-05T10:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Phase 53 introduces auto-verify-by-default: when a tmux session transitions from `working` to `waiting`, `stateBroadcaster` fires `maybeStartVerify`, which injects a `/gsd-verify-work` slash command and polls for a UAT.md completion marker. A circuit-breaker (3 consecutive failures), an in-progress guard in the idle detector, and a verify-before-shutdown step in the pause/archive routes round out the feature.

The overall design is solid — dependency injection throughout makes the code testable, error handling is non-blocking, and the circuit breaker prevents runaway retries. However, one critical omission stands out: the `project_verify_state` table referenced by the orchestrator is never created in `db.js`, which will cause every circuit-breaker read and write to silently fail on a fresh or migrated database. Three warnings cover logic gaps in the polling loop and the verify-state persistence model. Three info items flag type-safety gaps and minor dead-path issues.

---

## Critical Issues

### CR-01: `project_verify_state` table never created — circuit breaker silently broken

**File:** `server/gsd/verifyOrchestrator.js:86`
**Issue:** `_getVerifyFailures`, `_recordVerifyFailure`, and `_resetVerifyFailures` all query and upsert into `project_verify_state`. That table is never created in `server/db.js`. The bare `catch` blocks in each helper swallow the `no such table` error and return 0 / do nothing, so `consecutiveFailures` always reads as 0 — the circuit breaker is permanently disabled and verify-failure history is never persisted across restarts.
**Fix:** Add a migration block to `server/db.js` following the same pattern used for other new tables:

```js
// Migration: project_verify_state (Phase 53 — auto-verify circuit breaker)
try {
  db.prepare('SELECT 1 FROM project_verify_state LIMIT 1').get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_verify_state (
      project_id TEXT PRIMARY KEY,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      last_verify_at TEXT NOT NULL
    );
  `);
}
```

---

## Warnings

### WR-01: Polling loop reads UAT.md for a `null` phase number — wrong file matched

**File:** `server/gsd/verifyOrchestrator.js:190-193`
**Issue:** When `_parsePhaseNum(state.current_phase)` returns `null` (e.g. STATE.md has no `current_phase`), `phaseNum` is `null`. The `sendKeysFn` call then sends `/gsd-verify-work` (no number), and inside the poll loop `readUatStatusFn(root, null)` is called. In `_readUatStatus`, `paddedPhase` becomes `"nu"` (from `String(null).padStart(2, '0')`), so `entries.find(d => d.startsWith('nu-'))` will never match — `readUatStatusFn` returns `null` on every poll, and the loop times out every time for projects without a numeric `current_phase`.
**Fix:** Gate the verify attempt on `phaseNum` being non-null, or handle `null` explicitly in `_readUatStatus`:

```js
// In verifyOrchestrator.js, after parsing phaseNum:
if (phaseNum === null) {
  return { ok: false, reason: 'no-phase-num' };
}
```

Alternatively, fix `_readUatStatus` to accept `null` and scan for the most-recently-modified UAT file, but the guard approach is simpler and safer.

### WR-02: `patchProjectsOnStateChange` never patches `verifyState` or `verifyFailureSummary` — UI stuck after WebSocket update

**File:** `client/src/pages/GSD.tsx:734-757`
**Issue:** `VerifyBadge` reads `project.verifyState` and `project.verifyFailureSummary` from the `GsdProject` object. These fields are broadcast by `verifyOrchestrator` via `project_state_change` WebSocket events (e.g. `{ verifyState: 'verifying', verifyFailureSummary: ... }`). However, `patchProjectsOnStateChange` only copies `sessionState`, `statusText`, `currentTask`, `stateEnteredAt`, and `busy_markers` — it does not copy `verifyState` or `verifyFailureSummary`. As a result, the `VerifyBadge` will never update from a WebSocket event; it can only reflect the state as of the last full HTTP poll.
**Fix:**

```ts
const patched = {
  ...projects[idx],
  sessionState: evt.sessionState,
  statusText: evt.statusText,
  currentTask: evt.currentTask,
  stateEnteredAt: evt.stateEnteredAt,
} as GsdProject;
// Phase 53: propagate verify state from WS event
if ('verifyState' in evt) {
  (patched as any).verifyState = (evt as any).verifyState;
} else {
  delete (patched as any).verifyState;
}
if ('verifyFailureSummary' in evt) {
  (patched as any).verifyFailureSummary = (evt as any).verifyFailureSummary;
} else {
  delete (patched as any).verifyFailureSummary;
}
```

This also requires adding `verifyState` and `verifyFailureSummary` to the `GsdProject` interface and the `ProjectStateChangeEvent` interface in `client/src/lib/types.ts`.

### WR-03: `_testPauseSession` — `runVerifyFn` throw not caught, crashes the route

**File:** `server/routes/gsd.js:376-391`
**Issue:** `_testPauseSession` calls `await runVerifyFn(project, broadcastFn, ...)` without a `try/catch`. `verifyOrchestrator.runVerify` is documented as throwing only if `broadcastFn` is missing, but the injected `broadcastFn` defaults to `require('../websocket').broadcast` — which can itself throw during startup or if websocket is not yet initialized. If `runVerifyFn` throws (e.g. module not ready), the entire pause operation propagates the error and the route returns a 500 with no graceful shutdown attempted. The test in `gsd-pause-session.test.js:57` covers the case where `runVerifyFn` returns a failure result (`{ ok: false }`), but not where it throws.
**Fix:**

```js
async function _testPauseSession(project, fns = {}) {
  const {
    isTmuxActiveFn = isTmuxSessionActive,
    runVerifyFn = verifyOrchestrator.runVerify,
    gracefulShutdownFn = gracefulShutdown,
    broadcastFn = require('../websocket').broadcast,
  } = fns;

  const { name, tmux_session } = project;
  let verifyResult = null;
  if (isTmuxActiveFn(tmux_session)) {
    try {
      verifyResult = await runVerifyFn(project, broadcastFn, { timeout: 10 * 60 * 1000 });
    } catch { /* never let verify error block graceful shutdown */ }
  }
  const result = await gracefulShutdownFn(tmux_session, name);
  return { ...result, verifyResult };
}
```

---

## Info

### IN-01: `GsdProject` interface missing `verifyState` and `verifyFailureSummary` fields

**File:** `client/src/lib/types.ts:108-135`
**Issue:** `VerifyBadge` accesses `project.verifyState` and `project.verifyFailureSummary`, but neither field is declared in the `GsdProject` interface. TypeScript accepts this via structural subtyping in some call paths (e.g. `as any` cast) but will reject direct usage in strict mode. The missing declaration also means there is no documented contract for what values are valid.
**Fix:**

```ts
export interface GsdProject {
  // ... existing fields ...
  /** Phase 53: present only when a verify run is active or has a recent result. */
  verifyState?: 'verifying' | 'verify-passed' | 'verify-failed';
  /** Phase 53: human-readable failure summary from UAT.md; set when verifyState is 'verify-failed'. */
  verifyFailureSummary?: string;
}
```

The same fields should be added as optional to `ProjectStateChangeEvent` so `patchProjectsOnStateChange` can copy them from WS events.

### IN-02: `require('child_process')` inside `_sendKeysToTmux` — late binding on every call

**File:** `server/gsd/verifyOrchestrator.js:28`
**Issue:** `require('child_process')` is called inside the function body on every invocation instead of at module top-level. Node.js caches module resolution so this is not a correctness bug, but it deviates from the established pattern in the rest of the codebase (all other files hoist their requires) and obscures the dependency from static analysis tooling.
**Fix:** Move to the top of the file alongside the other requires:

```js
const { execFileSync } = require('child_process');
```

### IN-03: `autopilot_runs` status CHECK constraint does not include newer statuses used in code

**File:** `server/db.js:132`
**Issue:** The `autopilot_runs` schema (Phase 24 migration) defines `CHECK(status IN ('running','paused','completed','failed'))`, but `AutopilotRunStatus` in `types.ts:209` includes `'idle'`, `'halted'`, `'pending_confirmation'`, `'queued'`, `'queue_timeout'`. Any attempt to INSERT or UPDATE a row with one of these newer statuses will raise a SQLite constraint violation. This is a pre-existing issue not introduced by Phase 53, but it is present in `db.js` which is in scope for this review.
**Fix:** The migration block that creates `autopilot_runs` should be updated to include all valid statuses, or the CHECK constraint should be dropped in a follow-up migration. Since the table creation is in a one-time migration block (it only runs if the table does not yet exist), a separate `ALTER TABLE` to drop/recreate the constraint is needed for existing databases. A safe incremental fix is to add a migration that recreates the table with the correct constraint (following the `token_usage` rename-and-recreate pattern already used at line 216).

---

_Reviewed: 2026-05-05T10:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
