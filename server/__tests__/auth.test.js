'use strict';

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

// Set up test database BEFORE requiring any server modules
const TEST_DB = path.join(os.tmpdir(), `dashboard-auth-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

// Helper to make HTTP requests
function request(base, urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, base);
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
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });

    req.on("error", reject);
    if (options.body) req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    req.end();
  });
}

describe("Auth endpoints (HTTP)", () => {
  let server;
  let BASE;
  const CORRECT_PASS = "test-password-123";

  before(async () => {
    process.env.DASHBOARD_PASS = CORRECT_PASS;
    const { createApp, startServer } = require("../index");
    const app = createApp();
    server = await startServer(app, 0);
    const addr = server.address();
    BASE = `http://127.0.0.1:${addr.port}`;
  });

  after(() => {
    delete process.env.DASHBOARD_PASS;
    if (server) server.close();
    try {
      fs.unlinkSync(TEST_DB);
      fs.unlinkSync(TEST_DB + "-wal");
      fs.unlinkSync(TEST_DB + "-shm");
    } catch {
      // ignore cleanup errors
    }
    setTimeout(() => process.exit(0), 100);
  });

  // ────────────────────────────────────────────────────────────
  // POST /api/auth/login
  // ────────────────────────────────────────────────────────────
  describe("POST /api/auth/login", () => {
    it("returns 200 and sets gsd_token cookie on correct password", async () => {
      const res = await request(BASE, "/api/auth/login", {
        method: "POST",
        body: { password: CORRECT_PASS },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.ok, true);
      const setCookie = res.headers["set-cookie"];
      assert.ok(setCookie, "Should set a cookie");
      const cookieStr = Array.isArray(setCookie) ? setCookie.join("; ") : setCookie;
      assert.ok(cookieStr.includes("gsd_token="), "Cookie should be named gsd_token");
      assert.ok(cookieStr.toLowerCase().includes("httponly"), "Cookie should be HttpOnly");
    });

    it("returns 401 JSON with error on wrong password", async () => {
      const res = await request(BASE, "/api/auth/login", {
        method: "POST",
        body: { password: "wrong-password" },
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, "Invalid password");
    });
  });

  // ────────────────────────────────────────────────────────────
  // POST /api/auth/logout
  // ────────────────────────────────────────────────────────────
  describe("POST /api/auth/logout", () => {
    it("clears the gsd_token cookie and returns 200", async () => {
      const logoutRes = await request(BASE, "/api/auth/logout", {
        method: "POST",
      });
      assert.equal(logoutRes.status, 200);
      assert.equal(logoutRes.body.ok, true);
    });
  });

  // ────────────────────────────────────────────────────────────
  // Skip list paths pass through (tested via localhost which always bypasses auth)
  // ────────────────────────────────────────────────────────────
  describe("Skip-listed paths accessible from localhost", () => {
    it("allows /api/health without cookie", async () => {
      const res = await request(BASE, "/api/health");
      assert.equal(res.status, 200);
    });

    it("allows /api/sessions without cookie", async () => {
      const res = await request(BASE, "/api/sessions");
      assert.notEqual(res.status, 401);
    });

    it("allows /api/stats without cookie", async () => {
      const res = await request(BASE, "/api/stats");
      assert.notEqual(res.status, 401);
    });

    it("allows /api/agents without cookie", async () => {
      const res = await request(BASE, "/api/agents");
      assert.notEqual(res.status, 401);
    });

    it("allows /api/events without cookie", async () => {
      const res = await request(BASE, "/api/events");
      assert.notEqual(res.status, 401);
    });

    it("allows /api/analytics without cookie", async () => {
      const res = await request(BASE, "/api/analytics");
      assert.notEqual(res.status, 401);
    });

    it("allows /api/auth/login without cookie (public endpoint)", async () => {
      const res = await request(BASE, "/api/auth/login", {
        method: "POST",
        body: { password: "any" },
      });
      // Should be 401 from wrong password, not from middleware (no AUTH_REQUIRED code)
      if (res.status === 401) {
        assert.notEqual(res.body.code, "AUTH_REQUIRED");
      }
    });
  });
});

// ────────────────────────────────────────────────────────────
// cookieAuth middleware — unit tests (bypass HTTP layer)
// These test the actual guard logic without the localhost bypass
// ────────────────────────────────────────────────────────────
describe("cookieAuth middleware logic (unit)", () => {
  let isValidToken;
  const TEST_PASS = "test-secret-pass";
  const crypto = require("crypto");

  before(() => {
    const auth = require("../routes/auth");
    isValidToken = auth.isValidToken;
  });

  const makeToken = (pass, offsetMs = 30 * 24 * 60 * 60 * 1000) => {
    const expiry = (Date.now() + offsetMs).toString(16);
    const sig = crypto.createHmac("sha256", pass).update(expiry).digest("hex");
    return `${expiry}.${sig}`;
  };

  it("isValidToken returns false for empty/null/undefined token", () => {
    const prev = process.env.DASHBOARD_PASS;
    process.env.DASHBOARD_PASS = TEST_PASS;
    try {
      assert.equal(isValidToken(""), false);
      assert.equal(isValidToken(null), false);
      assert.equal(isValidToken(undefined), false);
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_PASS;
      else process.env.DASHBOARD_PASS = prev;
    }
  });

  it("isValidToken returns false for malformed or tampered token", () => {
    const prev = process.env.DASHBOARD_PASS;
    process.env.DASHBOARD_PASS = TEST_PASS;
    try {
      assert.equal(isValidToken("notavalidtoken"), false);
      const valid = makeToken(TEST_PASS);
      const tampered = valid.slice(0, -4) + "0000";
      assert.equal(isValidToken(tampered), false);
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_PASS;
      else process.env.DASHBOARD_PASS = prev;
    }
  });

  it("isValidToken returns false for expired token", () => {
    const prev = process.env.DASHBOARD_PASS;
    process.env.DASHBOARD_PASS = TEST_PASS;
    try {
      const expired = makeToken(TEST_PASS, -1000);
      assert.equal(isValidToken(expired), false);
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_PASS;
      else process.env.DASHBOARD_PASS = prev;
    }
  });

  it("cookieAuth allows requests with a valid HMAC token", () => {
    const prev = process.env.DASHBOARD_PASS;
    process.env.DASHBOARD_PASS = TEST_PASS;
    try {
      const token = makeToken(TEST_PASS);
      assert.equal(isValidToken(token), true);
    } finally {
      if (prev === undefined) delete process.env.DASHBOARD_PASS;
      else process.env.DASHBOARD_PASS = prev;
    }
  });

  it("no-auth mode: isValidToken returns true when DASHBOARD_PASS is unset", () => {
    const prev = process.env.DASHBOARD_PASS;
    delete process.env.DASHBOARD_PASS;
    try {
      assert.equal(isValidToken("anything"), true);
      assert.equal(isValidToken(""), true);
    } finally {
      if (prev !== undefined) process.env.DASHBOARD_PASS = prev;
    }
  });
});
