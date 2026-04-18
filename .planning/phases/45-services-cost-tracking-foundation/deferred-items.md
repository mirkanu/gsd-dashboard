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


### Plan 04: Pre-existing client typecheck errors (unrelated to Phase 45)

Observed during `npx tsc --noEmit` in `client/`. None touch Phase 45 files. All in pre-existing files.

- `src/components/__tests__/GsdProject.test.ts` (8 errors) — fixture missing `stateEnteredAt` and `currentTask` after Phase 43 type extension.
- `src/components/__tests__/PricingEditor.test.tsx` (4 errors) — `noUncheckedIndexedAccess` violations.
- `src/pages/GSD.tsx` (~17 errors) — `noUncheckedIndexedAccess`, `noUnusedLocals`, missing `@xterm/xterm/css/xterm.css` types, ChatListView prop mismatch (`nowMs`).

Phase 45 Plan 04 files (`lib/api.ts`, `lib/types.ts`, `pages/ServicesPage.tsx`, `components/services/*`) typecheck cleanly. Out of scope per execution rules — file as quick task.
