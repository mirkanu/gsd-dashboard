if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { initWebSocket } = require("./websocket");
const { attachTerminalWS } = require("./routes/terminal");
const { startStateBroadcaster } = require("./gsd/stateBroadcaster");

const sessionsRouter = require("./routes/sessions");
const agentsRouter = require("./routes/agents");
const eventsRouter = require("./routes/events");
const statsRouter = require("./routes/stats");
const hooksRouter = require("./routes/hooks");
const analyticsRouter = require("./routes/analytics");
const { router: pricingRouter } = require("./routes/pricing");
const settingsRouter = require("./routes/settings");
const gsdRouter = require("./routes/gsd");
const autopilotRouter = require("./routes/autopilot");
const servicesRouter = require("./routes/services");
const servicesRulesRouter = require("./routes/services-rules");
const appSettingsRouter = require("./routes/app-settings");
const webhooksEmailRouter = require("./routes/webhooks-email");
const configRouter = require("./routes/config");
const { createAgentProxy } = require("./routes/proxy");
const mcpRemote = require("./routes/mcp-remote");
const { startReplyPoller, stopReplyPoller, ENABLED: telegramEnabled } = require("./gsd/telegram");
const { authRouter, isValidToken } = require("./routes/auth");
const projectsRouter = require("./routes/projects");

function cookieAuth(req, res, next) {
  // Skip auth for localhost
  const host = req.hostname || "";
  if (host === "localhost" || host === "127.0.0.1") return next();

  // Skip auth for MCP (Claude.ai connects without credentials)
  if (req.path.startsWith("/mcp")) return next();

  // All API routes and static assets are public — client-side auth gate in App.tsx
  // handles UI access control. This single-user dashboard doesn't need per-route server auth.
  // Only /api/auth/login validates the password and sets the cookie.
  return next();
}

function createApp() {
  const app = express();
  const gsdDataUrl = (process.env.GSD_DATA_URL || "").replace(/\/$/, "");

  app.use(cookieAuth);
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(createAgentProxy(gsdDataUrl));

  app.use("/api/auth", authRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/agents", agentsRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/hooks", hooksRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/pricing", pricingRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/gsd", gsdRouter);
  app.use("/api/autopilot", autopilotRouter);
  // Phase 45: mount /api/services/rules BEFORE /api/services so the sub-route
  // matches before the catch-all services router.
  app.use("/api/services/rules", servicesRulesRouter);
  app.use("/api/services", servicesRouter);
  app.use("/api/app-settings", appSettingsRouter);
  app.use("/api/webhooks/email", webhooksEmailRouter);
  app.use("/api/config", configRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/mcp", mcpRemote);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return app;
}

function startServer(app, port) {
  const server = http.createServer(app);
  initWebSocket(server);
  attachTerminalWS(server);

  // State broadcaster — pushes `project_state_change` messages over WebSocket
  // when a project transitions state. Two modes:
  //   - Local (no GSD_DATA_URL): poll tmux directly every ~2s.
  //   - Proxy (GSD_DATA_URL set — Railway): poll upstream /api/gsd/projects
  //     every ~2s and diff sessionState against the previous snapshot. This is
  //     required because Railway WS clients can't reach the local broadcaster.
  const { broadcast } = require("./websocket");
  if (process.env.GSD_DATA_URL) {
    const { startProxyStateBroadcaster } = require("./gsd/proxyStateBroadcaster");
    const upstream = process.env.GSD_DATA_URL.replace(/\/$/, "");
    startProxyStateBroadcaster(upstream, broadcast);
  } else {
    const loadProjectsLocal = () => {
      const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../gsd-projects.json");
      const fs = require("fs");
      return JSON.parse(fs.readFileSync(configPath, "utf8"));
    };
    startStateBroadcaster(loadProjectsLocal, broadcast);

    // Idle detector — auto-close sessions idle > threshold (default 2h)
    // Only runs on the local machine where tmux lives, never in proxy/Railway mode.
    const { startIdleDetector } = require('./gsd/idleDetector');
    startIdleDetector(loadProjectsLocal);
  }

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    const clientDist = path.join(__dirname, "..", "client", "dist");
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Exiting.`);
        process.exit(1);
      }
      reject(err);
    });
    server.listen(port, () => {
      const mode = isProduction ? "production" : "development";
      console.log(`Agent Dashboard server running on http://localhost:${port} (${mode})`);
      if (!isProduction) {
        console.log(`Client dev server expected at http://localhost:5173`);
      }
      resolve(server);
    });
  });
}

if (require.main === module) {
  const PORT = parseInt(process.env.PORT || process.env.DASHBOARD_PORT || "4820", 10);

  const app = createApp();
  startServer(app, PORT).then(() => {
    if (telegramEnabled) startReplyPoller();

    // Warm the projects cache on startup so the first client request is instant.
    // Hit our own endpoint which populates the in-memory cache.
    fetch(`http://localhost:${PORT}/api/gsd/projects`, { signal: AbortSignal.timeout(15000) })
      .then(r => r.json())
      .then(() => console.log("[cache] Projects cache warmed"))
      .catch(() => console.log("[cache] Projects cache warm failed"));
  });

  process.on('SIGTERM', () => {
    stopReplyPoller();
    process.exit(0);
  });

  // Auto-install Claude Code hooks on every startup so users don't have to
  try {
    const { installHooks } = require("../scripts/install-hooks");
    installHooks(true);
    console.log("Claude Code hooks auto-configured.");
  } catch {
    // Non-fatal — user can run npm run install-hooks manually
  }

  // Periodic maintenance sweep (every 2 min):
  // 1. Mark abandoned sessions that slipped through event-based detection
  // 2. Scan active sessions' JSONL files for new compaction entries
  //    (/compact fires no hooks, so compaction agents only appear on next hook event
  //    without this scanner)
  const cleanupDb = require("./db");
  const { broadcast } = require("./websocket");
  const { importCompactions, findCompactionsInFile } = require("../scripts/import-history");
  setInterval(
    () => {
      // 0. Log memory usage for trend monitoring
      const mem = process.memoryUsage();
      const fmt = (b) => (b / 1024 / 1024).toFixed(1);
      console.log(`[maintenance] heap: ${fmt(mem.heapUsed)}/${fmt(mem.heapTotal)}MB rss: ${fmt(mem.rss)}MB external: ${fmt(mem.external)}MB`);

      // 1. Stale session cleanup
      const stale = cleanupDb.stmts.findStaleSessions.all("__periodic__", 5);
      const now = new Date().toISOString();
      for (const s of stale) {
        const agents = cleanupDb.stmts.listAgentsBySession.all(s.id);
        for (const agent of agents) {
          if (agent.status !== "completed" && agent.status !== "error") {
            cleanupDb.stmts.updateAgent.run(null, "completed", null, null, now, null, agent.id);
            broadcast("agent_updated", cleanupDb.stmts.getAgent.get(agent.id));
          }
        }
        cleanupDb.stmts.updateSession.run(null, "abandoned", now, null, s.id);
        broadcast("session_updated", cleanupDb.stmts.getSession.get(s.id));
      }

      // 2. Scan active sessions for new compaction entries
      const active = cleanupDb.db
        .prepare(
          "SELECT DISTINCT e.session_id, json_extract(e.data, '$.transcript_path') as tp FROM events e JOIN sessions s ON s.id = e.session_id WHERE s.status = 'active' AND json_extract(e.data, '$.transcript_path') IS NOT NULL GROUP BY e.session_id ORDER BY MAX(e.id) DESC"
        )
        .all();
      for (const row of active) {
        if (!row.tp) continue;
        try {
          const compactions = findCompactionsInFile(row.tp);
          if (compactions.length === 0) continue;
          const mainAgentId = `${row.session_id}-main`;
          const created = importCompactions(cleanupDb, row.session_id, mainAgentId, compactions);
          if (created > 0) {
            broadcast(
              "agent_created",
              cleanupDb.stmts.getAgent.get(
                `${row.session_id}-compact-${compactions[compactions.length - 1].uuid}`
              )
            );
          }
        } catch {
          continue;
        }
      }
    },
    2 * 60 * 1000
  );

  // Event loop liveness watchdog — exit if event loop is blocked for >30s
  // Node --watch will auto-restart the process on exit
  let lastTick = Date.now();
  const WATCHDOG_INTERVAL = 10_000;  // check every 10s
  const WATCHDOG_THRESHOLD = 30_000; // 30s without a tick = hung
  setInterval(() => { lastTick = Date.now(); }, WATCHDOG_INTERVAL).unref();
  setInterval(() => {
    const lag = Date.now() - lastTick;
    if (lag > WATCHDOG_THRESHOLD) {
      console.error(`[watchdog] Event loop blocked for ${(lag / 1000).toFixed(0)}s — exiting for restart`);
      process.exit(1);
    }
  }, WATCHDOG_INTERVAL).unref();

  // Auto-import legacy sessions and backfill compaction tracking on startup
  const { importAllSessions, backfillCompactions } = require("../scripts/import-history");
  const dbModule = require("./db");
  importAllSessions(dbModule)
    .then(({ imported, skipped, errors }) => {
      if (imported > 0) console.log(`Imported ${imported} legacy sessions from ~/.claude/`);
      if (errors > 0) console.log(`${errors} session files had errors during import`);
    })
    .then(() => backfillCompactions(dbModule))
    .then(({ backfilled }) => {
      if (backfilled > 0) console.log(`Backfilled ${backfilled} compaction events from ~/.claude/`);
    })
    .catch(() => {
      // Non-fatal — legacy import is best-effort
    });
}

module.exports = { createApp, startServer };
