'use strict';

const SENTRY_BASE = 'https://sentry.io/api/0';

/**
 * Sanitise project name to a valid Sentry project slug.
 * Pattern: gsd-{name} lowercased, only [a-z0-9-] allowed.
 * Mirrors r2Provisioner.bucketName().
 */
function projectSlug(projectName) {
  return `gsd-${projectName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/**
 * Create a Sentry project in the configured org and return its DSN.
 * Two-step: POST to create project → GET /keys/ to fetch DSN.
 *
 * SECURITY: projectName is sanitised via projectSlug() before use in API
 * request URLs and bodies (per r2Provisioner.bucketName() pattern).
 * SENTRY_AUTH_TOKEN is never logged or returned in API responses.
 *
 * @param {string} projectName
 * @returns {Promise<{ dsn: string, projectSlug: string }>}
 */
async function createProject(projectName) {
  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG || 'gsdlabs';
  if (!authToken) throw new Error('SENTRY_AUTH_TOKEN not configured');

  const slug = projectSlug(projectName);
  const team = org; // Default team slug matches org slug in gsdlabs

  // Step 1: Create project
  const createResp = await fetch(`${SENTRY_BASE}/teams/${org}/${team}/projects/`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: slug }),
    signal: AbortSignal.timeout(10000),
  });
  if (!createResp.ok) {
    const err = await createResp.json().catch(() => ({}));
    throw new Error(`Sentry project creation failed: ${err.detail || err.message || createResp.statusText}`);
  }
  const { slug: returnedSlug } = await createResp.json();
  const finalSlug = returnedSlug || slug;

  // Step 2: Fetch DSN from client keys (DSN is NOT in the project creation response)
  const keysResp = await fetch(`${SENTRY_BASE}/projects/${org}/${finalSlug}/keys/`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!keysResp.ok) {
    throw new Error(`Sentry keys fetch failed: ${keysResp.statusText}`);
  }
  const keys = await keysResp.json();
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error(`Sentry keys endpoint returned unexpected shape: ${JSON.stringify(keys).slice(0, 200)}`);
  }
  const dsn = keys[0]?.dsn?.public;
  if (!dsn) throw new Error('Sentry project created but no DSN found in client keys');

  return { dsn, projectSlug: finalSlug };
}

/**
 * Check whether a Sentry project exists for the given project name.
 * Returns false on any failure (404, network error, token missing).
 *
 * @param {string} projectName
 * @returns {Promise<boolean>}
 */
async function checkProject(projectName) {
  try {
    const authToken = process.env.SENTRY_AUTH_TOKEN;
    const org = process.env.SENTRY_ORG || 'gsdlabs';
    if (!authToken) return false;
    const slug = projectSlug(projectName);
    const resp = await fetch(`${SENTRY_BASE}/projects/${org}/${slug}/`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
      signal: AbortSignal.timeout(10000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

module.exports = { createProject, checkProject, projectSlug };
