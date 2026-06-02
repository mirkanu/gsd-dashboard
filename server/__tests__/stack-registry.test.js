'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('stackRegistry', () => {
  const { SERVICES } = require('../gsd/provisioning/stackRegistry');

  it('REG-01: exports SERVICES array with all expected service names', () => {
    const names = SERVICES.map(s => s.name);
    for (const expected of ['betterstack', 'r2', 'umami', 'sentry', 'resend', 'postgres', 'github', 'cloudflare-tunnel', 'pipedream']) {
      assert.ok(names.includes(expected), `missing service: ${expected}`);
    }
  });

  it('REG-02: every entry has required shape fields with correct types', () => {
    for (const svc of SERVICES) {
      assert.ok(typeof svc.name === 'string', `name must be string: ${JSON.stringify(svc)}`);
      assert.ok(['infrastructure', 'functional'].includes(svc.category), `invalid category: ${svc.category}`);
      assert.ok(Array.isArray(svc.globalKeys), `globalKeys must be array: ${svc.name}`);
      assert.ok(Array.isArray(svc.perProjectKeys), `perProjectKeys must be array: ${svc.name}`);
      assert.ok(svc.provisionerModule === null || typeof svc.provisionerModule === 'string', `provisionerModule must be string or null: ${svc.name}`);
      assert.ok(svc.gateTriggeredAt === null || typeof svc.gateTriggeredAt === 'string', `gateTriggeredAt must be string or null: ${svc.name}`);
    }
  });

  it('REG-03: infrastructure services have gateTriggeredAt set', () => {
    SERVICES.filter(s => s.category === 'infrastructure').forEach(s => {
      assert.ok(s.gateTriggeredAt, `infrastructure service ${s.name} missing gateTriggeredAt`);
    });
  });

  it('REG-04: functional services have gateTriggeredAt=null', () => {
    SERVICES.filter(s => s.category === 'functional').forEach(s => {
      assert.strictEqual(s.gateTriggeredAt, null, `functional service ${s.name} should have gateTriggeredAt=null`);
    });
  });

  it('REG-05: exactly 4 infrastructure services (betterstack, r2, umami, sentry)', () => {
    const infra = SERVICES.filter(s => s.category === 'infrastructure').map(s => s.name).sort();
    assert.deepStrictEqual(infra, ['betterstack', 'r2', 'sentry', 'umami']);
  });
});
