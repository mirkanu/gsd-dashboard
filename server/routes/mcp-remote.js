"use strict";
const express = require("express");
const path = require("path");

let _routerPromise = null;

// Resolve the mcp package root so dynamic ESM imports can find @modelcontextprotocol/sdk
// which is installed in mcp/node_modules (not the project root).
const MCP_DIR = path.resolve(__dirname, "..", "..", "mcp");
const MCP_BUILD_DIR = path.join(MCP_DIR, "build");
const SDK_STREAMABLE = path.join(
  MCP_DIR,
  "node_modules",
  "@modelcontextprotocol",
  "sdk",
  "dist",
  "esm",
  "server",
  "streamableHttp.js"
);

async function initMcpRouter() {
  const PORT = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || "4820", 10);
  const dashboardUrl = `http://127.0.0.1:${PORT}`;

  // Dynamic ESM imports — mcp/build is ESM-only
  // Use absolute file paths so resolution works regardless of CWD or calling file location
  const { StreamableHTTPServerTransport } = await import(
    SDK_STREAMABLE
  );
  const { buildServer } = await import(path.join(MCP_BUILD_DIR, "server.js"));
  const { loadConfig } = await import(path.join(MCP_BUILD_DIR, "config", "app-config.js"));
  const { DashboardApiClient } = await import(path.join(MCP_BUILD_DIR, "clients", "dashboard-api-client.js"));
  const { Logger } = await import(path.join(MCP_BUILD_DIR, "core", "logger.js"));

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
