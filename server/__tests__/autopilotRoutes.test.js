'use strict';

/**
 * autopilotRoutes.test.js
 *
 * Integration tests for /api/autopilot routes.
 * Tests run against a real Express app with AutopilotManager mocked via
 * dependency injection on the module-level runRegistry.
 *
 * Strategy: set process.env.AUTOPILOT_MANAGER_FACTORY to inject a fake
 * manager factory, or override the route's internal createManager function.
 * We use a simpler approach: the route module exports a `_setManagerFactory`
 * test hook that replaces the factory used in POST /start and POST /plan-all.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const http = require('http');
const os = require('os');

// Set up test database BEFORE requiring any server modules
const TEST_DB = path.join(os.tmpdir(), `dashboard-autopilot-routes-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

// Set a dummy GSD_PROJECTS_PATH so the route doesn't try to read real config
const FAKE_CONFIG_PATH = path.join(os.tmpdir(), `gsd-projects-test-${Date.now()}.json`);
process.env.GSD_PROJECTS_PATH = FAKE_CONFIG_PATH;

const fs = require('fs');
// Write a minimal config file
fs.writeFileSync(FAKE_CONFIG_PATH, JSON.stringify({
  projects: [
    { name: 'test-project', root: '/tmp/test-project', tmux_session: 'test' },
  ],
}));

const { createApp, startServer } = require('../index');

let server;
let BASE;
let autopilotRouteModule;

// ─── HTTP helper ─────────────────────────────────────────────────────────────

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
      let rawBody = '';
      res.on('data', (chunk) => (rawBody += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(rawBody); } catch { parsed = rawBody; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    httpReq.on('error', reject);
    if (body) httpReq.write(body);
    httpReq.end();
  });
}

function post(urlPath, body) {
  return req(urlPath, { method: 'POST', body });
}

function get(urlPath) {
  return req(urlPath, { method: 'GET' });
}

// ─── Fake AutopilotManager ────────────────────────────────────────────────────

/**
 * Creates a fake AutopilotManager with controllable behavior.
 * Tracks calls to start/pause/resume/getStatus.
 */
function makeFakeManager(overrides = {}) {
  let runId = null;
  let status = 'running';
  let started = false;

  return {
    async start(projectName, opts) {
      runId = `fake-run-${Date.now()}`;
      started = true;
      status = 'running';
      return { runId };
    },
    pause() { status = 'paused'; },
    resume() { status = 'running'; },
    stop() { status = 'stopped'; },
    getStatus() {
      return { runId, status, currentPhaseNum: 1, projectName: 'test-project', startedAt: new Date().toISOString() };
    },
    ...overrides,
  };
}

// ─── Suite setup ─────────────────────────────────────────────────────────────

before(async () => {
  const app = createApp();
  server = await startServer(app, 0);
  const addr = server.address();
  BASE = `http://127.0.0.1:${addr.port}`;

  // Get a reference to the autopilot route module to inject fake managers
  autopilotRouteModule = require('../routes/autopilot');
});

after(() => {
  if (server) server.close();
  try { fs.unlinkSync(TEST_DB); } catch { /* best-effort */ }
  try { fs.unlinkSync(TEST_DB + '-wal'); } catch { /* best-effort */ }
  try { fs.unlinkSync(TEST_DB + '-shm'); } catch { /* best-effort */ }
  try { fs.unlinkSync(FAKE_CONFIG_PATH); } catch { /* best-effort */ }
  // Force exit since WS heartbeat interval keeps process alive
  setTimeout(() => process.exit(0), 100);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('POST /api/autopilot/start', () => {
  it('returns 400 when projectName is missing', async () => {
    const res = await post('/api/autopilot/start', {});
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error, 'Should have error field');
  });

  it('returns 200 with runId and status=running on valid start', async () => {
    // Inject a fake manager factory so we don't spawn real processes
    autopilotRouteModule._setManagerFactory(() => makeFakeManager());

    const res = await post('/api/autopilot/start', { projectName: 'test-project' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.runId, 'Should have runId');
    assert.strictEqual(res.body.status, 'running');

    // Cleanup: clear the run so other tests start clean
    autopilotRouteModule._clearRun('test-project');
    autopilotRouteModule._resetManagerFactory();
  });

  it('returns 409 when a run is already active for the project', async () => {
    autopilotRouteModule._setManagerFactory(() => makeFakeManager());

    // Start first run
    await post('/api/autopilot/start', { projectName: 'test-project' });

    // Second start should conflict
    const res = await post('/api/autopilot/start', { projectName: 'test-project' });
    assert.strictEqual(res.status, 409);
    assert.ok(res.body.error);

    autopilotRouteModule._clearRun('test-project');
    autopilotRouteModule._resetManagerFactory();
  });
});

describe('POST /api/autopilot/pause', () => {
  it('returns 400 when projectName is missing', async () => {
    const res = await post('/api/autopilot/pause', {});
    assert.strictEqual(res.status, 400);
  });

  it('returns 404 when no active run exists for project', async () => {
    const res = await post('/api/autopilot/pause', { projectName: 'no-run-project' });
    assert.strictEqual(res.status, 404);
  });

  it('returns 200 { ok: true } when pausing an active run', async () => {
    autopilotRouteModule._setManagerFactory(() => makeFakeManager());
    await post('/api/autopilot/start', { projectName: 'test-project' });

    const res = await post('/api/autopilot/pause', { projectName: 'test-project' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);

    autopilotRouteModule._clearRun('test-project');
    autopilotRouteModule._resetManagerFactory();
  });
});

describe('POST /api/autopilot/resume', () => {
  it('returns 400 when projectName is missing', async () => {
    const res = await post('/api/autopilot/resume', {});
    assert.strictEqual(res.status, 400);
  });

  it('returns 404 when no active run exists for project', async () => {
    const res = await post('/api/autopilot/resume', { projectName: 'no-run-project' });
    assert.strictEqual(res.status, 404);
  });

  it('returns 200 { ok: true } when resuming a paused run', async () => {
    autopilotRouteModule._setManagerFactory(() => makeFakeManager());
    await post('/api/autopilot/start', { projectName: 'test-project' });
    await post('/api/autopilot/pause', { projectName: 'test-project' });

    const res = await post('/api/autopilot/resume', { projectName: 'test-project' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);

    autopilotRouteModule._clearRun('test-project');
    autopilotRouteModule._resetManagerFactory();
  });
});

describe('GET /api/autopilot/status/:projectName', () => {
  it('returns idle status when no run exists', async () => {
    const res = await get('/api/autopilot/status/no-run-project');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.runId, null);
    assert.strictEqual(res.body.status, 'idle');
    assert.strictEqual(res.body.projectName, 'no-run-project');
  });

  it('returns active run status when run exists', async () => {
    autopilotRouteModule._setManagerFactory(() => makeFakeManager());
    await post('/api/autopilot/start', { projectName: 'test-project' });

    const res = await get('/api/autopilot/status/test-project');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.runId, 'Should have runId when run is active');
    assert.strictEqual(res.body.status, 'running');

    autopilotRouteModule._clearRun('test-project');
    autopilotRouteModule._resetManagerFactory();
  });
});

describe('POST /api/autopilot/plan-all', () => {
  it('returns 400 when projectName is missing', async () => {
    const res = await post('/api/autopilot/plan-all', {});
    assert.strictEqual(res.status, 400);
  });

  it('returns 200 with runId and status=running', async () => {
    autopilotRouteModule._setManagerFactory(() => makeFakeManager());

    const res = await post('/api/autopilot/plan-all', { projectName: 'test-project' });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.runId, 'Should have runId');
    assert.strictEqual(res.body.status, 'running');

    autopilotRouteModule._clearRun('test-project');
    autopilotRouteModule._resetManagerFactory();
  });

  it('returns 409 when a run is already active', async () => {
    autopilotRouteModule._setManagerFactory(() => makeFakeManager());
    await post('/api/autopilot/plan-all', { projectName: 'test-project' });

    const res = await post('/api/autopilot/plan-all', { projectName: 'test-project' });
    assert.strictEqual(res.status, 409);

    autopilotRouteModule._clearRun('test-project');
    autopilotRouteModule._resetManagerFactory();
  });
});
