if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { initWebSocket } = require("./websocket");

const sessionsRouter = require("./routes/sessions");
const agentsRouter = require("./routes/agents");
const eventsRouter = require("./routes/events");
const statsRouter = require("./routes/stats");
const hooksRouter = require("./routes/hooks");
const analyticsRouter = require("./routes/analytics");
const pricingRouter = require("./routes/pricing");
const settingsRouter = require("./routes/settings");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/sessions", sessionsRouter);
  app.use("/api/agents", agentsRouter);
  app.use("/api/events", eventsRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/hooks", hooksRouter);
  app.use("/api/analytics", analyticsRouter);
  app.use("/api/pricing", pricingRouter);
  app.use("/api/settings", settingsRouter);

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  return app;
}

function startServer(app, port) {
  const server = http.createServer(app);
  initWebSocket(server);

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    const clientDist = path.join(__dirname, "..", "client", "dist");
    app.use(express.static(clientDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return new Promise((resolve) => {
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
  const PORT = parseInt(process.env.DASHBOARD_PORT || "4820", 10);
  const app = createApp();
  startServer(app, PORT);

  // Auto-install Claude Code hooks on every startup so users don't have to
  try {
    const { installHooks } = require("../scripts/install-hooks");
    installHooks(true);
    console.log("Claude Code hooks auto-configured.");
  } catch {
    // Non-fatal — user can run npm run install-hooks manually
  }

  // Auto-import legacy sessions from ~/.claude/ on startup
  const { importAllSessions } = require("../scripts/import-history");
  const dbModule = require("./db");
  importAllSessions(dbModule)
    .then(({ imported, skipped, errors }) => {
      if (imported > 0) console.log(`Imported ${imported} legacy sessions from ~/.claude/`);
      if (errors > 0) console.log(`${errors} session files had errors during import`);
    })
    .catch(() => {
      // Non-fatal — legacy import is best-effort
    });
}

module.exports = { createApp, startServer };
