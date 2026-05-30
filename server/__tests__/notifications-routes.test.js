'use strict';

/**
 * Tests for server/routes/notifications.js
 * Uses an actual Express app + Node http.request so middleware (express.json) runs correctly.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');

// ---- In-memory policy store shared across tests ----
let _policyRow = null;

const mockStmts = {
  getNotificationPolicy: { get: () => _policyRow },
  upsertNotificationPolicy: {
    run: (enabled, qhFrom, qhTo, rateLimit, togglesJson, archivedLegacy) => {
      _policyRow = {
        enabled,
        quiet_hours_from: qhFrom,
        quiet_hours_to: qhTo,
        rate_limit_per_hour: rateLimit,
        event_toggles: togglesJson,
        archived_legacy_alerts: archivedLegacy,
      };
    },
  },
};

const mockEventDefaults = {
  waiting_input: {},
  plan_complete: {},
  verify_failed: {},
  verify_passed: {},
  idle_session_closed: {},
  cost_anomaly: {},
  github_issue_filed: {},
  session_started: {},
  tool_use: {},
  turn_complete: {},
  system_alert: {},
};

// Inject mocks into require.cache before requiring the router
function injectMocks() {
  const dbPath = require.resolve('../db');
  const centrePath = require.resolve('../gsd/notificationCentre');

  // Ensure db mock is in cache
  if (!require.cache[dbPath]) {
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {} };
  }
  require.cache[dbPath].exports = { stmts: mockStmts };

  // Ensure notificationCentre mock is in cache
  if (!require.cache[centrePath]) {
    require.cache[centrePath] = { id: centrePath, filename: centrePath, loaded: true, exports: {} };
  }
  require.cache[centrePath].exports = { EVENT_DEFAULTS: mockEventDefaults };
}

function loadFreshRouter() {
  const routerPath = require.resolve('../routes/notifications');
  delete require.cache[routerPath];
  injectMocks();
  return require(routerPath);
}

// Create a minimal Express app wrapping the router
let server;
let baseUrl;

before(async () => {
  injectMocks();
  const router = loadFreshRouter();
  const app = express();
  app.use(express.json());
  app.use('/', router);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
});

// Helper: make HTTP request
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const bodyStr = body !== undefined ? JSON.stringify(body) : undefined;
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers: {
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    };
    const httpReq = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    httpReq.on('error', reject);
    if (bodyStr) httpReq.write(bodyStr);
    httpReq.end();
  });
}

// Reset policy row before each test via a helper
function resetPolicy(row = null) {
  _policyRow = row;
}

// ===========================
// Tests
// ===========================

describe('GET /policy — no DB row', () => {
  it('returns default policy shape when no row in DB', async () => {
    resetPolicy(null);
    const res = await req('GET', '/policy');
    assert.equal(res.status, 200);
    assert.ok('policy' in res.body, 'should have policy key');
    const p = res.body.policy;
    assert.equal(p.enabled, true);
    assert.equal(p.quiet_hours_from, null);
    assert.equal(p.quiet_hours_to, null);
    assert.equal(p.rate_limit_per_hour, 5);
    assert.deepEqual(p.event_toggles, {});
  });
});

describe('GET /policy — with DB row', () => {
  it('returns saved values from DB row', async () => {
    resetPolicy({
      enabled: 0,
      quiet_hours_from: '22:00',
      quiet_hours_to: '08:00',
      rate_limit_per_hour: 10,
      event_toggles: JSON.stringify({ waiting_input: false }),
      archived_legacy_alerts: 0,
    });
    const res = await req('GET', '/policy');
    assert.equal(res.status, 200);
    const p = res.body.policy;
    assert.equal(p.enabled, false);
    assert.equal(p.quiet_hours_from, '22:00');
    assert.equal(p.quiet_hours_to, '08:00');
    assert.equal(p.rate_limit_per_hour, 10);
    assert.deepEqual(p.event_toggles, { waiting_input: false });
  });
});

describe('PUT /policy — validation', () => {
  it('returns 400 when enabled is not a boolean', async () => {
    resetPolicy(null);
    const res = await req('PUT', '/policy', { enabled: 2 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /enabled must be a boolean/);
  });

  it('returns 400 when quiet_hours_from is invalid format', async () => {
    resetPolicy(null);
    const res = await req('PUT', '/policy', { quiet_hours_from: '25:00' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /quiet_hours_from must be HH:MM or null/);
  });

  it('returns 400 when rate_limit_per_hour is out of range', async () => {
    resetPolicy(null);
    const res = await req('PUT', '/policy', { rate_limit_per_hour: 200 });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /rate_limit_per_hour must be an integer/);
  });

  it('returns 400 when event_toggles contains unknown key', async () => {
    resetPolicy(null);
    const res = await req('PUT', '/policy', { event_toggles: { foo: true } });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /event_toggles contains unknown key: foo/);
  });

  it('returns 200 with ok:true for valid update', async () => {
    resetPolicy(null);
    const res = await req('PUT', '/policy', { enabled: true });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('round-trips: PUT then GET returns updated value', async () => {
    resetPolicy(null);
    await req('PUT', '/policy', { enabled: false, rate_limit_per_hour: 20 });
    const getRes = await req('GET', '/policy');
    assert.equal(getRes.status, 200);
    assert.equal(getRes.body.policy.enabled, false);
    assert.equal(getRes.body.policy.rate_limit_per_hour, 20);
  });
});

describe('POST /test', () => {
  it('returns { ok: true } when telegram sendNotification succeeds', async () => {
    const telegramPath = require.resolve('../gsd/telegram');
    const origTelegram = require.cache[telegramPath];
    require.cache[telegramPath] = {
      id: telegramPath, filename: telegramPath, loaded: true,
      exports: { sendNotification: async () => {} },
    };

    const res = await req('POST', '/test');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);

    if (origTelegram) require.cache[telegramPath] = origTelegram;
    else delete require.cache[telegramPath];
  });

  it('returns 500 with error message when telegram sendNotification throws', async () => {
    const telegramPath = require.resolve('../gsd/telegram');
    const origTelegram = require.cache[telegramPath];
    require.cache[telegramPath] = {
      id: telegramPath, filename: telegramPath, loaded: true,
      exports: { sendNotification: async () => { throw new Error('BOT_TOKEN not set'); } },
    };

    const res = await req('POST', '/test');
    assert.equal(res.status, 500);
    assert.match(res.body.error, /BOT_TOKEN not set/);

    if (origTelegram) require.cache[telegramPath] = origTelegram;
    else delete require.cache[telegramPath];
  });
});
