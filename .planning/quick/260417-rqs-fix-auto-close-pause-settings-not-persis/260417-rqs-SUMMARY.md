---
phase: 260417-rqs-fix-auto-close-pause-settings-not-persis
plan: 01
subsystem: config-ui / app-settings
tags: [bugfix, ui-persistence, encrypted-settings, idle-detector]
requires:
  - server/crypto.js getSecret()
  - existing /api/app-settings PUT/DELETE routes
provides:
  - GET /api/app-settings/:key/value (plaintext-read, allow-listed)
  - api.appSettings.getValue() typed client helper
  - ConfigPage Idle Auto-Close section hydrated from server on mount
  - server/gsd/idleDetector.getIdleThresholdMs() that actually reads the persisted value
affects:
  - Phase 48 idle-session-cost-controls (closes the known limitation logged in 48-04-SUMMARY.md line 94)
tech-stack:
  added: []
  patterns:
    - Allow-listed plaintext-read endpoint alongside metadata-only CRUD (defense-in-depth for secrets)
    - Optimistic useState defaults + in-place server hydration via useEffect([]) to avoid layout shift
key-files:
  created: []
  modified:
    - server/routes/app-settings.js
    - client/src/lib/api.ts
    - client/src/pages/ConfigPage.tsx
    - server/gsd/idleDetector.js
decisions:
  - Narrow PUBLIC_SETTINGS allow-list (only idle_timeout_minutes + railway_ram_rate_monthly) instead of widening the general /:key endpoint — preserves the secret-safety contract for railway_pat, openai_admin_key, vercel_token
  - Register /:key/value BEFORE /:key in Express so path matching hits the more specific route first (otherwise the metadata-only handler shadows it)
  - Replace raw db.prepare + hand-rolled decrypt in idleDetector with higher-level getSecret() — matches server/gsd/costMeasurement.js pattern and eliminates the MODULE_NOT_FOUND crash path that silently fell back to the 120-min default
  - Keep optimistic useState defaults (120 / 10.0 / true) rather than nullable loading state — avoids a skeleton/layout-shift on every ConfigPage mount; server value hydrates in place within one render
metrics:
  duration: "~24min"
  completed_at: 2026-04-17
---

# Phase 260417-rqs Plan 01: Fix Auto-Close / Pause Settings Not Persisting Summary

Round-tripped the Idle Auto-Close section in ConfigPage so saved thresholds survive reload, via a new allow-listed plaintext-read endpoint and a fix to the idleDetector's broken crypto require path.

## Completed Tasks

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Add allow-listed plaintext-read endpoint + client helper + fix idleDetector require | `4b51151` | server/routes/app-settings.js, client/src/lib/api.ts, server/gsd/idleDetector.js |
| 2 | Hydrate ConfigPage Idle Auto-Close section from server on mount | `8908a02` | client/src/pages/ConfigPage.tsx |
| 3 | Human verification on live Railway | (skipped per executor constraints — orchestrator handles checkpoint + deploy) | — |

## Implementation Notes

### Task 1 — Backend + client helper + idleDetector fix

**server/routes/app-settings.js**
- Added `PUBLIC_SETTINGS = ['idle_timeout_minutes', 'railway_ram_rate_monthly']` constant.
- Imported `getSecret` from `../crypto` (already existed there; only `setSecret` + `listSecretKeys` were previously imported).
- Registered `GET /:key/value` BEFORE the existing `GET /:key` handler so Express' path matching hits the more specific route first.
- New handler returns `403 { error: 'not a public setting' }` for any key outside the allow-list — secrets stay unreadable over the wire. Returns `404 { error: 'not set' }` when the key is in the allow-list but no row exists. Calls `seedPhase48Defaults()` inside a try/catch (non-fatal in test env where DASHBOARD_SECRET_KEY is unset) so first-read after cold-start succeeds.

**client/src/lib/api.ts**
- Added `getValue: (key: string) => request<{ key: string; value: string }>(...)` next to the existing `get` helper inside `appSettings`. No other methods changed.

**server/gsd/idleDetector.js**
- Replaced the broken body of `getIdleThresholdMs()`. The previous implementation did a raw `db.prepare('SELECT value_encrypted, iv, auth_tag ...')` and `require('./crypto')` — which resolves to `server/gsd/crypto.js`, a file that does not exist. The surrounding try/catch swallowed the `MODULE_NOT_FOUND` every tick and always returned the 120-min default.
- New body uses `require('../crypto').getSecret('idle_timeout_minutes')` — the same deferred-require pattern that `server/gsd/costMeasurement.js` already uses at line 113-114 for `railway_ram_rate_monthly`. The `// 0 means disabled` comment is preserved because `_testCheckAndCloseSession` checks `if (thresholdMs === 0) return null`.

### Task 2 — ConfigPage hydration

- Added a second `useEffect([])` immediately after the existing `api.gsd.projects()` effect (hook order is stable). It runs once on mount, fires both `getValue` calls in parallel via `Promise.allSettled`, and hydrates the three pieces of state in place:
  - `idle_timeout_minutes === 0` → `setIdleEnabled(false)`; `idleThresholdMinutes` kept at default 120 so re-enabling has a sane value.
  - `idle_timeout_minutes > 0` → `setIdleEnabled(true)` + `setIdleThresholdMinutes(mins)`.
  - `railway_ram_rate_monthly` → `setRamRate(parseFloat(...))`.
- Hydration failure (404, 403, network) is non-fatal — `try/catch` logs via `console.warn` and the UI keeps its optimistic defaults.
- Uses the existing `let cancelled = false` + cleanup pattern that the neighboring projects-load effect uses.
- Did NOT replace the hardcoded `useState(120)` / `useState(10.0)` / `useState(true)` with a nullable loading gate — that would introduce a layout shift on every ConfigPage mount and violates CLAUDE.md's perceived-performance rule.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

### Backend tests (`npm run test:server`)

**Result:** 279 / 284 pass. 5 failing tests — all pre-existing (confirmed by stashing my changes and re-running against master `e8da962`).

The full suite hangs indefinitely on `server/__tests__/autopilotManager.test.js` (pre-existing bug, unrelated to this task — the node process was stuck with no output after 18+ minutes). Ran the full suite with `autopilotManager` excluded to get a complete pass/fail count:

```
ℹ tests 284
ℹ suites 51
ℹ pass 279
ℹ fail 5
```

Pre-existing failures (none introduced by this task):

1. `app-settings route > GET list returns all keys metadata after multiple PUTs` — expected list omits `idle_timeout_minutes` + `railway_ram_rate_monthly` but the existing `seedPhase48Defaults()` on `GET /` (landed in commit `ac44c0e`, Phase 48 Plan 04) adds them. Test not updated when seeding was introduced.
2. `app-settings route > GET empty list returns { keys: [] }` — same cause: seeding runs on first `GET /`.
3. `GET /api/gsd-projects/:name > returns version and liveUrl for a project with PROJECT.md (gsddashboard)` — unrelated projects route test.
4. `proxy-prefixes > POST /api/sessions is not proxied even when GSD_DATA_URL is set` — unrelated proxy guard test.
5. `STAT-02 heuristic: hash same and last change > 3s ago → null (stale, fall through)` — unrelated status-classifier heuristic.

Targeted test runs that verify my changes are clean:
- `node --test server/__tests__/idle-detector.test.js` → 5/5 pass.
- `node --test server/__tests__/crypto.test.js` → 7/7 pass.
- `node --test server/__tests__/app-settings-route.test.js` → 10/12 pass (the two failures are the pre-existing seed-related ones above; the 10 passing tests cover PUT / DELETE / auth / 404 / 400 handling that my new route adds alongside).

### Frontend tests (`npm run test:client`)

**Result:** 80 / 135 pass. 55 failures are all the same pre-existing error: `act(...) is not supported in production builds of React` — a test-environment configuration issue unrelated to my changes. No test exercises ConfigPage, and none of the failing test files reference this plan's touched modules.

### TypeScript check (client)

`./node_modules/.bin/tsc --noEmit` run from `client/` produces errors only in unrelated files (`src/pages/GSD.tsx` touchstart/touchmove overloads, ChatListView prop shape). Zero errors in `ConfigPage.tsx` or `lib/api.ts`.

### Route ordering sanity

Confirmed in the final `server/routes/app-settings.js` that `router.get('/:key/value', ...)` is registered at line 62, BEFORE `router.get('/:key', ...)` at line 80. Express path matching will hit `/value` first.

## Deferred Issues

- The two `seedPhase48Defaults`-related test failures in `app-settings-route.test.js` should be updated to expect `idle_timeout_minutes` and `railway_ram_rate_monthly` in the metadata list. Leaving for a follow-up so this quick task stays focused on the UI-persistence bug.
- `autopilotManager.test.js` hangs the full `npm run test:server` run — worth a follow-up to add a timeout / abort to whichever test is blocking.

## Known Stubs

None.

## Threat Flags

None — no new network endpoint beyond the allow-listed plaintext read, which is gated to two non-secret operational keys. The existing secret-safety contract for `railway_pat` / `openai_admin_key` / `vercel_token` is preserved (those keys now return 403 from the new `/value` endpoint).

## Self-Check: PASSED

- `server/routes/app-settings.js` — FOUND, contains `PUBLIC_SETTINGS`, `getSecret` import, and `router.get('/:key/value'` route before `router.get('/:key'`.
- `client/src/lib/api.ts` — FOUND, contains `getValue: (key: string)` inside `appSettings`.
- `client/src/pages/ConfigPage.tsx` — FOUND, contains hydration `useEffect` calling `api.appSettings.getValue("idle_timeout_minutes")` and `"railway_ram_rate_monthly"`.
- `server/gsd/idleDetector.js` — FOUND, contains `require('../crypto')` + `getSecret('idle_timeout_minutes')`; no stale `require('./crypto')`.
- Commit `4b51151` — FOUND in git log (Task 1).
- Commit `8908a02` — FOUND in git log (Task 2).
