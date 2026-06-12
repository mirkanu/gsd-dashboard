'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const YAML = require('yaml');

const TUNNEL_CONFIG_PATH = process.env.TUNNEL_CONFIG_PATH ||
  '/home/claude/.cloudflare-tunnel/config.yml';
const STAGING_PORT_MIN = 3100;
const STAGING_PORT_MAX = 3199;

// Serialise concurrent tunnel-config writes to avoid read-modify-write races.
let configWriteLock = Promise.resolve();

/**
 * Read all currently allocated staging ports from the projects config object
 * (not from disk) and return the first unused port in 3100–3199.
 *
 * @param {object} config - parsed gsd-projects.json object
 * @returns {number} - first available port
 * @throws {Error} if range is exhausted
 */
function allocateStagingPort(config) {
  const usedPorts = new Set(
    (config.projects || [])
      .map(p => p.stagingPort)
      .filter(p => typeof p === 'number' && p >= STAGING_PORT_MIN && p <= STAGING_PORT_MAX)
  );

  for (let port = STAGING_PORT_MIN; port <= STAGING_PORT_MAX; port++) {
    if (!usedPorts.has(port)) return port;
  }

  throw new Error('Staging port range 3100–3199 exhausted. Remove unused staging environments first.');
}

/**
 * Atomically write content to filePath using tmp+rename.
 * Falls back to copyFileSync+unlink if cross-device rename (EXDEV).
 */
function atomicWrite(filePath, content) {
  const tmpPath = path.join(os.tmpdir(), `staging-cfg-${Date.now()}-${process.pid}.tmp`);
  fs.writeFileSync(tmpPath, content, { encoding: 'utf8' });
  try {
    fs.renameSync(tmpPath, filePath);
  } catch (e) {
    if (e.code === 'EXDEV') {
      fs.copyFileSync(tmpPath, filePath);
      fs.unlinkSync(tmpPath);
    } else {
      try { fs.unlinkSync(tmpPath); } catch {}
      throw e;
    }
  }
}

/**
 * Idempotently add ingress rule for {projectSlug}-staging.gsdlabs.dev → http://localhost:{port}.
 * Inserts before the catch-all http_status:404 rule.
 *
 * @param {string} projectSlug
 * @param {number} port
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function addStagingIngress(projectSlug, port) {
  const hostname = `${projectSlug}-staging.gsdlabs.dev`;
  const service = `http://localhost:${port}`;

  configWriteLock = configWriteLock.then(async () => {
    const raw = fs.readFileSync(TUNNEL_CONFIG_PATH, 'utf8');
    const cfg = YAML.parse(raw);
    const ingress = cfg.ingress || [];

    const alreadyExists = ingress.some(r => r.hostname === hostname);
    if (alreadyExists) return; // idempotent — no change

    // Find catch-all entry (has no hostname, just service)
    const catchAllIndex = ingress.findIndex(r => !r.hostname);
    const newRule = { hostname, service };

    if (catchAllIndex >= 0) {
      ingress.splice(catchAllIndex, 0, newRule);
    } else {
      ingress.push(newRule);
    }

    cfg.ingress = ingress;
    atomicWrite(TUNNEL_CONFIG_PATH, YAML.stringify(cfg));
  });

  await configWriteLock;
  return { success: true, message: `Added staging ingress for ${hostname} → ${service}` };
}

/**
 * Remove staging ingress rule for projectSlug. No-op if rule doesn't exist.
 *
 * @param {string} projectSlug
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function removeStagingIngress(projectSlug) {
  const hostname = `${projectSlug}-staging.gsdlabs.dev`;

  configWriteLock = configWriteLock.then(async () => {
    const raw = fs.readFileSync(TUNNEL_CONFIG_PATH, 'utf8');
    const cfg = YAML.parse(raw);
    const ingress = cfg.ingress || [];

    const filtered = ingress.filter(r => r.hostname !== hostname);
    if (filtered.length === ingress.length) return; // rule not found — no-op

    cfg.ingress = filtered;
    atomicWrite(TUNNEL_CONFIG_PATH, YAML.stringify(cfg));
  });

  await configWriteLock;
  return { success: true, message: `Removed staging ingress for ${hostname}` };
}

/**
 * Full enable flow: allocate port, edit config.yml, restart tunnel, update project fields.
 * Sets project.stagingEnabled=true, project.stagingPort, project.stagingUrl, project.stagingStatus='running'.
 *
 * @param {string} projectName - must match project.name in config
 * @param {object} config - parsed gsd-projects.json (mutated in place)
 * @returns {Promise<object>} - mutated project object
 * @throws {Error} if project not found or port range exhausted
 */
async function enableStaging(projectName, config) {
  const project = (config.projects || []).find(p => p.name === projectName);
  if (!project) throw new Error(`Project "${projectName}" not found in config`);

  // Derive slug from project name (lower-case, hyphens)
  const projectSlug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Allocate port (or reuse existing one for idempotency)
  const port = (typeof project.stagingPort === 'number' && project.stagingPort >= STAGING_PORT_MIN && project.stagingPort <= STAGING_PORT_MAX)
    ? project.stagingPort
    : allocateStagingPort(config);

  // Edit tunnel config (serialised via lock)
  await addStagingIngress(projectSlug, port);

  // Restart tunnel AFTER config file is fully written
  execSync('pm2 restart gsd-tunnel', { stdio: 'pipe' });

  // Mutate project in config
  project.stagingEnabled = true;
  project.stagingPort = port;
  project.stagingUrl = `${projectSlug}-staging.gsdlabs.dev`;
  project.stagingStatus = 'running';

  return project;
}

/**
 * Full disable flow: remove ingress rule, restart tunnel, clear stagingEnabled (port stays).
 * Sets project.stagingEnabled=false, project.stagingStatus='stopped'.
 *
 * @param {string} projectName - must match project.name in config
 * @param {object} config - parsed gsd-projects.json (mutated in place)
 * @returns {Promise<object>} - mutated project object
 * @throws {Error} if project not found
 */
async function disableStaging(projectName, config) {
  const project = (config.projects || []).find(p => p.name === projectName);
  if (!project) throw new Error(`Project "${projectName}" not found in config`);

  const projectSlug = projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  // Remove ingress rule (serialised via lock)
  await removeStagingIngress(projectSlug);

  // Restart tunnel AFTER config file is fully written
  execSync('pm2 restart gsd-tunnel', { stdio: 'pipe' });

  // Mutate project — port stays for stability, only status changes
  project.stagingEnabled = false;
  project.stagingStatus = 'stopped';

  return project;
}

module.exports = {
  allocateStagingPort,
  addStagingIngress,
  removeStagingIngress,
  enableStaging,
  disableStaging,
};
