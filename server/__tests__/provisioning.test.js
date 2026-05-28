'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Mock fetch globally before requiring provisioner modules
let mockFetch;
const originalFetch = global.fetch;

describe('provisioning', () => {
  beforeEach(() => {
    mockFetch = null;
    global.fetch = async (url, opts) => {
      if (mockFetch) return mockFetch(url, opts);
      throw new Error('fetch not mocked');
    };
    // Set up env vars
    process.env.BETTERSTACK_API_KEY = 'test-bs-key';
    process.env.CLOUDFLARE_API_KEY = 'test-cf-key';
    process.env.CLOUDFLARE_EMAIL = 'test@example.com';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account-id';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.BETTERSTACK_API_KEY;
    delete process.env.CLOUDFLARE_API_KEY;
    delete process.env.CLOUDFLARE_EMAIL;
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
  });

  describe('betterStackProvisioner', () => {
    it('provisionMonitor returns monitorId on success', async () => {
      mockFetch = async () => ({ ok: true, json: async () => ({ data: { id: 'monitor-123' } }) });
      // Clear require cache to pick up fresh module
      delete require.cache[require.resolve('../gsd/provisioning/betterStackProvisioner')];
      const { provisionMonitor } = require('../gsd/provisioning/betterStackProvisioner');
      const result = await provisionMonitor('my-project', 'https://myproject.com');
      assert.equal(result.monitorId, 'monitor-123');
    });

    it('provisionMonitor throws when API key missing', async () => {
      delete process.env.BETTERSTACK_API_KEY;
      delete require.cache[require.resolve('../gsd/provisioning/betterStackProvisioner')];
      const { provisionMonitor } = require('../gsd/provisioning/betterStackProvisioner');
      await assert.rejects(() => provisionMonitor('proj', 'https://x.com'), /BETTERSTACK_API_KEY/);
    });

    it('checkMonitor returns false on fetch error', async () => {
      mockFetch = async () => { throw new Error('network error'); };
      delete require.cache[require.resolve('../gsd/provisioning/betterStackProvisioner')];
      const { checkMonitor } = require('../gsd/provisioning/betterStackProvisioner');
      const result = await checkMonitor('some-project');
      assert.equal(result, false);
    });
  });

  describe('r2Provisioner', () => {
    it('createBucket sends correct bucket name', async () => {
      let capturedBody;
      mockFetch = async (url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ result: { name: capturedBody.name } }) };
      };
      delete require.cache[require.resolve('../gsd/provisioning/r2Provisioner')];
      const { createBucket } = require('../gsd/provisioning/r2Provisioner');
      const result = await createBucket('MyProject');
      // Bucket name lowercased with hyphens: gsd-myproject
      assert.equal(capturedBody.name, 'gsd-myproject');
      assert.equal(result.bucketName, 'gsd-myproject');
    });

    it('checkBucket returns false on error', async () => {
      mockFetch = async () => { throw new Error('network'); };
      delete require.cache[require.resolve('../gsd/provisioning/r2Provisioner')];
      const { checkBucket } = require('../gsd/provisioning/r2Provisioner');
      const result = await checkBucket('proj');
      assert.equal(result, false);
    });
  });

  describe('validateGates', () => {
    beforeEach(() => {
      // Mock both provisioners to return false (not yet provisioned)
      mockFetch = async () => ({ ok: false, json: async () => ({}) });
    });

    it('beta->launched: returns hardGate failure when productionUrl missing', async () => {
      // Clear module caches
      ['betterStackProvisioner', 'r2Provisioner', 'stageGates/validateGates'].forEach(m => {
        try { delete require.cache[require.resolve(`../gsd/provisioning/${m}`)]; } catch {}
      });
      const { validateGates } = require('../gsd/provisioning/stageGates/validateGates');
      const project = { name: 'proj', stage: 'beta', root: '/tmp/proj' };
      const result = await validateGates(project, 'launched');
      assert.equal(result.valid, false);
      const gateNames = result.hardGates.map(g => g.gate);
      assert.ok(gateNames.includes('productionUrlSet'), 'should fail productionUrlSet gate');
    });

    it('beta->launched: adds provisioning requirements when monitor and bucket missing', async () => {
      // BetterStack list returns empty array (no monitor); R2 returns 404 (no bucket)
      mockFetch = async (url) => {
        if (url.includes('betterstack.com')) {
          return { ok: true, json: async () => ({ data: [] }) }; // empty list = not found
        }
        return { ok: false, json: async () => ({}) }; // R2 404 = bucket not found
      };
      ['betterStackProvisioner', 'r2Provisioner', 'stageGates/validateGates'].forEach(m => {
        try { delete require.cache[require.resolve(`../gsd/provisioning/${m}`)]; } catch {}
      });
      const { validateGates } = require('../gsd/provisioning/stageGates/validateGates');
      const project = { name: 'proj', stage: 'beta', root: '/tmp/proj', productionUrl: 'https://proj.com' };
      const result = await validateGates(project, 'launched');
      assert.ok(result.requiresProvisioning.includes('betterStackMonitor'));
      assert.ok(result.requiresProvisioning.includes('r2Bucket'));
    });

    it('alpha->beta: soft gate warning for missing previewUrl (never blocks)', async () => {
      ['betterStackProvisioner', 'r2Provisioner', 'stageGates/validateGates'].forEach(m => {
        try { delete require.cache[require.resolve(`../gsd/provisioning/${m}`)]; } catch {}
      });
      const { validateGates } = require('../gsd/provisioning/stageGates/validateGates');
      const project = { name: 'proj', stage: 'alpha', root: '/tmp/proj' };
      const result = await validateGates(project, 'beta');
      assert.equal(result.valid, true, 'alpha→beta should be valid even without previewUrl (soft gate)');
      assert.equal(result.softGates.length, 1, 'one soft gate warning');
    });

    it('draft->alpha: no gates — always valid', async () => {
      ['betterStackProvisioner', 'r2Provisioner', 'stageGates/validateGates'].forEach(m => {
        try { delete require.cache[require.resolve(`../gsd/provisioning/${m}`)]; } catch {}
      });
      const { validateGates } = require('../gsd/provisioning/stageGates/validateGates');
      const project = { name: 'proj', stage: 'draft', root: '/tmp/proj' };
      const result = await validateGates(project, 'alpha');
      assert.equal(result.valid, true);
      assert.equal(result.hardGates.length, 0);
    });
  });
});
