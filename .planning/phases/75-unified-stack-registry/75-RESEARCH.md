# Phase 75: Unified Stack Registry — Research

**Researched:** 2026-06-02
**Domain:** GSD infrastructure provisioning — registry file, Sentry/Umami provisioners, CLAUDE.md injection
**Confidence:** HIGH (all claims verified against live codebase and APIs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 Registry Format:** `server/gsd/provisioning/stackRegistry.js` exporting a `SERVICES` array. Each entry: `{ name, category, globalKeys[], perProjectKeys[], customDomain, provisionerModule, gateTriggeredAt }`. `validateGates.js` imports it.

**D-02 Stack Categories:**
- `infrastructure` — provisioned at stage gates, same for every web project: Umami, BetterStack, R2/Cloudflare, Sentry.
- `functional` — provisioned when a feature needs it, not every project: PostgreSQL, Resend, Cloudflare Tunnel, GitHub, Pipedream.

**D-03 Sentry Provisioner:** `server/gsd/provisioning/sentryProvisioner.js`. Soft gate (advisory, does not block). Stores `{PROJECT}_SENTRY_DSN`. Global keys: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG=gsdlabs`.

**D-04 Umami Provisioner:** `server/gsd/provisioning/umamiProvisioner.js`. Hard gate at Beta→Launched. Stores `{PROJECT}_UMAMI_WEBSITE_ID`. Single shared `UMAMI_API_TOKEN` in `.env.production`.

**D-05 CLAUDE.md Injection:** On Beta→Launched gate success, write/update `## Stack (auto-managed)` section in the project's CLAUDE.md listing provisioned infrastructure env vars.

**D-06 Global CLAUDE.md Update:** Extend shared credentials table in `/home/claude/.claude/CLAUDE.md`; add Stack Registry Rule section.

**D-07 Stack Registry Rule Enforcement:** Via global CLAUDE.md only (no automated gate).

**D-08 Pipedream:** Category `functional`, `PIPEDREAM_API_KEY` global, no per-project keys standardised, no provisioner, no `gateTriggeredAt`. Document in registry as a known automation option.

**D-09 Discovery Pass:** Scan `gsd-projects.json` and `.env.production` for service key patterns already in use. Surface unregistered services as a comment block at top of `stackRegistry.js`. No code changes to existing projects.

### Claude's Discretion
- Exact Sentry API endpoint for project creation
- Umami API endpoint for website creation
- Precise format of the `## Stack (auto-managed)` CLAUDE.md section
- Which stage transition handler in `stageGates/` triggers CLAUDE.md injection
- Whether to backfill CLAUDE.md Stack section for already-launched projects on startup

### Deferred Ideas (OUT OF SCOPE)
- Stage-gate UI changes
- Project card layout changes
- Non-provisioning dashboard features
</user_constraints>

---

## Summary

Phase 75 builds infrastructure in three areas: (1) a canonical `stackRegistry.js` that documents every service in one place, (2) two new provisioners (Sentry and Umami) that fire at the Beta→Launched gate, and (3) CLAUDE.md injection — writing a `## Stack (auto-managed)` section into each project's CLAUDE.md when it launches, so every Claude session automatically knows what's provisioned.

The existing codebase has a complete provisioner pattern established by `betterStackProvisioner.js` and `r2Provisioner.js`. The stage gate framework in `validateGates.js` already supports `requiresProvisioning` arrays and soft/hard gate semantics. The main gaps are: the PATCH `/stage` route does not yet execute auto-provisioning (it validates but does not run `createBucket`/`provisionMonitor` — these run nowhere currently), a new `UMAMI_API_TOKEN` needs to be added to `.env.production`, and the existing `SENTRY_AUTH_TOKEN` has insufficient scope for project creation and will need to be replaced with a token that has `project:write`.

**Primary recommendation:** Follow the `betterStackProvisioner.js` pattern exactly for both new provisioners. The registration pattern in `validateGates.js` and the test pattern in `provisioning.test.js` are the templates for all new additions. The auto-provisioning execution gap in the PATCH route must be fixed as part of this phase.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stack registry definition | Server (Node.js module) | — | Machine-readable registry consumed by validateGates.js at runtime |
| Sentry project provisioning | API / Backend | — | Server-side API call to sentry.io; credentials never leave server |
| Umami website provisioning | API / Backend | — | Server-side API call to umami.gsdlabs.dev; admin credentials stay server-side |
| CLAUDE.md injection | API / Backend | Filesystem | Stage transition handler writes to project's CLAUDE.md on disk |
| Auto-provisioning execution | API / Backend | — | PATCH /stage route must trigger provisioning before writing stage change |
| Discovery pass | Server (one-time scan at module load) | — | Reads gsd-projects.json and .env.production; outputs comment block in stackRegistry.js |
| Global CLAUDE.md update | Filesystem (manual task) | — | Human-authored edit to /home/claude/.claude/CLAUDE.md |
| StageTransitionModal display | Frontend / Browser | — | Already shows `requiresProvisioning` items; needs new string labels for Sentry/Umami |

---

## Standard Stack

### Core (all existing — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fetch` | Node 21 (in use) | HTTP calls to Sentry/Umami APIs | Already used in betterStackProvisioner and r2Provisioner |
| Node.js `fs` | built-in | Read/write project CLAUDE.md files | Used throughout server |
| `node:test` | built-in | Test framework | All server tests use this |

**No new npm packages required.** All provisioners use `globalThis.fetch` (already available in the Node version in use) and the existing `AbortSignal.timeout` pattern.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fetch() for Sentry API | `@sentry/cli` npm package | npm package adds dependency weight; fetch is simpler and already the pattern |
| Admin password login for Umami | Per-user API keys | Self-hosted single-user instance — admin token login is simpler, no key management needed |

---

## Architecture Patterns

### System Architecture Diagram

```
gsd-projects.json + .env.production
        |
        v
[stackRegistry.js]  <-- imports by validateGates.js
   SERVICES array
   (one entry per service)
        |
        v
[validateGates.js] beta->launched path
   ├── hardGates: productionUrlSet, umamiWebsite
   ├── softGates: githubIssuesEnabled, sentryProject
   └── requiresProvisioning: [betterStackMonitor, r2Bucket, umamiWebsite, sentryProject]
        |
        v (when PATCH /stage fires)
[gsd.js PATCH /stage route]
   1. validateGates()
   2. IF requiresProvisioning.length > 0: run each provisioner
      ├── betterStackProvisioner.provisionMonitor()
      ├── r2Provisioner.createBucket()
      ├── umamiProvisioner.createWebsite()  [new]
      └── sentryProvisioner.createProject() [new]
   3. Store {PROJECT}_UMAMI_WEBSITE_ID, {PROJECT}_SENTRY_DSN in .env.production
   4. Write ## Stack (auto-managed) section to project's CLAUDE.md
   5. Save stage = 'launched'
```

### Recommended Project Structure (additions only)

```
server/gsd/provisioning/
├── stackRegistry.js         [NEW] canonical SERVICES array
├── betterStackProvisioner.js  [existing - pattern template]
├── r2Provisioner.js           [existing - pattern template]
├── sentryProvisioner.js       [NEW]
├── umamiProvisioner.js        [NEW]
└── stageGates/
    └── validateGates.js       [MODIFY] import stackRegistry, add Sentry+Umami gates
```

### Pattern 1: Provisioner Module Shape

Every provisioner exports three functions. **Copy exactly from betterStackProvisioner.js.**

```javascript
// Source: server/gsd/provisioning/betterStackProvisioner.js (verified in codebase)
async function provisionX(projectName, ...args) {
  const apiKey = process.env.X_API_KEY;
  if (!apiKey) throw new Error('X_API_KEY not configured');
  const response = await fetch(URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ... }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`X provision failed: ${err.errors?.[0]?.message || response.statusText}`);
  }
  const data = await response.json();
  return { /* result fields */ };
}

async function checkX(projectName) {
  try {
    // ... fetch to check existence
    return true; // or false
  } catch {
    return false;
  }
}

module.exports = { provisionX, checkX };
```

### Pattern 2: stackRegistry.js SERVICES Array

```javascript
// Source: D-01 (locked decision)
'use strict';

// Discovery pass — services found in use but not yet formalised:
// - {PROJECT}_ANTHROPIC_API_KEY (found in: debates, KidAI, ynab)
// - {PROJECT}_DB_PASSWORD / POSTGRES_PASSWORD (found in: debates, ynab, utilities, zoho-sync)
// - {PROJECT}_GITHUB_GIST_TOKEN (found in: KidAI)
// (no standardised provisioner exists for these yet — future phases)

const SERVICES = [
  {
    name: 'betterstack',
    category: 'infrastructure',
    globalKeys: ['BETTERSTACK_API_KEY'],
    perProjectKeys: [],           // BetterStack tracks by project name, not env var
    customDomain: null,
    provisionerModule: './betterStackProvisioner',
    gateTriggeredAt: 'beta->launched',
  },
  {
    name: 'r2',
    category: 'infrastructure',
    globalKeys: ['CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID'],
    perProjectKeys: [],           // bucket name derived from project name
    customDomain: null,
    provisionerModule: './r2Provisioner',
    gateTriggeredAt: 'beta->launched',
  },
  {
    name: 'umami',
    category: 'infrastructure',
    globalKeys: ['UMAMI_API_TOKEN'],
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
    gateTriggeredAt: 'beta->launched',   // soft gate
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
```

### Pattern 3: Sentry API Flow (Two-step: create project, then fetch DSN)

```javascript
// Source: [CITED: docs.sentry.io/api/projects/create-a-new-project/]
//         [CITED: docs.sentry.io/api/projects/list-a-projects-client-keys/]

// Step 1: Create project
// POST /api/0/teams/{org}/{team}/projects/
// Body: { name: "project-name" }
// Response: 201 with project slug (NOT DSN — DSN is on the client keys)

// Step 2: Get DSN
// GET /api/0/projects/{org}/{slug}/keys/
// Response: array of keys, each with dsn.public field
```

**CRITICAL:** The `SENTRY_AUTH_TOKEN` in `.env.production` is a user auth token (prefix: `sntrys_`) scoped only to source-map uploads for the `pr-resources` project. It returns `"You do not have permission"` on org-level endpoints. A new token with `project:write` and `project:read` scopes must be created in Sentry UI and stored as the new `SENTRY_AUTH_TOKEN` value (or a separate `SENTRY_PROVISIONER_TOKEN`). [VERIFIED: live API call confirmed "You do not have permission to perform this action."]

The Sentry team slug to use for project creation is unknown from code — it must be fetched from `GET /api/0/organizations/gsdlabs/teams/` (or hardcoded as the default team slug once the token scope issue is resolved). [ASSUMED: default team slug is likely `gsdlabs` matching the org, but must be verified via API once token scopes are correct]

### Pattern 4: Umami API Flow

```javascript
// Source: [CITED: docs.umami.is/docs/api/websites] — verified 2026-06-02
// Source: [CITED: docs.umami.is/docs/api/authentication]

// Umami v3.1.0 (running on localhost:3007) — self-hosted, no persistent API keys
// Must login each time to get a session token, then use it

// Step 1: Get session token
// POST http://localhost:3007/api/auth/login
// Body: { username: "admin", password: process.env.UMAMI_ADMIN_PASSWORD }
// Response: { token: "eyJ..." }

// Step 2: Create website
// POST http://localhost:3007/api/websites
// Headers: Authorization: Bearer <token>
// Body: { name: "project-name", domain: "project.gsdlabs.dev" }
// Response: { id: "uuid", name: "...", domain: "..." }
// Store response.id as {PROJECT}_UMAMI_WEBSITE_ID
```

`UMAMI_ADMIN_PASSWORD` is already in `.env.production` [VERIFIED: grep confirms it]. No `UMAMI_API_TOKEN` exists yet — the provisioner will login each time using `UMAMI_ADMIN_PASSWORD`. A new env var `UMAMI_API_TOKEN` is not needed — the provisioner can use `UMAMI_ADMIN_PASSWORD` + login flow. **Decision for planner:** either accept login-per-provision (simpler, uses existing creds), or add `UMAMI_API_TOKEN` that stores a long-lived token obtained once. Given D-04 says "single shared admin token — add UMAMI_API_TOKEN", the provisioner should add a login step and document the UMAMI_ADMIN_PASSWORD→token flow, with `UMAMI_API_TOKEN` as an optional override if a persistent token approach is preferred. [ASSUMED: use UMAMI_ADMIN_PASSWORD for login since UMAMI_API_TOKEN doesn't exist yet and Umami self-hosted v3.1 doesn't expose a persistent API key UI]

The Umami service runs at `http://localhost:3007` internally and is exposed at `https://umami.gsdlabs.dev` via Cloudflare Tunnel. The provisioner should call the local port directly (faster, no tunnel overhead). [VERIFIED: `docker ps` confirms `0.0.0.0:3007->3000/tcp`]

### Pattern 5: Auto-Provisioning Execution Gap (critical)

The PATCH `/stage` route in `server/routes/gsd.js` currently calls `validateGates()` and proceeds if `gateResult.valid === true`, but **never executes the provisioners** even when `gateResult.requiresProvisioning` is non-empty. The `requiresProvisioning` items (BetterStack, R2) are shown in the StageTransitionModal UI as "Will be automatically created" but are never actually created by the current code.

This gap must be fixed in this phase. The PATCH route needs a provisioning execution block after validation:

```javascript
// After validateGates() returns valid=true
// Execute auto-provisioning for any services in requiresProvisioning
if (gateResult.requiresProvisioning.length > 0 && targetStage === 'launched') {
  const betterStack = require('../gsd/provisioning/betterStackProvisioner');
  const r2 = require('../gsd/provisioning/r2Provisioner');
  const umami = require('../gsd/provisioning/umamiProvisioner');
  const sentry = require('../gsd/provisioning/sentryProvisioner');
  
  const provisioningMap = {
    betterStackMonitor: () => betterStack.provisionMonitor(project.name, project.productionUrl),
    r2Bucket: () => r2.createBucket(project.name),
    umamiWebsite: () => umami.createWebsite(project.name, project.productionUrl),
    sentryProject: () => sentry.createProject(project.name),
  };
  
  for (const item of gateResult.requiresProvisioning) {
    if (provisioningMap[item]) {
      try {
        const result = await provisioningMap[item]();
        // Store results: write {PROJECT}_UMAMI_WEBSITE_ID and {PROJECT}_SENTRY_DSN to .env.production
      } catch (err) {
        // Hard gate items (betterStack, r2, umami) → re-throw to block transition
        // Soft gate items (sentry) → log warning, continue
      }
    }
  }
}
```

### Pattern 6: Writing to .env.production

The provisioners need to persist per-project keys (`{PROJECT}_UMAMI_WEBSITE_ID`, `{PROJECT}_SENTRY_DSN`) back to `/home/services/.env.production`. The existing `server/routes/env.js` provides a reference for reading/writing the env file. The provisioner should append new `{KEY}={VALUE}` lines if the key doesn't exist, or update in-place if it does. [VERIFIED: `server/routes/env.js` exists — check its write pattern before implementing]

### Pattern 7: CLAUDE.md Injection Format

```markdown
<!-- Stack (auto-managed by GSD Dashboard — do not edit manually) -->
## Stack (auto-managed)

| Service | Key | Purpose |
|---------|-----|---------|
| Umami | `PROJNAME_UMAMI_WEBSITE_ID` | Analytics |
| BetterStack | (monitor registered by name) | Uptime monitoring |
| Cloudflare R2 | (bucket: gsd-projname) | Storage |
| Sentry | `PROJNAME_SENTRY_DSN` | Error tracking |

*Last updated: 2026-06-02T09:00:00Z — updated automatically on each stage transition.*
<!-- /Stack -->
```

The injection should replace content between `<!-- Stack` and `<!-- /Stack -->` markers if they exist, or append to end of file otherwise. This is idempotent and safe to re-run.

### Anti-Patterns to Avoid

- **Don't inline provisioner calls in validateGates.js:** Gate checking and gate execution are separate concerns. validateGates reports what needs doing; the PATCH route does it.
- **Don't use `Bearer Token` for Umami:** Umami uses `Bearer <token>` (not `Token <token>`). Wrong format returns 401.
- **Don't skip the DSN fetch step for Sentry:** The project creation response does NOT include the DSN. A separate GET to `/keys/` is required after project creation.
- **Don't use the existing SENTRY_AUTH_TOKEN for project creation:** It's scoped to source-map uploads only. A new token with `project:write` is required.
- **Don't write .env.production from multiple places simultaneously:** The append/update must be atomic (read-modify-write with a lock or sequential execution).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP calls to Sentry/Umami APIs | Custom HTTP client | globalThis.fetch + AbortSignal.timeout(10000) | Already the pattern in all provisioners |
| Env file parsing | Custom parser | Read-line-by-line with regex replace (existing pattern in env.js) | Edge cases in quoted values |
| Test mocking of fetch | sinon/nock | Direct `global.fetch = async () => {}` assignment | Already the pattern in provisioning.test.js |
| Sentry SDK initialization | `@sentry/node` | Direct REST API calls | SDK is for capturing errors; provisioning is just REST |

---

## Runtime State Inventory

> Phase involves writing to `.env.production` (a live file) and project CLAUDE.md files on disk.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `gsd-projects.json` — 13 projects, all stage=draft; no launched projects to backfill | No backfill needed at launch; CLAUDE.md injection triggers only on next Beta→Launched transition |
| Live service config | Umami v3.1.0 in Docker (container: `umami`, port 3007); 3 existing `{PROJECT}_UMAMI_WEBSITE_ID` entries already in `.env.production` (portfolio, debates, prc) | Provisioner must check if website already exists before creating (use GET /api/websites filtered by domain) |
| OS-registered state | None — no OS-level registration for Sentry projects or Umami websites | None |
| Secrets/env vars | `SENTRY_AUTH_TOKEN` — wrong scope (source-map upload only), returns 403 on org API; `UMAMI_ADMIN_PASSWORD` — present and working; `UMAMI_API_TOKEN` — does not exist yet | New Sentry token with `project:write` scope needed; Umami provisioner can use UMAMI_ADMIN_PASSWORD login flow |
| Build artifacts | None | None |

**Existing per-project Umami IDs in .env.production:** `PORTFOLIO_UMAMI_WEBSITE_ID`, `DEBATES_UMAMI_WEBSITE_ID`, `PRC_UMAMI_WEBSITE_ID` — these were set manually. The provisioner `checkWebsite()` function must detect these existing entries (by querying Umami API or by checking env var presence) to avoid duplicate website creation.

---

## Common Pitfalls

### Pitfall 1: Sentry Token Scope Mismatch
**What goes wrong:** Provisioner calls `POST /api/0/teams/gsdlabs/{team}/projects/` and gets `403 You do not have permission`.
**Why it happens:** The current `SENTRY_AUTH_TOKEN` is a user auth token (`sntrys_` prefix) scoped to source-map uploads for `pr-resources` only.
**How to avoid:** Create a new internal integration token in Sentry org settings with `project:write` + `project:read` scopes. Store as updated `SENTRY_AUTH_TOKEN` (or `SENTRY_PROVISIONER_TOKEN`). The provisioner should validate token scope on startup if possible.
**Warning signs:** Response body contains `"You do not have permission to perform this action."` [VERIFIED: confirmed in live API test]

### Pitfall 2: Umami Session Token Expiry
**What goes wrong:** The token obtained from `/api/auth/login` expires mid-provision and subsequent API calls return 401.
**Why it happens:** Umami session tokens have a configured TTL (typically 24h but configurable via `TOKEN_SECRET`).
**How to avoid:** Obtain a fresh token at the start of each `createWebsite()` call, not once at module load. The provisioner is called infrequently (only at Beta→Launched), so per-call login overhead is negligible.

### Pitfall 3: Duplicate Umami Website Creation
**What goes wrong:** Running Beta→Launched twice creates two Umami websites for the same project, resulting in split analytics data.
**Why it happens:** `checkWebsite()` might not detect existing websites if it only checks `{PROJECT}_UMAMI_WEBSITE_ID` env var (which might be set but point to the wrong entry).
**How to avoid:** `checkWebsite()` should query `GET /api/websites` and check for matching domain, not just env var presence.

### Pitfall 4: Missing CLOUDFLARE_ACCOUNT_ID in .env.production
**What goes wrong:** `r2Provisioner.checkBucket()` throws `CLOUDFLARE_ACCOUNT_ID not configured` during gate validation.
**Why it happens:** `CLOUDFLARE_ACCOUNT_ID` is NOT present in `/home/services/.env.production` [VERIFIED: grep confirmed absence]. The r2Provisioner requires it but it's missing.
**How to avoid:** Add `CLOUDFLARE_ACCOUNT_ID` to `.env.production` as part of this phase (or it was already handled — executor should check `checkBucket` works against a live project).
**Impact:** validateGates currently throws an error (not returns false) when `checkBucket` is called — the provisioning.test.js mocks env vars, so tests pass, but production gate validation may fail.

### Pitfall 5: Auto-Provisioning Never Fires (Existing Gap)
**What goes wrong:** User clicks "Confirm & Auto-Create" in StageTransitionModal, expects BetterStack/R2 to be created, but nothing happens.
**Why it happens:** The PATCH `/stage` route calls `validateGates()` but ignores `requiresProvisioning` — it never calls `provisionMonitor()` or `createBucket()`. [VERIFIED: full code trace of PATCH /stage in gsd.js confirms this]
**How to avoid:** Add provisioning execution block to PATCH `/stage` after `validateGates()` returns valid=true. This is a required fix in this phase.

### Pitfall 6: CLAUDE.md Injection Overwrites Existing Content
**What goes wrong:** Writing `## Stack (auto-managed)` replaces important project-specific content.
**Why it happens:** Simple file append or section replacement with wrong boundaries.
**How to avoid:** Use HTML comment markers (`<!-- Stack ... -->`) as idempotent insertion anchors. Replace between markers if present; append if not.

---

## Code Examples

### Sentry Provisioner

```javascript
// Source: [CITED: docs.sentry.io/api/projects/create-a-new-project/] +
//         [CITED: docs.sentry.io/api/projects/list-a-projects-client-keys/]
'use strict';

const SENTRY_BASE = 'https://sentry.io/api/0';

async function createProject(projectName) {
  const authToken = process.env.SENTRY_AUTH_TOKEN;
  const org = process.env.SENTRY_ORG || 'gsdlabs';
  if (!authToken) throw new Error('SENTRY_AUTH_TOKEN not configured');

  // Step 1: Get default team slug (or use org slug as team slug)
  // Teams endpoint: GET /api/0/organizations/{org}/teams/
  // For simplicity, use org slug as default team (valid if a team matching org exists)
  const team = org;

  // Step 2: Create project
  const createResp = await fetch(`${SENTRY_BASE}/teams/${org}/${team}/projects/`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `gsd-${projectName}` }),
    signal: AbortSignal.timeout(10000),
  });
  if (!createResp.ok) {
    const err = await createResp.json().catch(() => ({}));
    throw new Error(`Sentry project creation failed: ${err.detail || createResp.statusText}`);
  }
  const { slug } = await createResp.json();

  // Step 3: Fetch DSN from client keys
  const keysResp = await fetch(`${SENTRY_BASE}/projects/${org}/${slug}/keys/`, {
    headers: { 'Authorization': `Bearer ${authToken}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!keysResp.ok) throw new Error(`Sentry keys fetch failed: ${keysResp.statusText}`);
  const keys = await keysResp.json();
  const dsn = keys[0]?.dsn?.public;
  if (!dsn) throw new Error('Sentry project created but no DSN found');

  return { dsn, projectSlug: slug };
}

async function checkProject(projectName) {
  try {
    const authToken = process.env.SENTRY_AUTH_TOKEN;
    const org = process.env.SENTRY_ORG || 'gsdlabs';
    if (!authToken) return false;
    const slug = `gsd-${projectName}`;
    const resp = await fetch(`${SENTRY_BASE}/projects/${org}/${slug}/`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
      signal: AbortSignal.timeout(10000),
    });
    return resp.ok;
  } catch { return false; }
}

module.exports = { createProject, checkProject };
```

### Umami Provisioner

```javascript
// Source: [CITED: docs.umami.is/docs/api/websites] +
//         [CITED: docs.umami.is/docs/api/authentication]
'use strict';

const UMAMI_BASE = process.env.UMAMI_INTERNAL_URL || 'http://localhost:3007';

async function getToken() {
  const password = process.env.UMAMI_ADMIN_PASSWORD;
  if (!password) throw new Error('UMAMI_ADMIN_PASSWORD not configured');
  const resp = await fetch(`${UMAMI_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Umami login failed: ${resp.statusText}`);
  const { token } = await resp.json();
  return token;
}

async function createWebsite(projectName, domain) {
  const token = await getToken();
  const resp = await fetch(`${UMAMI_BASE}/api/websites`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `gsd-${projectName}`, domain }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Umami website creation failed: ${err.message || resp.statusText}`);
  }
  const { id } = await resp.json();
  return { websiteId: id };
}

async function checkWebsite(projectName, domain) {
  try {
    const token = await getToken();
    const resp = await fetch(`${UMAMI_BASE}/api/websites`, {
      headers: { 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return false;
    const sites = await resp.json();
    // Check by domain to avoid env-var-only detection
    const list = Array.isArray(sites) ? sites : (sites.data || []);
    return list.some(s => s.domain === domain || s.name === `gsd-${projectName}`);
  } catch { return false; }
}

module.exports = { createWebsite, checkWebsite };
```

### Discovery Pass Output (comment block in stackRegistry.js)

```javascript
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
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| validateGates returns requiresProvisioning but never runs it | validateGates + auto-provisioning execution in PATCH route | This phase | Beta→Launched actually creates BetterStack monitors and R2 buckets |
| No centralised service registry | stackRegistry.js SERVICES array | This phase | Single source of truth for all services Claude knows about |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Sentry team slug is `gsdlabs` (matching org slug) — actual team slug unknown until token scope is fixed | Sentry Provisioner code example | If team slug differs, `POST /teams/{org}/{team}/projects/` returns 404; provisioner must either fetch teams first or make team slug configurable |
| A2 | Umami admin username is `admin` | Umami Provisioner code example | If username is different (e.g. email), login fails; `UMAMI_ADMIN_USERNAME` env var fallback recommended |
| A3 | `CLOUDFLARE_ACCOUNT_ID` absence in `.env.production` is intentional (perhaps loaded differently) | Pitfall 4 | If it's actually required and missing, r2Provisioner throws on all gate checks; executor should verify before running provisioning tests |
| A4 | The `gsd.js` PATCH `/stage` route is where provisioning execution belongs (not a separate endpoint) | Pattern 5 | If a separate `/provision` endpoint is preferred, plan structure changes; but CONTEXT.md implies single-step "Confirm & Auto-Create" which maps to PATCH /stage |

---

## Open Questions (RESOLVED)

1. **Sentry team slug** — **(RESOLVED: use org slug as team slug)**
   - Decision: Hardcode `team = org` (i.e. `gsdlabs`). Sentry orgs have a default team with the same slug as the org. If wrong, `createProject` fails with a descriptive error and the soft gate logs a warning and continues — this is acceptable behavior since Sentry is advisory-only (D-03).
   - Pre-execution requirement: Create a new Sentry internal integration token with `project:write` + `project:read` scopes in Sentry UI. Store as `SENTRY_AUTH_TOKEN` in `.env.production`. The current token has source-map upload scope only and will fail.

2. **CLOUDFLARE_ACCOUNT_ID missing from .env.production** — **(RESOLVED: add in Plan 02 pre-execution step)**
   - Decision: The value must be added to `.env.production` before the provisioning execution block is tested. Plan 03 includes a pre-execution note that `CLOUDFLARE_ACCOUNT_ID` must be present. The executor should retrieve it from the Cloudflare dashboard (Zone → Account ID) and add it to `.env.production` before running Wave 3.
   - Note: This does not block Plans 01 or 02 (tests mock env vars). Only the live provisioning in Plan 03 requires it.

3. **Backfill for existing launched projects** — **(RESOLVED: skip)**
   - Decision: All 13 projects are currently `stage=draft`. No backfill needed. The CLAUDE.md Stack section will be injected automatically on the next Beta→Launched transition for each project.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Umami (localhost:3007) | umamiProvisioner | Yes | v3.1.0 | — |
| Sentry API (sentry.io) | sentryProvisioner | Yes (connectivity) | — | Soft gate: skip and warn |
| SENTRY_AUTH_TOKEN with project:write | sentryProvisioner | No (wrong scope) | — | Must create new token in Sentry UI before executing |
| CLOUDFLARE_ACCOUNT_ID | r2Provisioner.checkBucket() | No (missing from .env.production) | — | Must add to .env.production before executing |
| Node.js fetch | All provisioners | Yes | Node 21 built-in | — |

**Missing dependencies with no fallback:**
- New Sentry token (project:write scope) — required before sentryProvisioner can be tested
- CLOUDFLARE_ACCOUNT_ID — required before r2Provisioner calls succeed in production (tests mock it)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in, v21) |
| Config file | none — invoked directly |
| Quick run command | `node --test --test-timeout 30000 server/__tests__/provisioning.test.js server/__tests__/stage-transitions.test.js` |
| Full suite command | `npm run test:server` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROV-01 | sentryProvisioner.createProject() returns `{ dsn, projectSlug }` | unit | `node --test server/__tests__/provisioning.test.js` | ❌ Wave 0 — add to provisioning.test.js |
| PROV-02 | sentryProvisioner.checkProject() returns false on 404 | unit | same | ❌ Wave 0 |
| PROV-03 | umamiProvisioner.createWebsite() returns `{ websiteId }` | unit | same | ❌ Wave 0 |
| PROV-04 | umamiProvisioner.checkWebsite() uses domain matching not just env var | unit | same | ❌ Wave 0 |
| GATE-01 | validateGates beta->launched includes sentryProject in softGates when missing | unit | same | ❌ Wave 0 — extend provisioning.test.js |
| GATE-02 | validateGates beta->launched includes umamiWebsite in requiresProvisioning when missing | unit | same | ❌ Wave 0 |
| EXEC-01 | PATCH /stage executes provisioners for items in requiresProvisioning | integration | `node --test server/__tests__/stage-transitions.test.js` | ❌ Wave 0 — extend stage-transitions.test.js |
| REG-01 | stackRegistry.js exports SERVICES array with all 9 expected service names | unit | `node --test server/__tests__/stack-registry.test.js` | ❌ Wave 0 — new test file |
| INJECT-01 | CLAUDE.md injection creates ## Stack section with correct env var names | unit | `node --test server/__tests__/claude-md-inject.test.js` | ❌ Wave 0 — new test file |

### Sampling Rate
- **Per task commit:** `node --test --test-timeout 30000 server/__tests__/provisioning.test.js`
- **Per wave merge:** `npm run test:server`
- **Phase gate:** `npm run test:server` all green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Extend `server/__tests__/provisioning.test.js` — add sentryProvisioner and umamiProvisioner tests
- [ ] Extend `server/__tests__/stage-transitions.test.js` — add provisioning execution test
- [ ] Create `server/__tests__/stack-registry.test.js` — validates SERVICES array shape
- [ ] Create `server/__tests__/claude-md-inject.test.js` — validates CLAUDE.md injection helper

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | All API calls are server-side; credentials never exposed to browser |
| V5 Input Validation | yes | Project names sanitised before use in API calls (already done in r2Provisioner via `bucketName()` function) |
| V6 Cryptography | no | No new crypto — env file write is plaintext, same as existing `.env.production` pattern |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| API tokens in env file (plaintext) | Information Disclosure | Existing pattern — .env.production has 0600 permissions; consistent with all other secrets in this project |
| Project name injection into API request body | Tampering | Sanitise project name (strip non-alphanumeric except hyphens) — follow r2Provisioner's `bucketName()` pattern |

---

## Sources

### Primary (HIGH confidence)
- `server/gsd/provisioning/betterStackProvisioner.js` — provisioner pattern (read directly)
- `server/gsd/provisioning/r2Provisioner.js` — bucket provisioner pattern (read directly)
- `server/gsd/provisioning/stageGates/validateGates.js` — gate logic (read directly)
- `server/routes/gsd.js` lines 508–571 — PATCH /stage route (read directly, confirmed auto-provisioning gap)
- `server/__tests__/provisioning.test.js` — test patterns (read directly)
- `/home/services/.env.production` — confirmed env vars present/absent (grep verified)
- `docker ps` — confirmed umami v3.1.0 on localhost:3007
- Live Sentry API test — confirmed SENTRY_AUTH_TOKEN has wrong scope

### Secondary (MEDIUM confidence)
- [CITED: docs.umami.is/docs/api/websites] — POST /api/websites endpoint and response shape
- [CITED: docs.umami.is/docs/api/authentication] — Bearer token auth flow
- [CITED: docs.sentry.io/api/projects/create-a-new-project/] — project creation endpoint
- [CITED: docs.sentry.io/api/projects/list-a-projects-client-keys/] — DSN retrieval endpoint

### Assumptions
- A1: Sentry team slug — ASSUMED, needs verification post token-scope fix
- A2: Umami admin username is `admin` — ASSUMED from common default
- A3: CLOUDFLARE_ACCOUNT_ID absence — VERIFIED as absent, cause unknown

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing provisioner patterns read directly from codebase
- Architecture: HIGH — full code trace of PATCH /stage route, gate logic, and modal UI
- Pitfalls: HIGH — SENTRY_AUTH_TOKEN scope verified via live API; CLOUDFLARE_ACCOUNT_ID absence verified via grep; auto-provisioning gap verified by reading PATCH /stage code
- Sentry/Umami API specifics: MEDIUM — from official docs, endpoint shapes verified

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (stable APIs; Sentry/Umami don't change endpoints frequently)
