---
plan: 07-01
status: completed
completed: 2026-03-22
phase: 07-agent-data-proxy
subsystem: server
tags: [proxy, middleware, agent-data, express]
dependency_graph:
  requires: []
  provides: [createAgentProxy middleware factory]
  affects: [server/index.js, agent data GET routes]
tech_stack:
  added: []
  patterns: [middleware factory, upstream proxy with fetch + AbortSignal.timeout]
key_files:
  created:
    - server/routes/proxy.js
  modified:
    - server/index.js
decisions:
  - GSD_DATA_URL defined at module level in index.js (consistent with existing gsd.js pattern)
  - basicAuth skips all 5 agent route prefixes so Railway proxy can reach local server without credentials
metrics:
  duration: ~5 min
  tasks_completed: 2
  files_changed: 2
---

# Phase 7 Plan 01: Agent Data Proxy Middleware Summary

## One-liner
Express middleware factory that transparently proxies agent data GET routes to an upstream `GSD_DATA_URL` server with 10s timeout, falling back to local SQLite when unset.

## What was built
- Created `server/routes/proxy.js` exporting `createAgentProxy(gsdDataUrl)` middleware factory
- When `gsdDataUrl` is falsy: returns no-op middleware (local SQLite path unchanged)
- When `gsdDataUrl` is set: intercepts GET requests to /api/sessions, /api/agents, /api/events, /api/stats, /api/analytics and forwards them to the upstream with a 10s timeout
- POST/PATCH requests always pass through to local handlers
- Updated `server/index.js`: imported `createAgentProxy`, added `GSD_DATA_URL` constant, mounted proxy before agent routers, updated `basicAuth` to skip agent route prefixes

## Verification
- `npm run test:server` passed (71/73 tests; 2 pre-existing failures unrelated to this plan, confirmed by running tests before and after changes)

## Deviations from Plan
None - plan executed exactly as written.

## Self-Check: PASSED
- server/routes/proxy.js: FOUND
- 07-01-SUMMARY.md: FOUND
- Commits 1bf84b4, 83d1f79: FOUND
- createAgentProxy exports as function: CONFIRMED
