'use strict';

const UMAMI_BASE = process.env.UMAMI_INTERNAL_URL || 'http://localhost:3007';

/**
 * Sanitise project name for Umami website name.
 * Pattern: gsd-{name} lowercased, only [a-z0-9-] allowed.
 * Mirrors r2Provisioner.bucketName() and sentryProvisioner.projectSlug().
 */
function websiteName(projectName) {
  return `gsd-${projectName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Get a fresh session token from Umami on each call.
 * Umami self-hosted v3.1 has no persistent API keys — must login per provision.
 * Obtain fresh token at start of each call; tokens expire (configured TTL, typically 24h).
 *
 * SECURITY: UMAMI_ADMIN_PASSWORD is never logged or returned.
 * Error message uses resp.statusText only, never the password value.
 *
 * @returns {Promise<string>} Bearer token
 */
async function getToken() {
  const password = process.env.UMAMI_ADMIN_PASSWORD;
  const username = process.env.UMAMI_ADMIN_USERNAME || 'admin';
  if (!password) throw new Error('UMAMI_ADMIN_PASSWORD not configured');
  const resp = await fetch(`${UMAMI_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Umami login failed: ${resp.statusText}`);
  const { token } = await resp.json();
  return token;
}

/**
 * Create a Umami website entry for the given project.
 *
 * SECURITY: projectName is sanitised via websiteName() before use in API
 * request body. UMAMI_ADMIN_PASSWORD is never logged or returned.
 *
 * @param {string} projectName
 * @param {string} domain  e.g. 'myproject.gsdlabs.dev'
 * @returns {Promise<{ websiteId: string }>}
 */
async function createWebsite(projectName, domain) {
  const token = await getToken();
  const resp = await fetch(`${UMAMI_BASE}/api/websites`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: websiteName(projectName), domain }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Umami website creation failed: ${err.message || resp.statusText}`);
  }
  const { id } = await resp.json();
  return { websiteId: id };
}

/**
 * Check whether a Umami website exists for the given project using domain matching.
 * CRITICAL: checks by domain (not env var presence) to avoid duplicate sites (Pitfall 3).
 * Returns false on any failure — never throws.
 *
 * @param {string} projectName
 * @param {string} domain
 * @returns {Promise<boolean>}
 */
async function checkWebsite(projectName, domain) {
  try {
    const token = await getToken();
    const resp = await fetch(`${UMAMI_BASE}/api/websites`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    const list = Array.isArray(data) ? data : (data.data || []);
    return list.some(s => s.domain === domain || s.name === websiteName(projectName));
  } catch {
    return false;
  }
}

module.exports = { createWebsite, checkWebsite, websiteName };
