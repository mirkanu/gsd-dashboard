'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --- Shared state for exec mock ---
let execSyncCalled = false;

// Mock child_process.execSync to avoid actually restarting pm2 during tests
const childProcess = require('child_process');
const originalExecSync = childProcess.execSync;

// Minimal valid YAML tunnel config for test temp files
const MINIMAL_CONFIG_YAML = `tunnel: test-tunnel-id
credentials-file: /etc/cloudflared/creds.json
ingress:
  - hostname: debates.gsdlabs.dev
    service: http://localhost:3000
  - service: "http_status:404"
`;

// Helper: create a temp YAML file for each test
function createTempConfig(content) {
  const tmpFile = path.join(os.tmpdir(), `test-tunnel-cfg-${Date.now()}-${Math.random().toString(36).slice(2)}.yml`);
  fs.writeFileSync(tmpFile, content, 'utf8');
  return tmpFile;
}

describe('staging provisioner', () => {
  let tmpConfigFile;

  beforeEach(() => {
    execSyncCalled = false;
    // Patch execSync so pm2 restart gsd-tunnel doesn't actually run
    childProcess.execSync = (cmd, opts) => {
      if (cmd === 'pm2 restart gsd-tunnel') {
        execSyncCalled = true;
        return '';
      }
      return originalExecSync(cmd, opts);
    };

    // Create a fresh temp config for each test
    tmpConfigFile = createTempConfig(MINIMAL_CONFIG_YAML);
    process.env.TUNNEL_CONFIG_PATH = tmpConfigFile;

    // Clear require cache so module picks up updated env var
    delete require.cache[require.resolve('../gsd/stagingProvisioner')];
  });

  afterEach(() => {
    childProcess.execSync = originalExecSync;
    delete process.env.TUNNEL_CONFIG_PATH;
    // Clean up temp file
    try { fs.unlinkSync(tmpConfigFile); } catch {}
    delete require.cache[require.resolve('../gsd/stagingProvisioner')];
  });

  // --- allocateStagingPort ---

  describe('allocateStagingPort', () => {
    it('returns 3100 when no projects have stagingPort', () => {
      const { allocateStagingPort } = require('../gsd/stagingProvisioner');
      const config = { projects: [{ name: 'alpha' }, { name: 'beta' }] };
      assert.equal(allocateStagingPort(config), 3100);
    });

    it('returns 3101 when debates has 3100', () => {
      const { allocateStagingPort } = require('../gsd/stagingProvisioner');
      const config = { projects: [{ name: 'debates', stagingPort: 3100 }] };
      assert.equal(allocateStagingPort(config), 3101);
    });

    it('throws when 3100–3199 all occupied', () => {
      const { allocateStagingPort } = require('../gsd/stagingProvisioner');
      const projects = [];
      for (let port = 3100; port <= 3199; port++) {
        projects.push({ name: `proj-${port}`, stagingPort: port });
      }
      const config = { projects };
      assert.throws(
        () => allocateStagingPort(config),
        /3100.*3199.*exhausted|exhausted.*3100.*3199/
      );
    });

    it('skips ports outside 3100–3199 range', () => {
      const { allocateStagingPort } = require('../gsd/stagingProvisioner');
      // Port 3000 should be ignored (out of range)
      const config = { projects: [{ name: 'some-proj', stagingPort: 3000 }, { name: 'other', stagingPort: 3100 }] };
      assert.equal(allocateStagingPort(config), 3101);
    });
  });

  // --- addStagingIngress ---

  describe('addStagingIngress', () => {
    it('returns success and adds rule before catch-all when hostname does not exist', async () => {
      const { addStagingIngress } = require('../gsd/stagingProvisioner');
      const result = await addStagingIngress('debates', 3100);

      assert.equal(result.success, true);

      const YAML = require('yaml');
      const cfg = YAML.parse(fs.readFileSync(tmpConfigFile, 'utf8'));
      const hostnames = cfg.ingress.map(r => r.hostname);
      assert.ok(hostnames.includes('debates-staging.gsdlabs.dev'), 'hostname should be in ingress');

      // Catch-all (no hostname) should still exist and be last
      const catchAll = cfg.ingress[cfg.ingress.length - 1];
      assert.ok(!catchAll.hostname, 'catch-all must remain last');
    });

    it('is idempotent — second call does not duplicate the rule', async () => {
      const { addStagingIngress } = require('../gsd/stagingProvisioner');
      await addStagingIngress('debates', 3100);
      await addStagingIngress('debates', 3100);

      const YAML = require('yaml');
      const cfg = YAML.parse(fs.readFileSync(tmpConfigFile, 'utf8'));
      const matchingRules = cfg.ingress.filter(r => r.hostname === 'debates-staging.gsdlabs.dev');
      assert.equal(matchingRules.length, 1, 'should not create duplicate ingress entries');
    });

    it('sets service URL with correct port', async () => {
      const { addStagingIngress } = require('../gsd/stagingProvisioner');
      await addStagingIngress('debates', 3105);

      const YAML = require('yaml');
      const cfg = YAML.parse(fs.readFileSync(tmpConfigFile, 'utf8'));
      const rule = cfg.ingress.find(r => r.hostname === 'debates-staging.gsdlabs.dev');
      assert.equal(rule.service, 'http://localhost:3105');
    });
  });

  // --- removeStagingIngress ---

  describe('removeStagingIngress', () => {
    it('removes the staging rule when it exists', async () => {
      const { addStagingIngress, removeStagingIngress } = require('../gsd/stagingProvisioner');
      await addStagingIngress('debates', 3100);

      // Reload module so lock is reset
      delete require.cache[require.resolve('../gsd/stagingProvisioner')];
      const { removeStagingIngress: remove } = require('../gsd/stagingProvisioner');
      const result = await remove('debates');

      assert.equal(result.success, true);
      const YAML = require('yaml');
      const cfg = YAML.parse(fs.readFileSync(tmpConfigFile, 'utf8'));
      const hasStagingRule = cfg.ingress.some(r => r.hostname === 'debates-staging.gsdlabs.dev');
      assert.equal(hasStagingRule, false, 'staging rule should be removed');
    });

    it('catch-all http_status:404 remains after remove', async () => {
      const { addStagingIngress, removeStagingIngress } = require('../gsd/stagingProvisioner');
      await addStagingIngress('debates', 3100);
      delete require.cache[require.resolve('../gsd/stagingProvisioner')];
      const { removeStagingIngress: remove } = require('../gsd/stagingProvisioner');
      await remove('debates');

      const YAML = require('yaml');
      const cfg = YAML.parse(fs.readFileSync(tmpConfigFile, 'utf8'));
      const catchAll = cfg.ingress[cfg.ingress.length - 1];
      assert.ok(!catchAll.hostname, 'catch-all must still exist after removal');
    });

    it('is a no-op when rule does not exist (returns success)', async () => {
      const { removeStagingIngress } = require('../gsd/stagingProvisioner');
      const result = await removeStagingIngress('nonexistent-project');
      assert.equal(result.success, true);

      // File should be unchanged — original debates rule still there
      const YAML = require('yaml');
      const cfg = YAML.parse(fs.readFileSync(tmpConfigFile, 'utf8'));
      const debatesRule = cfg.ingress.find(r => r.hostname === 'debates.gsdlabs.dev');
      assert.ok(debatesRule, 'original debates rule should still be present');
    });
  });

  // --- enableStaging ---

  describe('enableStaging', () => {
    it('sets stagingEnabled=true, stagingPort=3100, stagingUrl, stagingStatus=running on first enable', async () => {
      const { enableStaging } = require('../gsd/stagingProvisioner');
      const config = { projects: [{ name: 'debates' }] };
      const project = await enableStaging('debates', config);

      assert.equal(project.stagingEnabled, true);
      assert.equal(project.stagingPort, 3100);
      assert.equal(project.stagingUrl, 'debates-staging.gsdlabs.dev');
      assert.equal(project.stagingStatus, 'running');
    });

    it('mutates the config.projects entry (same object reference)', async () => {
      const { enableStaging } = require('../gsd/stagingProvisioner');
      const config = { projects: [{ name: 'debates' }] };
      await enableStaging('debates', config);
      // The project in config should now have stagingEnabled
      assert.equal(config.projects[0].stagingEnabled, true);
    });

    it('calls pm2 restart gsd-tunnel', async () => {
      const { enableStaging } = require('../gsd/stagingProvisioner');
      const config = { projects: [{ name: 'debates' }] };
      await enableStaging('debates', config);
      assert.equal(execSyncCalled, true, 'pm2 restart gsd-tunnel should have been called');
    });

    it('throws when project not found', async () => {
      const { enableStaging } = require('../gsd/stagingProvisioner');
      const config = { projects: [] };
      await assert.rejects(
        () => enableStaging('nonexistent', config),
        /not found/
      );
    });

    it('reuses existing stagingPort on repeated enable', async () => {
      const { enableStaging } = require('../gsd/stagingProvisioner');
      const config = { projects: [{ name: 'debates', stagingPort: 3105 }] };
      const project = await enableStaging('debates', config);
      assert.equal(project.stagingPort, 3105);
    });
  });

  // --- disableStaging ---

  describe('disableStaging', () => {
    it('sets stagingEnabled=false, stagingStatus=stopped, and retains stagingPort', async () => {
      const { enableStaging } = require('../gsd/stagingProvisioner');
      const config = { projects: [{ name: 'debates' }] };
      await enableStaging('debates', config);

      delete require.cache[require.resolve('../gsd/stagingProvisioner')];
      const { disableStaging } = require('../gsd/stagingProvisioner');
      const project = await disableStaging('debates', config);

      assert.equal(project.stagingEnabled, false);
      assert.equal(project.stagingStatus, 'stopped');
      // Port must be retained (not cleared)
      assert.equal(project.stagingPort, 3100);
    });

    it('stagingUrl is retained after disable', async () => {
      const { enableStaging } = require('../gsd/stagingProvisioner');
      const config = { projects: [{ name: 'debates' }] };
      await enableStaging('debates', config);

      delete require.cache[require.resolve('../gsd/stagingProvisioner')];
      const { disableStaging } = require('../gsd/stagingProvisioner');
      const project = await disableStaging('debates', config);

      assert.equal(project.stagingUrl, 'debates-staging.gsdlabs.dev');
    });

    it('calls pm2 restart gsd-tunnel', async () => {
      const { disableStaging } = require('../gsd/stagingProvisioner');
      const config = { projects: [{ name: 'debates', stagingPort: 3100 }] };
      await disableStaging('debates', config);
      assert.equal(execSyncCalled, true, 'pm2 restart gsd-tunnel should have been called');
    });

    it('throws when project not found', async () => {
      const { disableStaging } = require('../gsd/stagingProvisioner');
      const config = { projects: [] };
      await assert.rejects(
        () => disableStaging('nonexistent', config),
        /not found/
      );
    });
  });
});
