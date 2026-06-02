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

  describe('sentryProvisioner', () => {
    beforeEach(() => {
      process.env.SENTRY_AUTH_TOKEN = 'test-sentry-token';
      process.env.SENTRY_ORG = 'test-org';
    });
    afterEach(() => {
      delete process.env.SENTRY_AUTH_TOKEN;
      delete process.env.SENTRY_ORG;
      delete require.cache[require.resolve('../gsd/provisioning/sentryProvisioner')];
    });

    it('PROV-01: createProject returns { dsn, projectSlug } on success', async () => {
      // Two-step: POST /teams/.../projects/ → {slug}, GET /projects/.../keys/ → [{dsn:{public:...}}]
      mockFetch = async (url) => {
        if (url.includes('/projects/') && url.endsWith('/keys/')) {
          return { ok: true, json: async () => [{ dsn: { public: 'https://abc@sentry.io/123' } }] };
        }
        // Project creation
        return { ok: true, json: async () => ({ slug: 'gsd-testproj' }) };
      };
      delete require.cache[require.resolve('../gsd/provisioning/sentryProvisioner')];
      const { createProject } = require('../gsd/provisioning/sentryProvisioner');
      const result = await createProject('testproj');
      assert.ok(result.dsn, 'dsn must be present');
      assert.ok(result.projectSlug, 'projectSlug must be present');
    });

    it('PROV-02: createProject throws when SENTRY_AUTH_TOKEN missing', async () => {
      delete process.env.SENTRY_AUTH_TOKEN;
      delete require.cache[require.resolve('../gsd/provisioning/sentryProvisioner')];
      const { createProject } = require('../gsd/provisioning/sentryProvisioner');
      await assert.rejects(() => createProject('testproj'), /SENTRY_AUTH_TOKEN/);
    });

    it('PROV-03: checkProject returns false on 404', async () => {
      mockFetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
      delete require.cache[require.resolve('../gsd/provisioning/sentryProvisioner')];
      const { checkProject } = require('../gsd/provisioning/sentryProvisioner');
      const result = await checkProject('nonexistent');
      assert.equal(result, false);
    });
  });

  describe('umamiProvisioner', () => {
    beforeEach(() => {
      process.env.UMAMI_ADMIN_PASSWORD = 'test-umami-pass';
    });
    afterEach(() => {
      delete process.env.UMAMI_ADMIN_PASSWORD;
      delete require.cache[require.resolve('../gsd/provisioning/umamiProvisioner')];
    });

    it('PROV-04: createWebsite returns { websiteId } on success', async () => {
      mockFetch = async (url) => {
        if (url.includes('/auth/login')) {
          return { ok: true, json: async () => ({ token: 'test-token-123' }) };
        }
        return { ok: true, json: async () => ({ id: 'website-uuid-456', name: 'gsd-testproj' }) };
      };
      delete require.cache[require.resolve('../gsd/provisioning/umamiProvisioner')];
      const { createWebsite } = require('../gsd/provisioning/umamiProvisioner');
      const result = await createWebsite('testproj', 'testproj.gsdlabs.dev');
      assert.equal(result.websiteId, 'website-uuid-456');
    });

    it('PROV-05: checkWebsite uses domain matching not just env var', async () => {
      mockFetch = async (url) => {
        if (url.includes('/auth/login')) {
          return { ok: true, json: async () => ({ token: 'test-token-123' }) };
        }
        // Returns list with matching domain
        return { ok: true, json: async () => [{ id: 'site-1', domain: 'testproj.gsdlabs.dev', name: 'other-name' }] };
      };
      delete require.cache[require.resolve('../gsd/provisioning/umamiProvisioner')];
      const { checkWebsite } = require('../gsd/provisioning/umamiProvisioner');
      const exists = await checkWebsite('testproj', 'testproj.gsdlabs.dev');
      assert.equal(exists, true);
    });

    it('PROV-06: checkWebsite returns false on login failure', async () => {
      mockFetch = async (url) => {
        if (url.includes('/auth/login')) {
          return { ok: false, statusText: 'Unauthorized', json: async () => ({}) };
        }
        return { ok: true, json: async () => [] };
      };
      delete require.cache[require.resolve('../gsd/provisioning/umamiProvisioner')];
      const { checkWebsite } = require('../gsd/provisioning/umamiProvisioner');
      const result = await checkWebsite('testproj', 'testproj.gsdlabs.dev');
      assert.equal(result, false);
    });
  });

  describe('validateGates with sentry + umami', () => {
    afterEach(() => {
      delete require.cache[require.resolve('../gsd/provisioning/stageGates/validateGates')];
      try { delete require.cache[require.resolve('../gsd/provisioning/sentryProvisioner')]; } catch {}
      try { delete require.cache[require.resolve('../gsd/provisioning/umamiProvisioner')]; } catch {}
    });

    it('GATE-01: beta->launched includes umamiWebsite in requiresProvisioning when missing', async () => {
      // Mock all provisioners as "not provisioned" (return false)
      mockFetch = async (url) => {
        if (url.includes('betterstack.com')) return { ok: true, json: async () => ({ data: [] }) };
        if (url.includes('cloudflare.com')) return { ok: false, json: async () => ({}) };
        if (url.includes('/auth/login')) return { ok: true, json: async () => ({ token: 'tok' }) };
        if (url.includes('api/websites')) return { ok: true, json: async () => [] };
        if (url.includes('sentry.io')) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: false };
      };
      process.env.SENTRY_AUTH_TOKEN = 'test-token';
      process.env.SENTRY_ORG = 'test-org';
      process.env.UMAMI_ADMIN_PASSWORD = 'test-pass';
      delete require.cache[require.resolve('../gsd/provisioning/stageGates/validateGates')];
      const { validateGates } = require('../gsd/provisioning/stageGates/validateGates');
      const project = { name: 'testproj', stage: 'beta', productionUrl: 'https://testproj.com' };
      const result = await validateGates(project, 'launched');
      assert.ok(result.requiresProvisioning.includes('umamiWebsite'), `expected umamiWebsite in ${JSON.stringify(result.requiresProvisioning)}`);
      delete process.env.SENTRY_AUTH_TOKEN;
      delete process.env.SENTRY_ORG;
      delete process.env.UMAMI_ADMIN_PASSWORD;
    });

    it('GATE-02: beta->launched includes sentryProject in requiresProvisioning when missing', async () => {
      mockFetch = async (url) => {
        if (url.includes('betterstack.com')) return { ok: true, json: async () => ({ data: [] }) };
        if (url.includes('cloudflare.com')) return { ok: false, json: async () => ({}) };
        if (url.includes('/auth/login')) return { ok: true, json: async () => ({ token: 'tok' }) };
        if (url.includes('api/websites')) return { ok: true, json: async () => [] };
        if (url.includes('sentry.io')) return { ok: false, status: 404, json: async () => ({}) };
        return { ok: false };
      };
      process.env.SENTRY_AUTH_TOKEN = 'test-token';
      process.env.SENTRY_ORG = 'test-org';
      process.env.UMAMI_ADMIN_PASSWORD = 'test-pass';
      delete require.cache[require.resolve('../gsd/provisioning/stageGates/validateGates')];
      const { validateGates } = require('../gsd/provisioning/stageGates/validateGates');
      const project = { name: 'testproj', stage: 'beta', productionUrl: 'https://testproj.com' };
      const result = await validateGates(project, 'launched');
      assert.ok(result.requiresProvisioning.includes('sentryProject'), `expected sentryProject in ${JSON.stringify(result.requiresProvisioning)}`);
      delete process.env.SENTRY_AUTH_TOKEN;
      delete process.env.SENTRY_ORG;
      delete process.env.UMAMI_ADMIN_PASSWORD;
    });
  });
});
