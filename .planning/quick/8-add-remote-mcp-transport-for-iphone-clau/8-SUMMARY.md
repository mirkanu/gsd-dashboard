---
phase: quick-8
plan: 01
subsystem: mcp
tags: [mcp, remote, streamable-http, railway, iphone, claude-ai]

# Dependency graph
requires:
  - "mcp/build/* (compiled MCP server)"
  - "server/index.js (Express app)"
provides:
  - "Streamable HTTP MCP endpoint at /mcp on the Express dashboard server"
  - "Claude.ai remote MCP integration via Railway URL"
affects: [server/index.js, mcp-remote]

# Tech tracking
tech-stack:
  added:
    - "@modelcontextprotocol/sdk StreamableHTTPServerTransport (stateless mode)"
  patterns:
    - "Per-request McpServer + transport (stateless Streamable HTTP) — connect() is not idempotent"
    - "Absolute path dynamic import() to resolve ESM packages from a sibling node_modules directory"
    - "Lazy-init pattern with cached router promise and retry-on-error reset"

key-files:
  created:
    - server/routes/mcp-remote.js
  modified:
    - server/index.js

key-decisions:
  - "Per-request McpServer: buildServer() called each request because McpServer.connect() cannot be called more than once per instance"
  - "Absolute SDK path import: @modelcontextprotocol/sdk is in mcp/node_modules, not project root; dynamic import() from server/ context requires explicit absolute path"
  - "Auth bypass added before credential check in basicAuth so Claude.ai can connect without credentials"
  - "Lazy-init with cached _routerPromise: ESM imports happen once on first request, router is reused"

patterns-established:
  - "Dynamic ESM import from CJS: use path.resolve() + path.join() to build absolute paths into mcp/node_modules when the SDK is scoped to a subdirectory"

requirements-completed: [QUICK-8]

# Metrics
duration: ~20min
completed: 2026-03-31
---

# Quick Task 8: Add Remote MCP Transport for iPhone Claude — Summary

**One-liner:** Streamable HTTP MCP endpoint at /mcp using per-request McpServer + transport, wired into Express with auth bypass, accessible at `https://{railway-domain}/mcp`.

## What Was Built

A `/mcp` endpoint on the existing Express dashboard server that implements the MCP Streamable HTTP transport protocol. Claude.ai (web and mobile) can connect to it as a remote MCP server using the Railway deployment URL — no separate process or port needed.

## Files Changed

| File | Change |
|------|--------|
| `server/routes/mcp-remote.js` | New — lazy-init Express router using dynamic ESM imports, per-request McpServer + StreamableHTTPServerTransport |
| `server/index.js` | Modified — added require, basicAuth bypass for /mcp, and `app.use('/mcp', mcpRemote)` in createApp() |

## Implementation Notes

### Stateless mode (per-request server)
The plan originally suggested sharing a single `McpServer` instance and creating a new transport per request. During smoke testing, this would fail because `McpServer.connect()` is not idempotent — calling it twice throws. The fix (caught as an inline note in the plan's task 3) is to call `buildServer()` per request as well. Both `buildServer()` and `new StreamableHTTPServerTransport()` are called fresh per request.

### ESM/CJS boundary
The `@modelcontextprotocol/sdk` is only installed in `mcp/node_modules`, not the project root. When `server/routes/mcp-remote.js` (a CJS file) calls `import('@modelcontextprotocol/sdk/server/streamableHttp.js')`, Node resolves from the calling file's directory — where the SDK is not installed. Fix: compute the absolute path to the SDK dist file via `path.join(MCP_DIR, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm', 'server', 'streamableHttp.js')` and use that directly.

### Auth bypass
Added `if (req.path.startsWith("/mcp")) return next()` in the `basicAuth` middleware before credential checks. Claude.ai connects without credentials.

## Smoke Test Results

```
POST /mcp (with Accept: application/json, text/event-stream)
  HTTP 200
  data: {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"agent-dashboard-mcp","version":"1.0.0"}},"jsonrpc":"2.0","id":1}

GET /api/health → 200 (existing routes unaffected)
npm run test:server → same pre-existing failures, no regressions
npm run mcp:build → clean build
```

## Claude.ai Connection Instructions

To connect from iPhone or Claude.ai web:

1. Open Claude.ai → Settings → Integrations (or Connectors)
2. Add MCP server URL: `https://{your-railway-domain}.railway.app/mcp`
3. No authentication required
4. Available tools will appear in Claude's tool list after connection

Deploy with `railway up --detach` to push changes to Railway.

## Commits

| Hash | Message |
|------|---------|
| e249459 | feat(quick-8): create mcp-remote.js Streamable HTTP MCP route |
| e6a5a80 | feat(quick-8): wire /mcp route and auth bypass into server/index.js |
| 5f04a6f | fix(quick-8): resolve SDK import path via absolute mcp/node_modules path |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Per-request McpServer instead of shared instance**
- **Found during:** Task 3 smoke test
- **Issue:** Plan suggested sharing one McpServer and creating a new transport per request. McpServer.connect() is not idempotent — second call would throw.
- **Fix:** Call buildServer() per request (inside handleMcp). Both server and transport are created fresh per HTTP request.
- **Files modified:** server/routes/mcp-remote.js
- **Commit:** 5f04a6f

**2. [Rule 3 - Blocking] SDK import fails from server/ context**
- **Found during:** Task 3 smoke test (503 response with "Cannot find package @modelcontextprotocol/sdk")
- **Issue:** `@modelcontextprotocol/sdk` is installed in `mcp/node_modules` only. Dynamic `import()` from `server/routes/mcp-remote.js` resolves from that file's directory where the SDK is absent.
- **Fix:** Compute absolute path `MCP_DIR/node_modules/@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.js` and import via that. Similarly use absolute paths for all mcp/build/* imports.
- **Files modified:** server/routes/mcp-remote.js
- **Commit:** 5f04a6f
