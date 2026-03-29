---
phase: quick
plan: 4
subsystem: server/routes/gsd.js
tags: [bugfix, tasks, gsd-data-url, archive, proxy]
dependency_graph:
  requires: []
  provides: [task-persistence-on-reload, task-archive-works]
  affects: [server/routes/gsd.js]
tech_stack:
  added: []
  patterns: [GSD_DATA_URL proxy guard pattern]
key_files:
  created: []
  modified:
    - server/routes/gsd.js
decisions:
  - "Accept both boolean and integer for archived field in PATCH route — client sends 0|1 per GsdTask type"
  - "GSD_DATA_URL proxy guard pattern applied to all three task routes to match other GSD routes"
metrics:
  duration: ~10 min
  completed: 2026-03-29
  tasks_completed: 2
  files_modified: 1
---

# Quick Task 4: Fix Task Bugs — Persistence on Reload and Archive Toggle

Fixed two bugs in `server/routes/gsd.js`: archived integer coercion now accepts both boolean and integer inputs (0|1), and all three task routes (POST/GET/PATCH) gained the GSD_DATA_URL proxy guard so Railway tasks persist via the tunnel instead of ephemeral SQLite.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix archive integer coercion in PATCH route | 7dd65df | server/routes/gsd.js |
| 2 | Add GSD_DATA_URL proxy guards to all three task routes | 357516e | server/routes/gsd.js |

## What Was Fixed

### Bug 1 — Archive not working

The PATCH route used strict boolean equality `archived === true` to coerce to integer 1, but the client sends integer `1` (per the `GsdTask` type `archived: 0 | 1`). Since `1 === true` is `false` in JavaScript, `archivedInt` always resolved to `null`, causing `COALESCE(null, archived)` to preserve the original `0`.

**Fix:** Accept both booleans and integers:
```js
const archivedInt = (archived === true || archived === 1) ? 1
                  : (archived === false || archived === 0) ? 0
                  : null;
```

### Bug 2 — Tasks disappear on Railway redeploy

The three task routes (POST create, GET list, PATCH update) lacked the `GSD_DATA_URL` proxy guard present on all other GSD routes. On Railway, `GSD_DATA_URL` points at the local dev tunnel; without the guard, tasks were written to Railway's ephemeral SQLite and wiped on every redeploy.

**Fix:** Added the same proxy pattern as `/projects/:name/send` and other routes to all three task handlers. Also converted all three to `async` handlers and fixed the PATCH handler to destructure `key` from `req.params` (previously only destructured `id`).

## Verification

- Inline node test: PATCH with `{ archived: 1 }` sets `archived=1` in DB. PASS.
- `npm run test:server`: All task endpoint tests pass (7/7). Three pre-existing unrelated failures in `readProjectMeta`/`resolveFile` tests remain unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `/data/home/gsddashboard/server/routes/gsd.js` modified and committed
- Commit `7dd65df` exists (archive coercion fix)
- Commit `357516e` exists (proxy guards)
- Task endpoint tests: 7 pass, 0 fail (pre-existing 3 failures unrelated to task work)
