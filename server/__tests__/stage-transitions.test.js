'use strict';
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');

const TEST_DB = path.join(os.tmpdir(), `stage-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;
const TEST_PROJECTS_JSON = path.join(os.tmpdir(), `gsd-projects-${Date.now()}-${process.pid}.json`);
process.env.GSD_PROJECTS_PATH = TEST_PROJECTS_JSON;

const { createApp, startServer } = require('../index');
const { db } = require('../db');

let server;
let BASE;

function fetchJson(urlPath, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = { hostname: url.hostname, port: url.port, path: url.pathname + url.search,
      method: options.method || 'GET', headers: { 'Content-Type': 'application/json', ...options.headers } };
    const req = http.request(opts, (res) => {
      let body = ''; res.on('data', c => body += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(body) }); } catch { resolve({ status: res.statusCode, body }); } });
    });
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

function writeProjects(projects) {
  fs.writeFileSync(TEST_PROJECTS_JSON, JSON.stringify({ projects }, null, 2));
}

before(async () => {
  writeProjects([]);
  const app = createApp();
  server = await startServer(app, 0);
  BASE = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  if (server) server.close();
  if (db) db.close();
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_PROJECTS_JSON); } catch {}
  setTimeout(() => process.exit(0), 100);
});

beforeEach(() => {
  writeProjects([{ name: 'test-proj', root: '/tmp/test-proj', tmux_session: 'test-proj', stage: 'alpha' }]);
});

describe('stage-transitions', () => {
  it('MAT-01: backfill — project without stage gets draft on config load', async () => {
    writeProjects([{ name: 'legacy-proj', root: '/tmp/legacy', tmux_session: 'legacy' }]);
    // Verify via the PATCH endpoint which calls loadConfigWithBackfill internally
    const r2 = await fetchJson('/api/gsd/projects/legacy-proj/stage', { method: 'PATCH', body: { to: 'alpha' } });
    assert.equal(r2.status, 200, 'backfilled project can transition');
    assert.equal(r2.body.stage, 'alpha');
  });

  it('MAT-03: invalid stage name returns 400', async () => {
    const r = await fetchJson('/api/gsd/projects/test-proj/stage', { method: 'PATCH', body: { to: 'invalid-stage' } });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.includes('Invalid stage'));
  });

  it('MAT-03: disallowed transition returns 422', async () => {
    // alpha->launched is not in ALLOWED_TRANSITIONS
    const r = await fetchJson('/api/gsd/projects/test-proj/stage', { method: 'PATCH', body: { to: 'launched' } });
    assert.equal(r.status, 422, 'alpha→launched should be disallowed');
    assert.ok(r.body.error.includes('Cannot transition'));
  });

  it('MAT-03: valid transition returns 200 and writes stage', async () => {
    const r = await fetchJson('/api/gsd/projects/test-proj/stage', { method: 'PATCH', body: { to: 'beta' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.stage, 'beta');
    assert.equal(r.body.success, true);
    const written = JSON.parse(fs.readFileSync(TEST_PROJECTS_JSON, 'utf8'));
    assert.equal(written.projects.find(p => p.name === 'test-proj').stage, 'beta');
  });

  it('MAT-04: reversible — beta→alpha reverse succeeds', async () => {
    writeProjects([{ name: 'test-proj', root: '/tmp/test-proj', tmux_session: 'test-proj', stage: 'beta' }]);
    const back = await fetchJson('/api/gsd/projects/test-proj/stage', { method: 'PATCH', body: { to: 'alpha' } });
    assert.equal(back.status, 200, 'beta→alpha (reverse) should succeed');
    assert.equal(back.body.stage, 'alpha');
  });

  it('MAT-06: validate endpoint returns gate results', async () => {
    const r = await fetchJson('/api/gsd/projects/test-proj/stage/validate', { method: 'POST', body: { to: 'beta' } });
    assert.equal(r.status, 200);
    assert.ok(typeof r.body.valid === 'boolean');
    assert.ok(Array.isArray(r.body.hardGates));
    assert.ok(Array.isArray(r.body.softGates));
  });

  it('MAT-03: unknown project returns 404', async () => {
    const r = await fetchJson('/api/gsd/projects/unknown-xyz/stage', { method: 'PATCH', body: { to: 'alpha' } });
    assert.equal(r.status, 404);
  });

  it('EXEC-01: beta->launched with requiresProvisioning calls provisioners and completes transition', async () => {
    // Set up a beta-stage project with a productionUrl
    writeProjects([{
      name: 'launch-test',
      root: '/tmp/launch-test',
      tmux_session: 'launch-test',
      stage: 'beta',
      productionUrl: 'https://launch-test.gsdlabs.dev',
    }]);

    // Mock validateGates to return requiresProvisioning=['betterStackMonitor']
    // and inject a mock betterStackProvisioner into require.cache
    let provisionerCalled = false;

    const bsPath = require.resolve('../gsd/provisioning/betterStackProvisioner');
    const vgPath = require.resolve('../gsd/provisioning/stageGates/validateGates');

    const originalBs = require.cache[bsPath];
    const originalVg = require.cache[vgPath];

    // Replace betterStackProvisioner with a mock that records the call
    require.cache[bsPath] = {
      id: bsPath,
      filename: bsPath,
      loaded: true,
      exports: {
        provisionMonitor: async () => { provisionerCalled = true; return { monitorId: 'mock-monitor-123' }; },
        checkMonitor: async () => false,
        deleteMonitor: async () => {},
      },
    };

    // Replace validateGates with a mock that returns requiresProvisioning=['betterStackMonitor']
    require.cache[vgPath] = {
      id: vgPath,
      filename: vgPath,
      loaded: true,
      exports: {
        validateGates: async () => ({
          valid: true,
          hardGates: [],
          softGates: [],
          requiresProvisioning: ['betterStackMonitor'],
        }),
        canTransition: () => true,
        ALLOWED_TRANSITIONS: {},
      },
    };

    try {
      const r = await fetchJson('/api/gsd/projects/launch-test/stage', {
        method: 'PATCH',
        body: { to: 'launched' },
      });
      assert.equal(r.status, 200, `expected 200, got ${r.status}: ${JSON.stringify(r.body)}`);
      assert.equal(r.body.stage, 'launched', 'stage must be launched');
      assert.ok(provisionerCalled, 'betterStackProvisioner.provisionMonitor must have been called');
    } finally {
      // Restore originals
      if (originalBs) { require.cache[bsPath] = originalBs; } else { delete require.cache[bsPath]; }
      if (originalVg) { require.cache[vgPath] = originalVg; } else { delete require.cache[vgPath]; }
    }
  });
});
