'use strict';

/**
 * services-costs-route.test.js
 *
 * Integration tests for /api/services/costs CRUD + rollup and
 * /api/services/rules CRUD (Phase 45 Plan 02 Tasks 2 + 3).
 *
 * Covers:
 *   - POST one-time manual cost creates BOTH manual_cost_entries row AND
 *     external_service_costs row linked via notes='manual:<muid>'
 *   - DELETE by external_service_costs.id cascades to manual_cost_entries
 *   - Recurring materialization for current month (idempotent)
 *   - Past months NEVER materialize recurring rows
 *   - DELETE of a recurring-materialized row stops future materializations
 *   - PATCH cascades service/cost edits to linked manual_cost_entries row
 *   - unparsed rows surface in needs_review[]; PATCH promotes them to source='email'
 *   - Rollup sums correctly; project_key=null bucket works
 *   - /api/services/rules CRUD validation + round-trip
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');

const TEST_DB = path.join(os.tmpdir(), `dashboard-services-costs-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;
process.env.DASHBOARD_SECRET_KEY = 'test-secret-for-services-costs';

const FAKE_CONFIG_PATH = path.join(os.tmpdir(), `gsd-projects-costs-${Date.now()}.json`);
process.env.GSD_PROJECTS_PATH = FAKE_CONFIG_PATH;
fs.writeFileSync(FAKE_CONFIG_PATH, JSON.stringify({ projects: [] }));

const { createApp, startServer } = require('../index');
const { db } = require('../db');

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
const post = (p, body) => req(p, { method: 'POST', body });
const patch = (p, body) => req(p, { method: 'PATCH', body });
const del = (p) => req(p, { method: 'DELETE' });

// Helpers for month math mirroring route behavior.
function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

before(async () => {
  const app = createApp();
  server = await startServer(app, 0);
  BASE = `http://127.0.0.1:${server.address().port}`;
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
  db.prepare('DELETE FROM external_service_costs').run();
  db.prepare('DELETE FROM manual_cost_entries').run();
  db.prepare('DELETE FROM service_mapping_rules').run();
  db.prepare('DELETE FROM processed_emails').run();
});

describe('POST /api/services/costs (one-time manual)', () => {
  it('creates manual_cost_entries + external_service_costs linked via notes=manual:<muid>', async () => {
    const res = await post('/api/services/costs', {
      service: 'Railway',
      project_key: 'gsddashboard',
      cost_usd: 12.5,
      description: 'test one-time',
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.id, 'external_service_costs.id returned');
    assert.ok(res.body.manual_id, 'manual_cost_entries.id returned');

    const esc = db.prepare('SELECT * FROM external_service_costs WHERE id = ?').get(res.body.id);
    assert.ok(esc, 'external_service_costs row exists');
    assert.strictEqual(esc.source, 'manual');
    assert.strictEqual(esc.notes, `manual:${res.body.manual_id}`);
    assert.strictEqual(esc.cost_usd, 12.5);
    assert.strictEqual(esc.service, 'Railway');

    const mce = db.prepare('SELECT * FROM manual_cost_entries WHERE id = ?').get(res.body.manual_id);
    assert.ok(mce, 'manual_cost_entries row exists');
    assert.strictEqual(mce.recurring_monthly, 0);
    assert.strictEqual(mce.cost_usd, 12.5);
  });

  it('POST with missing service returns 400', async () => {
    const res = await post('/api/services/costs', { cost_usd: 5 });
    assert.strictEqual(res.status, 400);
  });

  it('POST with non-positive cost_usd returns 400', async () => {
    const res = await post('/api/services/costs', { service: 'Vercel', cost_usd: -1 });
    assert.strictEqual(res.status, 400);
  });
});

describe('GET /api/services/costs rollup', () => {
  it('returns envelope { month, services, projects, needs_review, entries }', async () => {
    await post('/api/services/costs', { service: 'Railway', project_key: 'a', cost_usd: 10 });
    await post('/api/services/costs', { service: 'Railway', project_key: 'a', cost_usd: 5 });
    await post('/api/services/costs', { service: 'OpenAI', project_key: 'b', cost_usd: 20 });

    const res = await get('/api/services/costs');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.month, currentMonth());
    assert.ok(Array.isArray(res.body.services));
    assert.ok(Array.isArray(res.body.projects));
    assert.ok(Array.isArray(res.body.needs_review));
    assert.ok(Array.isArray(res.body.entries));
    assert.strictEqual(res.body.entries.length, 3);

    const railway = res.body.services.find((s) => s.service === 'Railway');
    assert.strictEqual(railway.total_usd, 15);
    assert.strictEqual(railway.source_breakdown.manual, 15);

    const projA = res.body.projects.find((p) => p.project_key === 'a');
    assert.strictEqual(projA.total_usd, 15);
  });

  it('project_key=null row goes into Unassigned bucket', async () => {
    await post('/api/services/costs', { service: 'Vercel', cost_usd: 8 });
    const res = await get('/api/services/costs');
    const unassigned = res.body.projects.find((p) => p.project_key === null);
    assert.ok(unassigned, 'Unassigned bucket exists');
    assert.strictEqual(unassigned.total_usd, 8);
  });
});

describe('DELETE /api/services/costs/:id', () => {
  it('DELETE source=manual cascades to manual_cost_entries', async () => {
    const created = await post('/api/services/costs', {
      service: 'Railway', project_key: 'x', cost_usd: 7,
    });
    const escId = created.body.id;
    const muid = created.body.manual_id;

    const delRes = await del(`/api/services/costs/${escId}`);
    assert.strictEqual(delRes.status, 200);
    assert.deepStrictEqual(delRes.body, { ok: true, deleted: 1 });

    assert.strictEqual(
      db.prepare('SELECT * FROM external_service_costs WHERE id = ?').get(escId),
      undefined
    );
    assert.strictEqual(
      db.prepare('SELECT * FROM manual_cost_entries WHERE id = ?').get(muid),
      undefined
    );
  });

  it('DELETE source=email does NOT cascade anything else', async () => {
    const id = 'email-row-1';
    db.prepare(`
      INSERT INTO external_service_costs (id, service, cost_period, cost_usd, currency, checked_at, source, notes)
      VALUES (?, 'Anthropic', 'monthly', 4.20, 'USD', ?, 'email', 'email:msg-123')
    `).run(id, new Date().toISOString());

    const res = await del(`/api/services/costs/${id}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(
      db.prepare('SELECT * FROM external_service_costs WHERE id = ?').get(id),
      undefined
    );
  });

  it('DELETE unknown id returns 404', async () => {
    const res = await del('/api/services/costs/does-not-exist');
    assert.strictEqual(res.status, 404);
  });
});

describe('PATCH /api/services/costs/:id', () => {
  it('PATCH cost_usd on source=manual updates BOTH rows', async () => {
    const created = await post('/api/services/costs', {
      service: 'Railway', project_key: 'x', cost_usd: 10,
    });
    const escId = created.body.id;
    const muid = created.body.manual_id;

    const res = await patch(`/api/services/costs/${escId}`, { cost_usd: 42, service: 'Railway Pro' });
    assert.strictEqual(res.status, 200);

    const esc = db.prepare('SELECT * FROM external_service_costs WHERE id = ?').get(escId);
    assert.strictEqual(esc.cost_usd, 42);
    assert.strictEqual(esc.service, 'Railway Pro');

    const mce = db.prepare('SELECT * FROM manual_cost_entries WHERE id = ?').get(muid);
    assert.strictEqual(mce.cost_usd, 42);
    assert.strictEqual(mce.service, 'Railway Pro');
  });

  it('PATCH unknown id returns 404', async () => {
    const res = await patch('/api/services/costs/nope', { cost_usd: 1 });
    assert.strictEqual(res.status, 404);
  });
});

describe('recurring materialization (current month only)', () => {
  it('POST recurring entry with past start_date synthesizes exactly one row this month; repeat GET is idempotent', async () => {
    const pastDate = '2026-01-15T00:00:00.000Z';
    const created = await post('/api/services/costs', {
      service: 'Vercel',
      project_key: 'proj',
      cost_usd: 20,
      start_date: pastDate,
      recurring_monthly: true,
    });
    assert.strictEqual(created.status, 201);
    // Recurring entries do NOT create an external_service_costs row directly.
    assert.strictEqual(created.body.id, null);
    const muid = created.body.manual_id;

    const g1 = await get('/api/services/costs');
    const recurrent = g1.body.entries.filter((e) => e.source === 'recurring' && e.notes === `recurring:${muid}`);
    assert.strictEqual(recurrent.length, 1, 'one materialized row for current month');
    assert.strictEqual(recurrent[0].cost_usd, 20);

    const g2 = await get('/api/services/costs');
    const recurrent2 = g2.body.entries.filter((e) => e.source === 'recurring' && e.notes === `recurring:${muid}`);
    assert.strictEqual(recurrent2.length, 1, 'idempotent — no duplicate on second GET');
  });

  it('GET past month does NOT materialize new recurring rows', async () => {
    // Active recurring template with start_date in the distant past.
    const pastDate = '2025-01-01T00:00:00.000Z';
    const created = await post('/api/services/costs', {
      service: 'Vercel',
      cost_usd: 15,
      start_date: pastDate,
      recurring_monthly: true,
    });
    const muid = created.body.manual_id;

    // Query a past month that is NOT the current month.
    // Use 2026-01 since start_date is 2025-01.
    const res = await get('/api/services/costs?month=2026-01');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.month, '2026-01');
    const synthesized = res.body.entries.filter((e) => e.notes === `recurring:${muid}`);
    assert.strictEqual(synthesized.length, 0, 'no materialization for past months');
  });

  it('DELETE a materialized recurring row stops future materializations', async () => {
    const past = '2026-01-15T00:00:00.000Z';
    const created = await post('/api/services/costs', {
      service: 'Vercel', cost_usd: 20, start_date: past, recurring_monthly: true,
    });
    const muid = created.body.manual_id;

    const g1 = await get('/api/services/costs');
    const matRow = g1.body.entries.find((e) => e.notes === `recurring:${muid}`);
    assert.ok(matRow, 'materialized row exists');

    const delRes = await del(`/api/services/costs/${matRow.id}`);
    assert.strictEqual(delRes.status, 200);

    // Template also gone
    assert.strictEqual(
      db.prepare('SELECT * FROM manual_cost_entries WHERE id = ?').get(muid),
      undefined
    );

    const g2 = await get('/api/services/costs');
    const rematerialized = g2.body.entries.filter((e) => e.notes === `recurring:${muid}`);
    assert.strictEqual(rematerialized.length, 0, 'no re-creation after template deletion');
  });
});

describe('unparsed rows → needs_review[]', () => {
  it('inserts an unparsed row via direct SQL → appears in needs_review → PATCH promotes to email', async () => {
    const id = 'unparsed-row-1';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO external_service_costs (id, service, cost_period, cost_usd, currency, checked_at, source, raw_body, notes)
      VALUES (?, 'Unknown', 'monthly', 0, 'USD', ?, 'unparsed', 'raw email body here', '')
    `).run(id, now);

    const g1 = await get('/api/services/costs');
    assert.strictEqual(g1.body.needs_review.length, 1);
    assert.strictEqual(g1.body.needs_review[0].id, id);

    const patchRes = await patch(`/api/services/costs/${id}`, {
      service: 'Railway', cost_usd: 9.99, source: 'email', project_key: 'rails',
    });
    assert.strictEqual(patchRes.status, 200);

    const g2 = await get('/api/services/costs');
    assert.strictEqual(g2.body.needs_review.length, 0, 'promoted row leaves needs_review');
    const promoted = g2.body.entries.find((e) => e.id === id);
    assert.strictEqual(promoted.source, 'email');
    assert.strictEqual(promoted.service, 'Railway');
    assert.strictEqual(promoted.cost_usd, 9.99);
  });

  it('DELETE an unparsed row removes it from needs_review (dismiss path)', async () => {
    const id = 'unparsed-row-2';
    db.prepare(`
      INSERT INTO external_service_costs (id, service, cost_period, cost_usd, currency, checked_at, source, raw_body)
      VALUES (?, 'Unknown', 'monthly', 0, 'USD', ?, 'unparsed', 'some raw')
    `).run(id, new Date().toISOString());

    const delRes = await del(`/api/services/costs/${id}`);
    assert.strictEqual(delRes.status, 200);

    const g = await get('/api/services/costs');
    assert.strictEqual(g.body.needs_review.length, 0);
  });
});

describe('/api/services/rules CRUD', () => {
  it('POST valid rule → 201, GET list returns it', async () => {
    const res = await post('/api/services/rules', {
      pattern_type: 'sender',
      pattern_value: 'billing@railway.app',
      project_key: 'gsddashboard',
      service: 'Railway',
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.id);

    const list = await get('/api/services/rules');
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.body.rules.length, 1);
    assert.strictEqual(list.body.rules[0].pattern_value, 'billing@railway.app');
  });

  it('POST with invalid pattern_type → 400', async () => {
    const res = await post('/api/services/rules', {
      pattern_type: 'invalid_type',
      pattern_value: 'x',
      project_key: 'p',
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST missing pattern_value or project_key → 400', async () => {
    const res = await post('/api/services/rules', { pattern_type: 'sender' });
    assert.strictEqual(res.status, 400);
  });

  it('PATCH updates pattern_value', async () => {
    const created = await post('/api/services/rules', {
      pattern_type: 'subject_contains',
      pattern_value: 'Railway invoice',
      project_key: 'p1',
    });
    const patchRes = await patch(`/api/services/rules/${created.body.id}`, {
      pattern_value: 'Railway receipt',
    });
    assert.strictEqual(patchRes.status, 200);
    const list = await get('/api/services/rules');
    assert.strictEqual(list.body.rules[0].pattern_value, 'Railway receipt');
  });

  it('DELETE removes the rule', async () => {
    const created = await post('/api/services/rules', {
      pattern_type: 'sender', pattern_value: 'x@y.com', project_key: 'p',
    });
    const delRes = await del(`/api/services/rules/${created.body.id}`);
    assert.strictEqual(delRes.status, 200);
    const list = await get('/api/services/rules');
    assert.strictEqual(list.body.rules.length, 0);
  });
});

describe('/api/services/status backward-compat', () => {
  it('status route still works unchanged (empty projects config)', async () => {
    const res = await get('/api/services/status');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.projects));
  });
});
