---
plan: 07-02
status: completed
completed: 2026-03-22
---

# 07-02 Summary: Proxy Behavior Tests

## What was built
- Added `describe('agent data proxy')` block to `server/__tests__/api.test.js`
- Test 1: GET /api/sessions is proxied to upstream when GSD_DATA_URL is set
- Test 2: POST /api/sessions is NOT proxied even when GSD_DATA_URL is set
- Test 3: GET /api/sessions uses local SQLite when GSD_DATA_URL is not set
- Uses a mock upstream http server started on a random port to avoid network dependencies

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed GSD_DATA_URL read at module load time instead of createApp() call time**
- **Found during:** Task 1 (RED phase — test failed because proxy never activated)
- **Issue:** `server/index.js` captured `GSD_DATA_URL` as a module-level constant on line 20. Since `require('../index')` is called once at the top of the test file before any env vars are set, every `createApp()` call got an empty string regardless of `process.env.GSD_DATA_URL` set later in the `before()` hook.
- **Fix:** Removed the module-level `GSD_DATA_URL` constant; moved the read (`process.env.GSD_DATA_URL || ""`) inside `createApp()` so each fresh app instance picks up the current env value.
- **Files modified:** `server/index.js`
- **Commit:** 300d135

## Verification
- `npm run test:server` passed with all 3 proxy tests green
- 74 pass / 2 fail — the 2 pre-existing failures (`resolves 'plan'` and `returns 200 text/plain with active PLAN.md`) are unrelated to this task and were failing before these changes
