'use strict';

// ============================================================
// DISCOVERY PASS — 2026-06-02
// Services found in gsd-projects.json env patterns and .env.production
// not yet formalised in this registry:
//
//   {PROJECT}_ANTHROPIC_API_KEY
//     Found in: DEBATES_ANTHROPIC_API_KEY, KIDAI_ANTHROPIC_API_KEY, YNAB_ANTHROPIC_API_KEY
//     Suggestion: category=functional, no provisioner
//
//   {PROJECT}_DB_PASSWORD / POSTGRES_PASSWORD
//     Found in: DEBATES_DB_PASSWORD, UTILITIES_DB_PASSWORD, YNAB_DB_PASSWORD,
//               ZOHO_SYNC_DB_PASSWORD (+ POSTGRES_PASSWORD global)
//     Suggestion: category=functional, provisioner=pgProvisioner (future)
//
//   {PROJECT}_GITHUB_GIST_TOKEN
//     Found in: KIDAI_GITHUB_GIST_TOKEN
//     Suggestion: project-specific variant of functional/github entry
//
// These are informational only. No code changes made to existing projects.
// ============================================================

/**
 * Canonical registry of every service in the GSD infrastructure stack.
 *
 * Entry shape:
 *   name            {string}  — identifier used in requiresProvisioning arrays
 *   category        {string}  — 'infrastructure' | 'functional'
 *   globalKeys      {string[]} — env var names in .env.production shared across projects
 *   perProjectKeys  {string[]} — env var name patterns, {PROJECT} replaced at runtime
 *   customDomain    {string|null} — self-hosted service domain (null if external)
 *   provisionerModule {string|null} — relative require path; null if no auto-provisioner
 *   gateTriggeredAt {string|null} — 'beta->launched' or null
 *
 * infrastructure = provisioned at stage gates, same for every web project
 * functional     = provisioned when a feature needs it; not every project uses all
 */
const SERVICES = [
  {
    name: 'betterstack',
    category: 'infrastructure',
    globalKeys: ['BETTERSTACK_API_KEY'],
    perProjectKeys: [],
    customDomain: null,
    provisionerModule: './betterStackProvisioner',
    gateTriggeredAt: 'beta->launched',
  },
  {
    name: 'r2',
    category: 'infrastructure',
    globalKeys: ['CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID'],
    perProjectKeys: [],
    customDomain: null,
    provisionerModule: './r2Provisioner',
    gateTriggeredAt: 'beta->launched',
  },
  {
    name: 'umami',
    category: 'infrastructure',
    globalKeys: ['UMAMI_ADMIN_PASSWORD'],
    perProjectKeys: ['{PROJECT}_UMAMI_WEBSITE_ID'],
    customDomain: 'umami.gsdlabs.dev',
    provisionerModule: './umamiProvisioner',
    gateTriggeredAt: 'beta->launched',
  },
  {
    name: 'sentry',
    category: 'infrastructure',
    globalKeys: ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG'],
    perProjectKeys: ['{PROJECT}_SENTRY_DSN'],
    customDomain: 'sentry.io',
    provisionerModule: './sentryProvisioner',
    gateTriggeredAt: 'beta->launched',
  },
  {
    name: 'resend',
    category: 'functional',
    globalKeys: [],
    perProjectKeys: ['{PROJECT}_RESEND_API_KEY', '{PROJECT}_RESEND_FROM_ADDRESS'],
    customDomain: null,
    provisionerModule: null,
    gateTriggeredAt: null,
  },
  {
    name: 'postgres',
    category: 'functional',
    globalKeys: ['POSTGRES_PASSWORD'],
    perProjectKeys: ['{PROJECT}_DB_PASSWORD'],
    customDomain: null,
    provisionerModule: null,
    gateTriggeredAt: null,
  },
  {
    name: 'github',
    category: 'functional',
    globalKeys: ['GITHUB_PAT'],
    perProjectKeys: [],
    customDomain: null,
    provisionerModule: null,
    gateTriggeredAt: null,
  },
  {
    name: 'cloudflare-tunnel',
    category: 'functional',
    globalKeys: ['CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL'],
    perProjectKeys: [],
    customDomain: null,
    provisionerModule: null,
    gateTriggeredAt: null,
  },
  {
    name: 'pipedream',
    category: 'functional',
    globalKeys: ['PIPEDREAM_API_KEY'],
    perProjectKeys: [],
    customDomain: null,
    provisionerModule: null,
    gateTriggeredAt: null,
  },
];

module.exports = { SERVICES };
