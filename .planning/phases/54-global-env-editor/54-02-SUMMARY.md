---
phase: 54
plan: "02"
subsystem: frontend-ui
tags: [env-editor, react, tailwind, sidebar-nav, secret-masking]
dependency_graph:
  requires: [GET /api/env, PUT /api/env, server/routes/env.js]
  provides: [EnvEditorPage, EnvTable, /env route, Environment sidebar entry]
  affects: [client/src/App.tsx, client/src/components/Sidebar.tsx]
tech_stack:
  added: []
  patterns: [controlled-component, optimistic-snapshot-diff, per-row-mask-state, fetch-on-mount]
key_files:
  created:
    - client/src/pages/EnvEditorPage.tsx
    - client/src/components/EnvTable.tsx
  modified:
    - client/src/components/Sidebar.tsx
    - client/src/App.tsx
decisions:
  - EnvRow id is client-side only (crypto.randomUUID); stripped via withoutIds() before PUT to server
  - isUnsaved computed via JSON.stringify diff against snapshot — simple and correct for this data shape
  - permDenied banner hides Save button entirely (not disabled) to prevent repeated 403 attempts
  - successTimer ref used to clear previous timeout if user saves twice quickly within 2500ms window
metrics:
  duration: ~15 minutes
  completed: "2026-05-09"
  tasks_completed: 2
  files_changed: 4
---

# Phase 54 Plan 02: Global Env Editor UI Summary

**One-liner:** React EnvEditorPage with EnvTable (secret masking, row CRUD, unsaved pill) wired to /env route and sidebar, consuming the Plan 01 backend API.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build EnvTable component with EnvRow inline | f9a9dc0 | client/src/components/EnvTable.tsx |
| 2 | Build EnvEditorPage and wire sidebar + App.tsx route | 82e5b90 | client/src/pages/EnvEditorPage.tsx, client/src/components/Sidebar.tsx, client/src/App.tsx |

## What Was Built

**`client/src/components/EnvTable.tsx`** — Controlled table component:

- `EnvRow` type exported: `{ type, key?, value?, raw, id }` where `id` is a client-side stable UUID.
- `EnvTable` props: `{ rows: EnvRow[], onChange: (rows: EnvRow[]) => void }`.
- `SECRET_PATTERN = /(_KEY|_SECRET|_TOKEN|_PASSWORD|_PAT|_PASS)$/i` — matching keys render as `type="password"`.
- Per-row `revealed` state (`Record<string, boolean>`) drives Eye/EyeOff toggle.
- Comment and blank rows render as read-only gray italic spans (no inputs, no delete button).
- "Add row" appends `{ type: 'entry', key: '', value: '', raw: '', id: uuid }`.
- Delete removes row by id from the controlled array.
- On key/value change, `raw` is reconstructed as `"${key}=${value}"` to keep serialisation consistent.
- Empty state: "No variables yet / This file is empty. Add your first key below."

**`client/src/pages/EnvEditorPage.tsx`** — Page root with full UI-SPEC state machine:

- `loading` → 3-row skeleton (animate-pulse).
- `loadError` → red AlertCircle banner + "Try again" button.
- `permDenied` → yellow AlertTriangle banner, Save button hidden.
- `isUnsaved` → yellow pill "Unsaved changes" computed via `JSON.stringify(rows) !== JSON.stringify(snapshot)`.
- Save flow: `saving` (Loader2 spin) → `success` (Check + "Saved" in emerald, 2500ms flash) → `idle`.
- Save error: red inline message below save bar.
- `withIds()` / `withoutIds()` helpers bridge the API (no id) and component (requires id).
- Reload button re-fetches and resets both `snapshot` and `rows`.

**`client/src/components/Sidebar.tsx`:** `FileKey` added to lucide-react import; `{ to: "/env", icon: FileKey, label: "Environment" }` inserted between Config and Server in `PRIMARY_ITEMS`.

**`client/src/App.tsx`:** `EnvEditorPage` imported; `<Route path="env" element={<EnvEditorPage />} />` placed after config route and before server route.

## Verification

- `npm run test:client` — 144/144 tests pass, no regressions.
- `npm run build` — exits 0, no TypeScript errors.
- Grep checks for all acceptance criteria pass (SECRET_PATTERN, type='password', EyeOff/Eye, Trash2, exports, FileKey, /env, permDenied, 2500, Unsaved changes).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All UI states are wired to real API data from `/api/env`. The EnvTable receives live rows from `EnvEditorPage` state which is fetched from the backend on mount and reload.

## Threat Flags

No new security surfaces beyond those enumerated in the plan's threat model (T-54-07 through T-54-11). Specifically:
- `row.raw` for comment lines is rendered as a React text node (not `dangerouslySetInnerHTML`), mitigating T-54-09.
- No new endpoints or auth paths introduced.

## Checkpoint Status

Task 3 (checkpoint:human-verify) was reached. Awaiting user visual verification of the rendered UI before marking plan complete.

## Self-Check: PASSED

- client/src/components/EnvTable.tsx: FOUND
- client/src/pages/EnvEditorPage.tsx: FOUND
- client/src/components/Sidebar.tsx: modified (FileKey + /env entry)
- client/src/App.tsx: modified (EnvEditorPage import + /env route)
- commit f9a9dc0: FOUND (Task 1 — EnvTable)
- commit 82e5b90: FOUND (Task 2 — EnvEditorPage + wiring)
