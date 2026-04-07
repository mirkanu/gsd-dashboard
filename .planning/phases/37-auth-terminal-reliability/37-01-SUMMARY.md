---
phase: 37-auth-terminal-reliability
plan: "01"
subsystem: auth
tags: [auth, cookie, session, security]
dependency_graph:
  requires: []
  provides: [cookie-auth-middleware, login-endpoint, logout-endpoint, client-auth-gate]
  affects: [server/index.js, client/src/App.tsx]
tech_stack:
  added: [crypto.randomBytes token store]
  patterns: [httpOnly cookie, in-memory token revocation, React auth gate]
key_files:
  created:
    - server/routes/auth.js
    - server/routes/auth.js
    - client/src/hooks/useAuth.ts
    - client/src/pages/Login.tsx
    - server/__tests__/auth.test.js
  modified:
    - server/index.js
    - client/src/App.tsx
    - client/src/pages/Settings.tsx
decisions:
  - "Cookie auth over JWT: simpler, no secret management, single-user dashboard"
  - "In-memory token store: sufficient for single-user local dashboard, survives server restarts revoke all sessions"
  - "Token revocation on logout: immediate invalidation without waiting for expiry"
  - "localhost always bypasses auth: preserves hook ingestion and local tooling"
metrics:
  duration_minutes: 45
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_modified: 6
---

# Phase 37 Plan 01: Cookie-Based Auth Summary

Cookie-based token auth replacing HTTP Basic Auth — 30-day httpOnly cookie with server-side revocation, client login page, and React auth gate.

## What Was Built

**Server (Task 1):**
- `server/routes/auth.js` — `POST /api/auth/login` (validates `DASHBOARD_PASS`, sets `gsd_token` httpOnly cookie) and `POST /api/auth/logout` (revokes token, clears cookie)
- In-memory token store (`Map<token, expiry_ms>`) with `isValidToken()` for fast lookup and automatic expiry cleanup
- `cookieAuth` middleware in `server/index.js` replaces `basicAuth` — preserves all skip-list paths and no-auth mode

**Client (Task 2):**
- `client/src/hooks/useAuth.ts` — probes `/api/stats` on mount to detect existing session, exposes `login()` / `logout()` callbacks
- `client/src/pages/Login.tsx` — centered dark card with password input, inline error, loading spinner, Enter-key submit
- `client/src/App.tsx` — auth gate: spinner while checking (`null`), Login form when unauthenticated (`false`), full dashboard when authenticated (`true`)
- `client/src/pages/Settings.tsx` — Sign out button at bottom using `logout` prop

## Commits

| Hash | Description |
|------|-------------|
| 1aba6f1 | test(37-01): add failing tests for cookie-based auth (TDD RED) |
| ae26b43 | feat(37-01): replace basicAuth with cookie-based token auth |
| 389c210 | feat(37-01): add client login page, useAuth hook, and auth gate in App.tsx |

## Verification

- `npm run test:server` (auth): 15/15 pass
- `npm run test:server` (combined): 121/122 pass (1 pre-existing failure in readProjectMeta unrelated to auth)
- `npm run test:client`: 115/117 pass (2 pre-existing failures in Sidebar.test.tsx v1.0.0 assertion)
- Production build: succeeds (1963 modules)

## Deviations from Plan

**1. [Rule 1 - Bug] Test isolation for concurrent describe blocks**
- **Found during:** Task 1 TDD (RED → GREEN)
- **Issue:** Node test runner executes `describe` blocks concurrently. A second `describe` that mutated `process.env.DASHBOARD_PASS` raced with the HTTP tests in the first `describe`, causing flaky failures.
- **Fix:** Removed the concurrent second server instance. Moved no-auth mode tests to pure logic unit tests that don't mutate global state.
- **Files modified:** `server/__tests__/auth.test.js`
- **Commit:** included in 1aba6f1

**2. [Rule 1 - Design] Localhost bypass means HTTP tests cannot verify 401 blocking**
- **Found during:** Task 1 GREEN verification
- **Issue:** `cookieAuth` always skips auth for `127.0.0.1` (by design, to keep hooks working). Tests using `127.0.0.1` base URL cannot exercise the 401 code path via HTTP.
- **Fix:** Replaced HTTP-based 401 tests with direct unit tests of `isValidToken` and the middleware cookie-parsing logic.
- **Files modified:** `server/__tests__/auth.test.js`
- **Commit:** included in 1aba6f1

## Pre-existing Failures (Out of Scope)

- `api.test.js` — `readProjectMeta: returns version and liveUrl for a project with PROJECT.md` — version field is null; unrelated to auth
- `Sidebar.test.tsx` — `should show version number` / `should show connections` — version display mismatch; unrelated to auth

## Self-Check: PASSED

All key files exist:
- FOUND: server/routes/auth.js
- FOUND: client/src/hooks/useAuth.ts
- FOUND: client/src/pages/Login.tsx
- FOUND: server/__tests__/auth.test.js

All commits exist:
- FOUND: 1aba6f1 (TDD RED)
- FOUND: ae26b43 (server implementation)
- FOUND: 389c210 (client implementation)
