---
phase: quick-38
plan: 38
subsystem: configuration-ui
tags: [config, settings, sqlite, react, defaults]
requires:
  - existing project_settings table (Phase 42)
  - express config router
provides:
  - global defaults persistence via reserved __global__ row
  - apply-to-all bulk update endpoint
  - global tab verbosity + telegram controls in ConfigPage
affects:
  - GET /api/config/project-settings/:project (now falls back to global defaults)
  - listProjectSettings (now excludes __global__)
tech_stack:
  added: []
  patterns:
    - reserved row key for global defaults (no schema change)
    - bulk UPDATE WHERE project_key != '__global__'
    - server-side fallback read with no auto-create
key_files:
  created:
    - server/__tests__/config.test.js
    - .planning/quick/38-add-global-default-settings-with-apply-t/38-SUMMARY.md
  modified:
    - server/db.js
    - server/routes/config.js
    - client/src/lib/api.ts
    - client/src/pages/ConfigPage.tsx
decisions:
  - Reused existing project_settings schema with reserved '__global__' key instead of adding a global_settings table — zero migration risk.
  - Server-side fallback in GET /:project — clients always get a populated response, no extra round trip.
  - Inline modal (no AlertDialog dependency) — sonner/radix-dialog not in client deps; plan explicitly allowed window.confirm fallback. Custom modal matches existing surface-2/border styles.
  - applyGlobalSettings reads from the __global__ DB row (not request body) so the bulk write is always consistent with whatever was just PUT.
metrics:
  duration: ~25min
  completed: 2026-04-10
---

# Quick Task 38: Global Default Settings with Apply-to-All Summary

One-liner: Reserved `__global__` row in `project_settings` holds verbosity + Telegram defaults; Global tab edits auto-save and prompt to overwrite all existing project rows in one SQL UPDATE.

## What was built

### Backend (server/db.js, server/routes/config.js)

- Added `GLOBAL_SETTINGS_KEY = '__global__'` constant and exported `getGlobalSettings()` helper that returns the parsed `__global__` row or hardcoded defaults (`verbosity: 'normal'`, empty Telegram alerts).
- New prepared statement `applyGlobalSettings`: `UPDATE project_settings SET verbosity = ?, telegram_alerts = ?, updated_at = ? WHERE project_key != '__global__'`.
- `listProjectSettings` prepared statement now filters out `project_key = '__global__'` so existing list consumers (and `GET /api/config/project-settings`) never see it as a real project.
- `GET /api/config/project-settings/:project` now falls back to `getGlobalSettings()` when the row is missing for any project (including `__global__` itself, which falls back to hardcoded defaults). No row is auto-created on read.
- New `POST /api/config/project-settings/apply-global` reads the current `__global__` row, runs the bulk UPDATE, and returns `{ ok: true, updated: <changes> }`. Returns `400 { error: 'No global settings to apply' }` if no global row exists. Honors the `GSD_DATA_URL` proxy passthrough pattern used by every other config endpoint.

### Frontend (client/src/lib/api.ts, client/src/pages/ConfigPage.tsx)

- Added `api.config.applyGlobalSettings()` helper.
- Removed the `{!isGlobal && (...)}` gate so verbosity + Telegram controls render on the Global tab too.
- Global tab loads its data from the reserved `__global__` API key (the UI tab id stays "global"; only the API key is rewritten).
- `saveSettings` now sends a fully merged `{verbosity, telegram_alerts}` payload (the server PUT validates both fields). After a successful PUT on the Global tab, opens the apply-to-all confirmation dialog. Per-project tabs are unaffected.
- New inline modal (`role="dialog"`, `aria-modal`) styled with the existing `bg-surface-2 / border / rounded-xl` tokens. Buttons: "Cancel" and "Apply to all". The Apply button shows a spinner while in flight.
- On confirm: POST `/api/config/project-settings/apply-global`, then show a transient "Applied to N projects" pill at the top of the page. On error: show error message instead.
- Coalescing: if the dialog is already open and the user changes another global field, the global PUT still fires immediately but only one dialog stays open — when the user confirms, it applies the latest stored global row.

### Tests (server/__tests__/config.test.js, new file)

7 tests, all passing in isolation:

1. PUT `/api/config/project-settings/__global__` stores defaults
2. GET `/api/config/project-settings/__global__` returns what was stored
3. GET `/api/config/project-settings/<unknown>` returns global defaults when no row exists (and does not auto-create)
4. GET `/api/config/project-settings/<unknown>` returns hardcoded defaults when no global row exists
5. POST apply-global updates all non-global rows and reports `updated: 2`; the global row stays intact
6. POST apply-global returns 400 when no global row exists
7. `listProjectSettings` (and the list API endpoint) excludes `__global__`

## Verification run

- `node --test server/__tests__/config.test.js` → 7/7 pass.
- `node --test server/__tests__/api.test.js` → 105/107 pass. The 2 failures (`POST /api/sessions is not proxied even when GSD_DATA_URL is set`, `returns version and liveUrl for a project with PROJECT.md`) reproduce on the unmodified baseline (verified via `git stash`) — pre-existing, unrelated.
- `npm run test:client` → 120/122 pass. Both failures live in `src/components/__tests__/Sidebar.test.tsx` ("should render the brand name", "should show version number") and are unrelated to ConfigPage.
- `npx tsc --noEmit` in client → no errors in `ConfigPage.tsx` or `api.ts`. Pre-existing TS errors live in `GSD.tsx` (touchstart/touchmove handler typings, unused `ProjectCard`) and were already on master.
- `npx vite build` → success, 8.12s.

The full `npm run test:server` script could not run in one shot because pre-existing zombie test runners on `autopilotManager.test.js` (PIDs from Apr 6, 7, and 9) hold a process slot — verified via `ps`. Each affected file was therefore exercised individually.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] No AlertDialog / sonner in client deps**
- **Found during:** Task 2
- **Issue:** Plan suggested shadcn `AlertDialog` and a sonner toast, but `client/package.json` has neither (`@radix-ui/react-context-menu` is the only radix package; no `sonner`).
- **Fix:** Built a small inline modal matching the existing `surface-2`/`border` styling, plus a transient text pill for the "Applied to N projects" feedback. The plan explicitly allowed this fallback ("a simple `window.confirm` is acceptable as a fallback") — the modal is a strict upgrade over `confirm()` while still adding zero new dependencies.
- **Files modified:** `client/src/pages/ConfigPage.tsx`
- **Commit:** 6daaf73

**2. [Rule 1 - Bug] PUT validation rejects partial payloads**
- **Found during:** Task 2 (frontend save)
- **Issue:** The existing PUT handler validates both `verbosity` and `telegram_alerts` and would happily collapse `telegram_alerts` to `{}` if only `verbosity` was sent. The previous frontend `saveSettings` was already calling PUT with patches like `{ verbosity: 'verbose' }`, which would have wiped Telegram alerts on save.
- **Fix:** `saveSettings` now merges the patch with current `settings` state before PUT, so both fields are always sent intact.
- **Files modified:** `client/src/pages/ConfigPage.tsx`
- **Commit:** 6daaf73

### Deferred Items

None. The pre-existing test failures and TS errors are out of scope per the SCOPE BOUNDARY rule.

## Authentication Gates

None encountered.

## Self-Check: PASSED

- FOUND: server/db.js (`GLOBAL_SETTINGS_KEY`, `getGlobalSettings`, `applyGlobalSettings` stmt, `listProjectSettings` filter)
- FOUND: server/routes/config.js (`apply-global` POST, fallback read in GET `/:project`)
- FOUND: server/__tests__/config.test.js (7 tests, all pass)
- FOUND: client/src/lib/api.ts (`applyGlobalSettings`)
- FOUND: client/src/pages/ConfigPage.tsx (Global tab controls, apply-to-all dialog)
- FOUND commit 282e867 (backend)
- FOUND commit 6daaf73 (frontend)
