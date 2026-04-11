'use strict';

/**
 * app-settings-route.test.js
 *
 * Integration tests for /api/app-settings CRUD.
 * Uses an isolated test DB + a test DASHBOARD_SECRET_KEY. Asserts that:
 *   - PUT stores encrypted values (round-trip verified via internal getSecret)
 *   - GET never returns plaintext
 *   - LIST shows metadata only
 *   - DELETE removes the row
 *   - Invalid PUT body returns 400
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');

// Isolated test DB + secret key BEFORE any server modules load.
const TEST_DB = path.join(os.tmpdir(), `dashboard-appsettings-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;
process.env.DASHBOARD_SECRET_KEY = 'test-secret-for-appsettings';

const FAKE_CONFIG_PATH = path.join(os.tmpdir(), `gsd-projects-appsettings-${Date.now()}.json`);
process.env.GSD_PROJECTS_PATH = FAKE_CONFIG_PATH;
fs.writeFileSync(FAKE_CONFIG_PATH, JSON.stringify({ projects: [] }));

const { createApp, startServer } = require('../index');
const { db } = require('../db');
const { getSecret } = require('../crypto');

let server;
let BASE;

function req(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const body = options.body ? JSON.stringify(options.body) : undefined;
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...options.headers,
      },
    };
    const httpReq = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    httpReq.on('error', reject);
    if (body) httpReq.write(body);
    httpReq.end();
  });
}

const get = (p) => req(p, { method: 'GET' });
const put = (p, body) => req(p, { method: 'PUT', body });
const del = (p) => req(p, { method: 'DELETE' });

before(async () => {
  const app = createApp();
  server = await startServer(app, 0);
  const addr = server.address();
  BASE = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  if (server) server.close();
  try { fs.unlinkSync(TEST_DB); } catch { /* noop */ }
  try { fs.unlinkSync(TEST_DB + '-wal'); } catch { /* noop */ }
  try { fs.unlinkSync(TEST_DB + '-shm'); } catch { /* noop */ }
  try { fs.unlinkSync(FAKE_CONFIG_PATH); } catch { /* noop */ }
  setTimeout(() => process.exit(0), 100);
});

beforeEach(() => {
  db.prepare('DELETE FROM app_settings').run();
});

describe('app-settings route', () => {
  it('PUT stores value encrypted; getSecret round-trips plaintext', async () => {
    const res = await put('/api/app-settings/railway_pat', { value: 'rp_abc' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { ok: true });
    assert.strictEqual(getSecret('railway_pat'), 'rp_abc');
  });

  it('GET /:key returns metadata only — never plaintext', async () => {
    await put('/api/app-settings/openai_admin_key', { value: 'sk-admin-xyz' });
    const res = await get('/api/app-settings/openai_admin_key');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.key, 'openai_admin_key');
    assert.strictEqual(res.body.set, true);
    assert.ok(res.body.updated_at, 'updated_at present');
    assert.ok(!('value' in res.body), 'must not leak value');
    assert.ok(!('value_encrypted' in res.body), 'must not leak ciphertext');
  });

  it('GET list returns all keys metadata after multiple PUTs', async () => {
    await put('/api/app-settings/railway_pat', { value: 'rp_1' });
    await put('/api/app-settings/vercel_token', { value: 'vc_1' });
    const res = await get('/api/app-settings');
    assert.strictEqual(res.status, 200);
    const keys = res.body.keys.map((k) => k.key).sort();
    assert.deepStrictEqual(keys, ['railway_pat', 'vercel_token']);
    for (const row of res.body.keys) {
      assert.strictEqual(row.set, true);
      assert.ok(row.updated_at, 'each row has updated_at');
      assert.ok(!('value' in row), 'no plaintext leak');
      assert.ok(!('value_encrypted' in row), 'no ciphertext leak');
    }
  });

  it('PUT with empty string returns 400', async () => {
    const res = await put('/api/app-settings/railway_pat', { value: '' });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });

  it('PUT with non-string value returns 400', async () => {
    const res = await put('/api/app-settings/railway_pat', { value: 42 });
    assert.strictEqual(res.status, 400);
  });

  it('DELETE removes row; subsequent GET returns 404', async () => {
    await put('/api/app-settings/railway_pat', { value: 'rp_to_delete' });
    const delRes = await del('/api/app-settings/railway_pat');
    assert.strictEqual(delRes.status, 200);
    assert.deepStrictEqual(delRes.body, { ok: true });

    const getRes = await get('/api/app-settings/railway_pat');
    assert.strictEqual(getRes.status, 404);
    assert.strictEqual(getSecret('railway_pat'), null);
  });

  it('GET empty list returns { keys: [] }', async () => {
    const res = await get('/api/app-settings');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, { keys: [] });
  });
});
