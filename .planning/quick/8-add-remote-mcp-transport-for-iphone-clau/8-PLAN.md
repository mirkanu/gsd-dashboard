---
phase: quick-8
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/routes/mcp-remote.js
  - server/index.js
autonomous: true
requirements: [QUICK-8]
must_haves:
  truths:
    - "POST /mcp returns a valid MCP response (not 404 or 401)"
    - "GET /mcp returns 405 (method not allowed by protocol) or valid SSE stream, not 404"
    - "The /mcp path is exempt from basicAuth so Claude.ai can connect without credentials"
    - "All existing API routes and dashboard functionality are unaffected"
    - "npm run test:server passes"
  artifacts:
    - path: "server/routes/mcp-remote.js"
      provides: "Streamable HTTP MCP endpoint mounted at /mcp"
    - path: "server/index.js"
      provides: "Registers the /mcp route and auth bypass"
  key_links:
    - from: "server/index.js"
      to: "server/routes/mcp-remote.js"
      via: "require + app.use('/mcp')"
    - from: "server/routes/mcp-remote.js"
      to: "mcp/build/server.js"
      via: "dynamic import() — ESM from CommonJS"
    - from: "server/routes/mcp-remote.js"
      to: "mcp/build/config/app-config.js"
      via: "loadConfig() with dashboardBaseUrl = http://127.0.0.1:PORT"
---

<objective>
Mount a Streamable HTTP MCP endpoint at `/mcp` on the existing Express dashboard server so Claude.ai (web and mobile) can connect to it as a remote MCP server via the Railway URL.

Purpose: iPhone Claude access to the dashboard's MCP tools without running a separate process.
Output: `server/routes/mcp-remote.js` wired into `server/index.js`, /mcp endpoint live on Railway.
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@server/index.js
@mcp/src/server.ts
@mcp/src/config/app-config.ts

<interfaces>
<!-- Key types and contracts the executor needs. -->

From mcp/build/server.js (compiled from mcp/src/server.ts):
```javascript
// ESM module — must be loaded via dynamic import()
export function buildServer(config, api, logger) // returns McpServer
```

From mcp/build/config/app-config.js (compiled from mcp/src/config/app-config.ts):
```javascript
export function loadConfig(env = process.env) // returns AppConfig
// dashboardBaseUrl must be a local host (127.0.0.1, localhost, etc.)
// allowMutations defaults to false, allowDestructive defaults to false
```

From mcp/build/clients/dashboard-api-client.js:
```javascript
export class DashboardApiClient(config, logger) // makes HTTP calls to dashboardBaseUrl
```

From mcp/build/core/logger.js:
```javascript
export class Logger(logLevel) // "debug"|"info"|"warn"|"error"
```

StreamableHTTPServerTransport API (from @modelcontextprotocol/sdk v1.27.1):
```javascript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// ESM-only — must use dynamic import()
const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined }); // stateless
await server.connect(transport);
// Then handle requests:
transport.handleRequest(req, res, req.body); // for POST
transport.handleRequest(req, res);           // for GET and DELETE
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create server/routes/mcp-remote.js — Streamable HTTP MCP route</name>
  <files>server/routes/mcp-remote.js</files>
  <action>
Create `server/routes/mcp-remote.js` as a CommonJS module that exports an Express router handling POST, GET, and DELETE at `/` (mounted at `/mcp` in index.js).

The module must use dynamic `import()` to load the ESM mcp build. Use a module-level `let mcpRouter = null` and an async `initMcpRouter()` that lazily builds the router on first call, then caches it. Export a synchronous Express middleware that calls `initMcpRouter()` and awaits it, then delegates to the cached router.

Implementation outline:

```javascript
"use strict";
const express = require("express");

let _routerPromise = null;

async function initMcpRouter() {
  const PORT = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || "4820", 10);
  const dashboardUrl = `http://127.0.0.1:${PORT}`;

  // Dynamic ESM imports — mcp/build is ESM-only
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );
  const { buildServer } = await import("../../mcp/build/server.js");
  const { loadConfig } = await import("../../mcp/build/config/app-config.js");
  const { DashboardApiClient } = await import("../../mcp/build/clients/dashboard-api-client.js");
  const { Logger } = await import("../../mcp/build/core/logger.js");

  // Build a stateless MCP server instance pointed at self (127.0.0.1 passes local-host validation)
  const config = loadConfig({
    ...process.env,
    MCP_DASHBOARD_BASE_URL: dashboardUrl,
    MCP_DASHBOARD_ALLOW_MUTATIONS: process.env.MCP_REMOTE_ALLOW_MUTATIONS || "false",
    MCP_DASHBOARD_ALLOW_DESTRUCTIVE: "false",
  });
  const logger = new Logger("info");
  const api = new DashboardApiClient(config, logger);
  const mcpServer = buildServer(config, api, logger);

  // Stateless transport: new transport per request (no sessions)
  const router = express.Router();

  async function handleMcp(req, res) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await mcpServer.connect(transport);
    const body = req.method === "POST" ? req.body : undefined;
    await transport.handleRequest(req, res, body);
  }

  router.post("/", express.json({ limit: "1mb" }), (req, res) => {
    handleMcp(req, res).catch((err) => {
      console.error("[mcp-remote] error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: "MCP handler error" });
    });
  });

  router.get("/", (req, res) => {
    handleMcp(req, res).catch((err) => {
      console.error("[mcp-remote] error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: "MCP handler error" });
    });
  });

  router.delete("/", (req, res) => {
    handleMcp(req, res).catch((err) => {
      console.error("[mcp-remote] error:", err.message);
      if (!res.headersSent) res.status(500).json({ error: "MCP handler error" });
    });
  });

  return router;
}

// Lazy-init: first request triggers async init, subsequent requests use cached router
function mcpMiddleware(req, res, next) {
  if (!_routerPromise) {
    _routerPromise = initMcpRouter().catch((err) => {
      _routerPromise = null; // allow retry on next request
      throw err;
    });
  }
  _routerPromise.then((router) => router(req, res, next)).catch((err) => {
    console.error("[mcp-remote] init error:", err.message);
    res.status(503).json({ error: "MCP server unavailable" });
  });
}

module.exports = mcpMiddleware;
```

Note: `mcpServer.connect(transport)` is called per-request because each stateless transport is independent. This is correct for stateless mode — the McpServer itself is shared but each transport handles one HTTP exchange.
  </action>
  <verify>node -e "require('./server/routes/mcp-remote.js'); console.log('OK')"</verify>
  <done>File exists, require() succeeds without syntax errors</done>
</task>

<task type="auto">
  <name>Task 2: Wire /mcp into server/index.js with auth bypass</name>
  <files>server/index.js</files>
  <action>
Make two targeted edits to `server/index.js`:

1. Add the mcp-remote require at the top with the other route requires:
```javascript
const mcpRemote = require("./routes/mcp-remote");
```

2. In the `basicAuth` function, add a bypass for /mcp BEFORE the credential check (after the existing path checks):
```javascript
if (req.path.startsWith("/mcp")) return next();
```

3. In `createApp()`, register the route BEFORE the catch-all static file handler (add it after the `/api/gsd` route line):
```javascript
app.use("/mcp", mcpRemote);
```

The order matters: /mcp must be registered before the `app.get("*", ...)` static fallback in startServer(). Since routes are added in createApp() and the static fallback is in startServer() after createApp(), the ordering is correct as long as `app.use("/mcp", mcpRemote)` is inside `createApp()`.

After editing, verify the server still starts:
```bash
cd /data/home/gsddashboard && node -e "const {createApp} = require('./server/index.js'); console.log('createApp OK')"
```
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:server 2>&1 | tail -20</automated>
  </verify>
  <done>
    - server/index.js loads without errors
    - basicAuth skips /mcp paths
    - /mcp route is registered in createApp()
    - npm run test:server passes
  </done>
</task>

<task type="auto">
  <name>Task 3: Build MCP and smoke-test the /mcp endpoint locally</name>
  <files></files>
  <action>
First ensure the MCP TypeScript build is current (the route depends on mcp/build/):
```bash
cd /data/home/gsddashboard && npm run mcp:build
```

Then start the server in the background and test the /mcp endpoint:
```bash
# Start server (background)
PORT=4899 node server/index.js &
SERVER_PID=$!
sleep 2

# Test 1: POST /mcp — should get a valid JSON-RPC response (not 401 or 404)
curl -s -o /tmp/mcp_post.json -w "%{http_code}" \
  -X POST http://localhost:4899/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.0.1"}},"id":1}'

cat /tmp/mcp_post.json

# Test 2: GET /mcp — should not 404
curl -s -o /dev/null -w "%{http_code}" http://localhost:4899/mcp

# Test 3: /api/health still works (existing routes unaffected)
curl -s http://localhost:4899/api/health

kill $SERVER_PID 2>/dev/null
```

Expected results:
- POST /mcp: HTTP 200 with JSON containing `"result"` key (MCP initialize response)
- GET /mcp: HTTP 200 or 405 (not 404, not 401)
- /api/health: `{"status":"ok",...}`

If POST /mcp returns an error about `mcpServer.connect` being called multiple times, adjust the route to create a fresh McpServer per request using `buildServer()` instead of sharing the instance. (The transport is already per-request; the server may also need to be per-request if connect() is not idempotent.)
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run mcp:build 2>&1 | tail -5</automated>
  </verify>
  <done>
    - npm run mcp:build succeeds
    - POST /mcp returns HTTP 200 with valid MCP JSON-RPC response
    - /api/health returns 200 (existing routes unaffected)
    - Server connects without errors in stderr
  </done>
</task>

</tasks>

<verification>
Full verification sequence:

1. `npm run mcp:build` — MCP TypeScript compiles cleanly
2. `npm run test:server` — All server tests pass
3. Start server on a test port, POST to /mcp with MCP initialize payload, confirm JSON-RPC response
4. Confirm /mcp path is not blocked by basicAuth (no 401 even when DASHBOARD_PASS is set)
5. Confirm existing /api/* routes still work

**Claude.ai connection instructions (for user to try on iPhone):**
1. Open Claude.ai → Settings → Connectors (or Integrations)
2. Add MCP server with URL: `https://{your-railway-domain}.railway.app/mcp`
3. No authentication required
4. Available tools will appear in Claude's tool list
</verification>

<success_criteria>
- POST https://your-app.railway.app/mcp responds with valid MCP JSON-RPC (HTTP 200)
- Claude.ai mobile can connect to the Railway URL as a remote MCP server
- No regression: all existing dashboard routes and functionality work
- npm run test:server passes
- npm run mcp:build passes
</success_criteria>

<output>
After completion, create `.planning/quick/8-add-remote-mcp-transport-for-iphone-clau/8-SUMMARY.md` documenting what was built, files changed, and the Railway URL to enter in Claude.ai settings.
</output>
