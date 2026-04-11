# Deferred Items — Phase 45

Pre-existing or out-of-scope findings discovered during Phase 45 execution. **Not fixed here.**

## Pre-existing test failures (observed before Phase 45 changes)

### tmux.test.js — STAT-02 heuristic: stale hash → null (stale, fall through)

- **File:** `server/__tests__/tmux.test.js:136`
- **Symptom:** Assertion expects `null` but gets `'working'`.
- **Verified pre-existing:** Reproduced by stashing Phase 45 changes and rerunning the suite.
- **Scope:** Belongs to Phase 43 (Project Status Accuracy). File a follow-up quick task.
- **Action:** Not touched in Phase 45.

### Additional pre-existing failures observed in full suite run

Reproduced on master without Phase 45 changes (or clearly unrelated to Phase 45 scope):

- `api.test.js` — `readProjectMeta › returns version and liveUrl for gsddashboard` (version is null).
- `api.test.js` — `POST /api/sessions is not proxied even when GSD_DATA_URL is set`.
- `autopilotManager.test.js` — `runType='plan-all' calls spawnFn with /gsd:plan-phase`; the suite also hangs (`Promise resolution is still pending`).

All belong to earlier phases / unrelated subsystems. File follow-up quick tasks as appropriate.

