'use strict';

/**
 * Tests for server/routes/notifications.js
 * Tests cover GET/PUT /policy and POST /test routes.
 * Uses an in-memory SQLite DB via mock stmts so no filesystem dependency.
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// ---- Minimal in-memory policy store for test stmts ----
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

// ---- Mock EVENT_DEFAULTS keys ----
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

// ---- Helper: load router with mocked deps ----
function loadRouter({ policyRow = null, gsdDataUrl = '' } = {}) {
  // Reset the in-memory store
  _policyRow = policyRow;

  // Clear require cache so fresh require picks up mocks
  const routerPath = require.resolve('../routes/notifications');
  const dbPath = require.resolve('../db');
  const centrePath = require.resolve('../gsd/notificationCentre');
  delete require.cache[routerPath];

  // Temporarily override env
  const origUrl = process.env.GSD_DATA_URL;
  process.env.GSD_DATA_URL = gsdDataUrl;

  // Override require in the module by using a simple approach:
  // We inject mocks via module-level overrides before requiring.
  // Because notifications.js uses require('../db') and require('../gsd/notificationCentre'),
  // we temporarily cache our mocks in require.cache.
  const dbMod = require.cache[dbPath] || { id: dbPath, filename: dbPath, loaded: true, exports: {} };
  const origDbExports = dbMod.exports;
  dbMod.exports = { stmts: mockStmts };
  require.cache[dbPath] = dbMod;

  const centreMod = require.cache[centrePath] || { id: centrePath, filename: centrePath, loaded: true, exports: {} };
  const origCentreExports = centreMod.exports;
  centreMod.exports = { EVENT_DEFAULTS: mockEventDefaults };
  require.cache[centrePath] = centreMod;

  const router = require(routerPath);

  // Restore
  process.env.GSD_DATA_URL = origUrl;
  dbMod.exports = origDbExports;
  centreMod.exports = origCentreExports;

  return router;
}

// ---- Minimal Express-like request/response simulator ----
function makeReq(method, body = undefined, query = {}) {
  return { method, body: body !== undefined ? body : {}, query };
}

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    _headers: {},
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
    set(key, val) { this._headers[key] = val; return this; },
  };
  return res;
}

/**
 * Helper: call a named route handler from the router.
 * Express router.stack has layers; match by method + path.
 */
async function callRoute(router, method, path, body = undefined) {
  const req = { method: method.toUpperCase(), path, url: path, body: body !== undefined ? body : {}, query: {}, headers: {} };
  const res = makeRes();
  const next = (err) => { if (err) throw err; };

  // Find matching layer
  for (const layer of router.stack) {
    if (!layer.route) continue;
    if (layer.route.path !== path) continue;
    if (!layer.route.methods[method.toLowerCase()]) continue;

    // Run the stack of handlers for this route
    const handlers = layer.route.stack.map((h) => h.handle);
    for (const h of handlers) {
      // express.json() middleware — simulate parsed body (already parsed in test)
      if (h.name === 'jsonParser' || h.name === 'urlencodedParser' || h.toString().includes('JSON')) {
        continue; // body already set in req.body
      }
      await new Promise((resolve, reject) => {
        const result = h(req, res, (err) => { if (err) reject(err); else resolve(); });
        if (result && typeof result.then === 'function') result.then(resolve, reject);
        else resolve();
      });
      if (res._body !== null) break; // response sent
    }
    break;
  }
  return res;
}

// ===========================
// Tests
// ===========================

describe('GET /api/notifications/policy — no DB row', () => {
  it('returns default policy shape when no row in DB', async () => {
    const router = loadRouter({ policyRow: null });
    const res = await callRoute(router, 'get', '/policy');
    assert.equal(res._status, 200);
    assert.ok(res._body);
    assert.ok('policy' in res._body, 'should have policy key');
    const p = res._body.policy;
    assert.equal(p.enabled, true);
    assert.equal(p.quiet_hours_from, null);
    assert.equal(p.quiet_hours_to, null);
    assert.equal(p.rate_limit_per_hour, 5);
    assert.deepEqual(p.event_toggles, {});
  });
});

describe('GET /api/notifications/policy — with DB row', () => {
  it('returns saved values from DB row', async () => {
    const row = {
      enabled: 0,
      quiet_hours_from: '22:00',
      quiet_hours_to: '08:00',
      rate_limit_per_hour: 10,
      event_toggles: JSON.stringify({ waiting_input: false }),
      archived_legacy_alerts: 0,
    };
    const router = loadRouter({ policyRow: row });
    const res = await callRoute(router, 'get', '/policy');
    assert.equal(res._status, 200);
    const p = res._body.policy;
    assert.equal(p.enabled, false);
    assert.equal(p.quiet_hours_from, '22:00');
    assert.equal(p.quiet_hours_to, '08:00');
    assert.equal(p.rate_limit_per_hour, 10);
    assert.deepEqual(p.event_toggles, { waiting_input: false });
  });
});

describe('PUT /api/notifications/policy — validation', () => {
  it('returns 400 when enabled is not a boolean', async () => {
    const router = loadRouter();
    const res = await callRoute(router, 'put', '/policy', { enabled: 2 });
    assert.equal(res._status, 400);
    assert.match(res._body.error, /enabled must be a boolean/);
  });

  it('returns 400 when quiet_hours_from is invalid format', async () => {
    const router = loadRouter();
    const res = await callRoute(router, 'put', '/policy', { quiet_hours_from: '25:00' });
    assert.equal(res._status, 400);
    assert.match(res._body.error, /quiet_hours_from must be HH:MM or null/);
  });

  it('returns 400 when rate_limit_per_hour is out of range', async () => {
    const router = loadRouter();
    const res = await callRoute(router, 'put', '/policy', { rate_limit_per_hour: 200 });
    assert.equal(res._status, 400);
    assert.match(res._body.error, /rate_limit_per_hour must be an integer 1.100/);
  });

  it('returns 400 when event_toggles contains unknown key', async () => {
    const router = loadRouter();
    const res = await callRoute(router, 'put', '/policy', { event_toggles: { foo: true } });
    assert.equal(res._status, 400);
    assert.match(res._body.error, /event_toggles contains unknown key: foo/);
  });

  it('returns 200 with ok:true for valid update', async () => {
    const router = loadRouter();
    const res = await callRoute(router, 'put', '/policy', { enabled: true });
    assert.equal(res._status, 200);
    assert.equal(res._body.ok, true);
  });

  it('round-trips: PUT then GET returns updated value', async () => {
    _policyRow = null;
    // Use the same router instance with the shared _policyRow
    const router = loadRouter({ policyRow: null });

    // PUT with new rate limit
    await callRoute(router, 'put', '/policy', { enabled: false, rate_limit_per_hour: 20 });

    // GET should reflect the update
    const getRes = await callRoute(router, 'get', '/policy');
    assert.equal(getRes._status, 200);
    assert.equal(getRes._body.policy.enabled, false);
    assert.equal(getRes._body.policy.rate_limit_per_hour, 20);
  });
});

describe('POST /api/notifications/test', () => {
  it('returns { ok: true } when telegram sendNotification succeeds', async () => {
    // Mock telegram module
    const telegramPath = require.resolve('../gsd/telegram');
    const origTelegram = require.cache[telegramPath];
    require.cache[telegramPath] = {
      id: telegramPath,
      filename: telegramPath,
      loaded: true,
      exports: {
        sendNotification: async () => { /* success */ },
      },
    };

    const router = loadRouter();
    const res = await callRoute(router, 'post', '/test');
    assert.equal(res._status, 200);
    assert.equal(res._body.ok, true);

    // Restore
    if (origTelegram) require.cache[telegramPath] = origTelegram;
    else delete require.cache[telegramPath];
  });

  it('returns 500 with error message when telegram sendNotification throws', async () => {
    const telegramPath = require.resolve('../gsd/telegram');
    const origTelegram = require.cache[telegramPath];
    require.cache[telegramPath] = {
      id: telegramPath,
      filename: telegramPath,
      loaded: true,
      exports: {
        sendNotification: async () => { throw new Error('BOT_TOKEN not set'); },
      },
    };

    const router = loadRouter();
    const res = await callRoute(router, 'post', '/test');
    assert.equal(res._status, 500);
    assert.match(res._body.error, /BOT_TOKEN not set/);

    if (origTelegram) require.cache[telegramPath] = origTelegram;
    else delete require.cache[telegramPath];
  });
});
