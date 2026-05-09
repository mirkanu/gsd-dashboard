---
phase: 54
plan: "01"
subsystem: backend-api
tags: [env-editor, file-io, atomic-write, security, api]
dependency_graph:
  requires: []
  provides: [GET /api/env, PUT /api/env, server/routes/env.js, proxy prefix /api/env]
  affects: [server/index.js, server/routes/proxy.js]
tech_stack:
  added: []
  patterns: [atomic-write-temp-rename, route-module-pattern, tdd-node-test]
key_files:
  created:
    - server/routes/env.js
    - server/routes/env.test.js
  modified:
    - server/index.js
    - server/routes/proxy.js
decisions:
  - ENV_FILE_PATH hardcoded constant prevents any path traversal — no request input can change target
  - EXDEV (cross-device rename) fallback to copyFileSync+unlink ensures atomic semantics across filesystem boundaries
  - Malformed lines (no = sign) treated as comments rather than erroring — preserves round-trip fidelity
  - Tests use inlined pure functions to avoid fs.readFileSync mocking complexity while still exercising all parser/serialiser logic
metrics:
  duration: ~10 minutes
  completed: "2026-05-09"
  tasks_completed: 2
  files_changed: 4
---

# Phase 54 Plan 01: Backend API for Global Env Editor Summary

**One-liner:** Express route module exposes `/home/services/.env.production` as structured JSON via GET/PUT with atomic temp-rename write and hardcoded path preventing path traversal.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (TDD-RED) | Add failing tests for env route | 440bc85 | server/routes/env.test.js |
| 1 (TDD-GREEN) | Implement GET /api/env and PUT /api/env | 68b88a0 | server/routes/env.js |
| 2 | Mount envRouter + add proxy prefix | ad9134b | server/index.js, server/routes/proxy.js |

## What Was Built

**`server/routes/env.js`** — Express router with two handlers:

- `GET /api/env` — reads `/home/services/.env.production`, parses each line into `{ type, key?, value?, raw }` rows, returns `{ path, rows }`. Returns empty rows on ENOENT, 403 on EACCES, 500 on other errors.
- `PUT /api/env` — accepts `{ rows: [...] }`, serialises back to file content, writes atomically via temp file + `renameSync`. Returns `{ ok: true, written: N }` where N is the number of entry-type rows. Returns 400 if rows is not an array, 403 on permission error, 500 on other failures.

**Parser behaviour:** Splits on first `=` only (values like `foo=bar=baz` are preserved correctly). Blank lines → `type: "blank"`. Lines starting with `#` → `type: "comment"`. Both are round-tripped verbatim via `raw` field. Malformed lines (no `=`) are classified as comments.

**Atomic write safety:** Content written to `/tmp/env-production-{timestamp}.tmp` with mode 0o600 first. On success, `renameSync` to target. If `renameErr.code === 'EXDEV'` (cross-device), falls back to `copyFileSync` + `unlinkSync`. If temp write fails, target is never touched.

**Security (T-54-01 mitigated):** `ENV_FILE_PATH = '/home/services/.env.production'` is a module-level constant. No request field (`req.params`, `req.query`, `req.body`) contributes to the file path.

**`server/index.js`:** `envRouter` required at line 40, mounted at `app.use("/api/env", envRouter)` before the `/api/events` mount.

**`server/routes/proxy.js`:** `/api/env` added to `PROXY_PREFIXES` so Railway tunnel forwards all `/api/env` requests to the local VPS where the actual file lives.

## Verification

- `node --test server/routes/env.test.js` — 7/7 tests pass
- `npm run test:server` — 332 pass, 10 fail (all 10 failures are pre-existing on the base commit; no regressions introduced)
- `grep "envRouter" server/index.js` — shows require (line 40) and app.use (line 117)
- `grep "'/api/env'" server/routes/proxy.js` — shows proxy prefix (line 14)
- `node -e "require('./server/routes/env')"` — exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This is a pure backend plan; no UI data wiring yet (Plan 02 owns the UI layer).

## Threat Flags

No new security surfaces beyond those enumerated in the plan's threat model. All T-54-0x threats addressed as specified.

## Self-Check: PASSED

- server/routes/env.js: FOUND
- server/routes/env.test.js: FOUND
- commit 440bc85: FOUND (TDD RED)
- commit 68b88a0: FOUND (TDD GREEN)
- commit ad9134b: FOUND (Task 2 mount)
