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

  // Stateless transport: new server + transport per request (connect() is not idempotent)
  const router = express.Router();

  async function handleMcp(req, res) {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    // Build a fresh server per request — connect() cannot be called more than once per McpServer
    const mcpServer = buildServer(config, api, logger);
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
