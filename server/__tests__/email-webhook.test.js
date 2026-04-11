// Phase 45 Plan 03 — POST /api/webhooks/email integration tests.
// Uses a real in-process Express app and a disposable SQLite DB.
// Mocks parserModule.parseServiceReceipt to avoid hitting the live Haiku API.

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

// Isolated test DB
const TEST_DB = path.join(os.tmpdir(), `email-webhook-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

// Require parser module FIRST so we can patch it before the route loads.
const parserModule = require("../services/email-parser");
const originalParser = parserModule.parseServiceReceipt;
parserModule.parseServiceReceipt = async (html /* , subject */) => {
  if (html && html.includes("$42.17")) {
    return {
      amount: 42.17,
      service: "Railway",
      currency: "USD",
      date: "2026-04-01",
      description: "test railway",
    };
  }
  return null; // any other body → unparsed
};

const { createApp, startServer } = require("../index");
const { db } = require("../db");

const FIXTURE_DIR = path.join(__dirname, "fixtures", "emails");
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), "utf8"));
}

let server;
let BASE;

function post(urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(buf);
          } catch {
            parsed = buf;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function get(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    http
      .get(
        { hostname: url.hostname, port: url.port, path: url.pathname },
        (res) => {
          let buf = "";
          res.on("data", (c) => (buf += c));
          res.on("end", () => {
            let parsed;
            try {
              parsed = JSON.parse(buf);
            } catch {
              parsed = buf;
            }
            resolve({ status: res.statusCode, body: parsed });
          });
        }
      )
      .on("error", reject);
  });
}

before(async () => {
  const app = createApp();
  server = await startServer(app, 0);
  const addr = server.address();
  BASE = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  parserModule.parseServiceReceipt = originalParser;
  if (server) server.close();
  if (db) db.close();
  try {
    fs.unlinkSync(TEST_DB);
    fs.unlinkSync(TEST_DB + "-wal");
    fs.unlinkSync(TEST_DB + "-shm");
  } catch {
    /* ignore */
  }
  setTimeout(() => process.exit(0), 100);
});

beforeEach(() => {
  // Clean state between tests
  db.prepare("DELETE FROM external_service_costs").run();
  db.prepare("DELETE FROM processed_emails").run();
  db.prepare("DELETE FROM service_mapping_rules").run();
});

describe("GET /api/webhooks/email", () => {
  it("health check returns {status:'ok'}", async () => {
    const res = await get("/api/webhooks/email");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: "ok" });
  });
});

describe("POST /api/webhooks/email", () => {
  it("parses Railway fixture → inserts cost row with source=email", async () => {
    const payload = loadFixture("railway");
    const res = await post("/api/webhooks/email", payload);
    assert.equal(res.status, 200);
    assert.equal(res.body.received, true);
    assert.equal(res.body.status, "parsed");
    assert.equal(res.body.service, "Railway");
    assert.equal(res.body.amount, 42.17);

    const rows = db
      .prepare("SELECT * FROM external_service_costs WHERE message_id = ?")
      .all("<railway-20260401-1@railway.app>");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "email");
    assert.equal(rows[0].service, "Railway");
    assert.equal(rows[0].cost_usd, 42.17);
    assert.equal(rows[0].notes, "email:<railway-20260401-1@railway.app>");
    assert.equal(rows[0].project_key, null);
  });

  it("duplicate message-id → status:duplicate, no double insert", async () => {
    const payload = loadFixture("railway");
    await post("/api/webhooks/email", payload);
    const res2 = await post("/api/webhooks/email", payload);
    assert.equal(res2.body.status, "duplicate");
    const rows = db
      .prepare("SELECT * FROM external_service_costs WHERE message_id = ?")
      .all("<railway-20260401-1@railway.app>");
    assert.equal(rows.length, 1);
  });

  it("payload with no message-id → status:no_message_id, no DB row", async () => {
    const res = await post("/api/webhooks/email", { trigger: { event: { headers: {}, body: { html: "" } } } });
    assert.equal(res.body.status, "no_message_id");
    const count = db.prepare("SELECT COUNT(*) as c FROM external_service_costs").get().c;
    assert.equal(count, 0);
  });

  it("unparseable body → status:unparsed, row with source=unparsed + raw_body", async () => {
    // OpenAI fixture body does NOT contain $42.17 → mock returns null
    const payload = loadFixture("openai");
    const res = await post("/api/webhooks/email", payload);
    assert.equal(res.body.status, "unparsed");
    const rows = db
      .prepare("SELECT * FROM external_service_costs WHERE message_id = ?")
      .all("<openai-20260402-1@openai.com>");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "unparsed");
    assert.equal(rows[0].service, "Other");
    assert.equal(rows[0].cost_usd, 0);
    assert.ok(rows[0].raw_body && rows[0].raw_body.includes("$18.90"));
    assert.equal(rows[0].notes, "email:<openai-20260402-1@openai.com>");
  });

  it("mapping rule assigns project_key to parsed row", async () => {
    db.prepare(
      "INSERT INTO service_mapping_rules (pattern_type, pattern_value, project_key, service) VALUES (?, ?, ?, ?)"
    ).run("sender", "railway.app", "gsddashboard", null);

    const payload = loadFixture("railway");
    const res = await post("/api/webhooks/email", payload);
    assert.equal(res.body.status, "parsed");

    const row = db
      .prepare("SELECT project_key FROM external_service_costs WHERE message_id = ?")
      .get("<railway-20260401-1@railway.app>");
    assert.equal(row.project_key, "gsddashboard");
  });
});
