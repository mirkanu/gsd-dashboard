const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

// Set up isolated test database BEFORE requiring any server modules
const TEST_DB = path.join(os.tmpdir(), `dashboard-config-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

const { createApp, startServer } = require("../index");
const { db, stmts, GLOBAL_SETTINGS_KEY } = require("../db");

let server;
let BASE;

function fetchJson(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || "GET",
      headers: { "Content-Type": "application/json", ...options.headers },
    };
    const req = http.request(opts, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          parsed = body;
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

before(async () => {
  const app = createApp();
  server = await startServer(app, 0);
  const addr = server.address();
  BASE = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  if (server) server.close();
  if (db) db.close();
  try {
    fs.unlinkSync(TEST_DB);
    fs.unlinkSync(TEST_DB + "-wal");
    fs.unlinkSync(TEST_DB + "-shm");
  } catch {
    // ignore cleanup errors
  }
  setTimeout(() => process.exit(0), 100);
});

beforeEach(() => {
  // Clean project_settings table between tests for isolation
  db.prepare("DELETE FROM project_settings").run();
});

describe("Project settings — global row support", () => {
  it("PUT /api/config/project-settings/__global__ stores global defaults", async () => {
    const res = await fetchJson(`/api/config/project-settings/${GLOBAL_SETTINGS_KEY}`, {
      method: "PUT",
      body: {
        verbosity: "verbose",
        telegram_alerts: { taskComplete: true, waitingOnUser: false },
      },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.settings.verbosity, "verbose");
    assert.deepEqual(res.body.settings.telegram_alerts, {
      taskComplete: true,
      waitingOnUser: false,
    });

    // DB row should exist with the __global__ key
    const row = stmts.getProjectSettings.get(GLOBAL_SETTINGS_KEY);
    assert.ok(row);
    assert.equal(row.verbosity, "verbose");
  });

  it("GET /api/config/project-settings/__global__ returns what was stored", async () => {
    await fetchJson(`/api/config/project-settings/${GLOBAL_SETTINGS_KEY}`, {
      method: "PUT",
      body: {
        verbosity: "quiet",
        telegram_alerts: { taskComplete: false, waitingOnUser: true },
      },
    });

    const res = await fetchJson(`/api/config/project-settings/${GLOBAL_SETTINGS_KEY}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.verbosity, "quiet");
    assert.deepEqual(res.body.telegram_alerts, {
      taskComplete: false,
      waitingOnUser: true,
    });
  });

  it("GET /api/config/project-settings/<unknown> returns global defaults when no row exists", async () => {
    // Seed global
    await fetchJson(`/api/config/project-settings/${GLOBAL_SETTINGS_KEY}`, {
      method: "PUT",
      body: {
        verbosity: "verbose",
        telegram_alerts: { taskComplete: true, waitingOnUser: true },
      },
    });

    const res = await fetchJson(`/api/config/project-settings/some-new-project`);
    assert.equal(res.status, 200);
    assert.equal(res.body.project_key, "some-new-project");
    assert.equal(res.body.verbosity, "verbose");
    assert.deepEqual(res.body.telegram_alerts, {
      taskComplete: true,
      waitingOnUser: true,
    });

    // Should NOT have auto-created a row
    const row = stmts.getProjectSettings.get("some-new-project");
    assert.equal(row, undefined);
  });

  it("GET /api/config/project-settings/<unknown> returns hardcoded defaults when no global row", async () => {
    const res = await fetchJson(`/api/config/project-settings/brand-new`);
    assert.equal(res.status, 200);
    assert.equal(res.body.verbosity, "normal");
    assert.deepEqual(res.body.telegram_alerts, {
      taskComplete: false,
      waitingOnUser: false,
    });
  });

  it("POST /api/config/project-settings/apply-global updates all non-global rows", async () => {
    // Seed two project rows
    await fetchJson(`/api/config/project-settings/proj-a`, {
      method: "PUT",
      body: { verbosity: "quiet", telegram_alerts: {} },
    });
    await fetchJson(`/api/config/project-settings/proj-b`, {
      method: "PUT",
      body: { verbosity: "normal", telegram_alerts: { taskComplete: false } },
    });

    // Set global
    await fetchJson(`/api/config/project-settings/${GLOBAL_SETTINGS_KEY}`, {
      method: "PUT",
      body: {
        verbosity: "verbose",
        telegram_alerts: { taskComplete: true, waitingOnUser: true },
      },
    });

    // Apply
    const res = await fetchJson(`/api/config/project-settings/apply-global`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.updated, 2);

    // Both project rows should now match global
    const a = await fetchJson(`/api/config/project-settings/proj-a`);
    const b = await fetchJson(`/api/config/project-settings/proj-b`);
    assert.equal(a.body.verbosity, "verbose");
    assert.deepEqual(a.body.telegram_alerts, {
      taskComplete: true,
      waitingOnUser: true,
    });
    assert.equal(b.body.verbosity, "verbose");
    assert.deepEqual(b.body.telegram_alerts, {
      taskComplete: true,
      waitingOnUser: true,
    });

    // Global row remains intact
    const g = stmts.getProjectSettings.get(GLOBAL_SETTINGS_KEY);
    assert.ok(g);
    assert.equal(g.verbosity, "verbose");
  });

  it("POST /api/config/project-settings/apply-global returns 400 when no global row exists", async () => {
    const res = await fetchJson(`/api/config/project-settings/apply-global`, {
      method: "POST",
    });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /No global settings/i);
  });

  it("listProjectSettings excludes the __global__ row", async () => {
    await fetchJson(`/api/config/project-settings/${GLOBAL_SETTINGS_KEY}`, {
      method: "PUT",
      body: { verbosity: "verbose", telegram_alerts: {} },
    });
    await fetchJson(`/api/config/project-settings/proj-x`, {
      method: "PUT",
      body: { verbosity: "normal", telegram_alerts: {} },
    });

    const rows = stmts.listProjectSettings.all();
    const keys = rows.map((r) => r.project_key);
    assert.ok(!keys.includes(GLOBAL_SETTINGS_KEY));
    assert.ok(keys.includes("proj-x"));

    // GET /api/config/project-settings should also exclude __global__
    const res = await fetchJson(`/api/config/project-settings`);
    assert.equal(res.status, 200);
    const apiKeys = res.body.settings.map((s) => s.project_key);
    assert.ok(!apiKeys.includes(GLOBAL_SETTINGS_KEY));
    assert.ok(apiKeys.includes("proj-x"));
  });
});
