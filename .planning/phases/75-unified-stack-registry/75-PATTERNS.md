# Phase 75: Unified Stack Registry - Pattern Map

**Mapped:** 2026-06-02
**Files analyzed:** 7 new/modified files
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/gsd/provisioning/stackRegistry.js` | config/registry | transform | `server/gsd/provisioning/betterStackProvisioner.js` (shape reference) | partial-match (same directory, module export pattern) |
| `server/gsd/provisioning/sentryProvisioner.js` | service | request-response | `server/gsd/provisioning/betterStackProvisioner.js` | exact |
| `server/gsd/provisioning/umamiProvisioner.js` | service | request-response | `server/gsd/provisioning/betterStackProvisioner.js` | exact |
| `server/gsd/provisioning/stageGates/validateGates.js` | service | request-response | itself (modify) | exact |
| `server/routes/gsd.js` (PATCH /stage block only) | route | request-response | itself (modify) | exact |
| `server/__tests__/provisioning.test.js` (extend) | test | — | itself (modify) | exact |
| `server/__tests__/stack-registry.test.js` (new) | test | — | `server/__tests__/provisioning.test.js` | exact |
| `server/__tests__/claude-md-inject.test.js` (new) | test | — | `server/__tests__/provisioning.test.js` | role-match |

## Pattern Assignments

---

### `server/gsd/provisioning/stackRegistry.js` (config, transform)

**Analog:** `server/gsd/provisioning/betterStackProvisioner.js` (module shape) + RESEARCH.md Pattern 2

**'use strict' + module.exports pattern** (lines 1, 59 of betterStackProvisioner.js):
```javascript
'use strict';
// ... module body ...
module.exports = { provisionMonitor, checkMonitor, deleteMonitor };
```

**Core pattern** — export a named constant array, not a class. Shape from RESEARCH.md Pattern 2:
```javascript
'use strict';

// ============================================================
// DISCOVERY PASS — 2026-06-02
// Services found in gsd-projects.json env patterns / .env.production
// not yet formalised in this registry:
//   {PROJECT}_ANTHROPIC_API_KEY (DEBATES_, KIDAI_, YNAB_)
//   {PROJECT}_DB_PASSWORD / POSTGRES_PASSWORD (DEBATES_, UTILITIES_, YNAB_, ZOHO_SYNC_)
//   {PROJECT}_GITHUB_GIST_TOKEN (KIDAI_)
// These are informational only. No code changes made to existing projects.
// ============================================================

const SERVICES = [ /* ... entries ... */ ];

module.exports = { SERVICES };
```

**Entry shape** (from CONTEXT.md D-01):
```javascript
{
  name: 'betterstack',           // string identifier used in requiresProvisioning arrays
  category: 'infrastructure',   // 'infrastructure' | 'functional'
  globalKeys: ['BETTERSTACK_API_KEY'],
  perProjectKeys: [],            // [] if none; ['{PROJECT}_KEY'] if per-project
  customDomain: null,            // null or 'umami.gsdlabs.dev' etc.
  provisionerModule: './betterStackProvisioner',  // null if no provisioner
  gateTriggeredAt: 'beta->launched',             // null if not gate-triggered
}
```

---

### `server/gsd/provisioning/sentryProvisioner.js` (service, request-response)

**Analog:** `server/gsd/provisioning/betterStackProvisioner.js` — copy structure exactly

**Full file pattern** (betterStackProvisioner.js lines 1-59):

**Imports pattern** (lines 1-3):
```javascript
'use strict';

const SENTRY_BASE = 'https://sentry.io/api/0';
```

**Credential guard pattern** (lines 6-8 of betterStackProvisioner.js):
```javascript
const apiKey = process.env.BETTERSTACK_API_KEY;
if (!apiKey) throw new Error('BETTERSTACK_API_KEY not configured');
```
For Sentry:
```javascript
const authToken = process.env.SENTRY_AUTH_TOKEN;
const org = process.env.SENTRY_ORG || 'gsdlabs';
if (!authToken) throw new Error('SENTRY_AUTH_TOKEN not configured');
```

**Core fetch pattern** (lines 9-19 of betterStackProvisioner.js):
```javascript
const response = await fetch(`${BETTERSTACK_BASE}/monitors`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ... }),
  signal: AbortSignal.timeout(10000),
});
```

**Error handling pattern** (lines 21-24 of betterStackProvisioner.js):
```javascript
if (!response.ok) {
  const err = await response.json().catch(() => ({}));
  throw new Error(`BetterStack provision failed: ${err.errors?.[0]?.title || err.message || response.statusText}`);
}
```

**checkX returns false on any failure** (lines 31-43 of betterStackProvisioner.js):
```javascript
async function checkMonitor(projectName) {
  try {
    // ... fetch ...
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}
```

**module.exports** (line 59 of betterStackProvisioner.js):
```javascript
module.exports = { provisionMonitor, checkMonitor, deleteMonitor };
```
For Sentry: `module.exports = { createProject, checkProject };`

**Sentry-specific: two-step provision** (RESEARCH.md Pattern 3):
```javascript
// Step 1: Create project — returns slug, NOT dsn
// POST /api/0/teams/{org}/{team}/projects/
// Body: { name: 'gsd-{projectName}' }
// Response: { slug: '...' }

// Step 2: Fetch DSN — separate request
// GET /api/0/projects/{org}/{slug}/keys/
// Response: array — keys[0].dsn.public is the DSN string
```
CRITICAL: never skip step 2. DSN is not in the project creation response.

**Project name sanitisation** — copy `bucketName()` pattern from r2Provisioner.js lines 16-18:
```javascript
function projectSlug(projectName) {
  return `gsd-${projectName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}
```

---

### `server/gsd/provisioning/umamiProvisioner.js` (service, request-response)

**Analog:** `server/gsd/provisioning/betterStackProvisioner.js` — copy structure exactly

**Imports pattern** (lines 1-3):
```javascript
'use strict';

const UMAMI_BASE = process.env.UMAMI_INTERNAL_URL || 'http://localhost:3007';
```

**Two-phase auth pattern** — Umami has no persistent API key, must login per call:
```javascript
async function getToken() {
  const password = process.env.UMAMI_ADMIN_PASSWORD;
  if (!password) throw new Error('UMAMI_ADMIN_PASSWORD not configured');
  const resp = await fetch(`${UMAMI_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.UMAMI_ADMIN_USERNAME || 'admin', password }),
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Umami login failed: ${resp.statusText}`);
  const { token } = await resp.json();
  return token;
}
```
Call `getToken()` at the top of `createWebsite()` and `checkWebsite()`, NOT at module load — tokens expire.

**checkWebsite must use domain matching** (RESEARCH.md Pitfall 3 + Pattern 4):
```javascript
// Check by domain, NOT just env var presence — avoid duplicate website creation
const list = Array.isArray(sites) ? sites : (sites.data || []);
return list.some(s => s.domain === domain || s.name === `gsd-${projectName}`);
```

**module.exports:**
```javascript
module.exports = { createWebsite, checkWebsite };
```

---

### `server/gsd/provisioning/stageGates/validateGates.js` (service, request-response) — MODIFY

**Analog:** itself — this is a modification, not a new file

**Current import block** (lines 1-4):
```javascript
'use strict';

const betterStackProvisioner = require('../betterStackProvisioner');
const r2Provisioner = require('../r2Provisioner');
```
Add:
```javascript
const sentryProvisioner = require('../sentryProvisioner');
const umamiProvisioner = require('../umamiProvisioner');
```
Also add (optionally, for documentation value):
```javascript
// const { SERVICES } = require('../stackRegistry'); // imported for documentation; validateGates uses provisioners directly
```

**Existing hard gate pattern** (lines 49-56 — betterStack and r2 gates):
```javascript
// Hard gate: BetterStack monitor (auto-provisionable)
const hasMonitor = await betterStackProvisioner.checkMonitor(project.name);
if (!hasMonitor) {
  requiresProvisioning.push('betterStackMonitor');
}
// Hard gate: R2 bucket (auto-provisionable)
const hasBucket = await r2Provisioner.checkBucket(project.name);
if (!hasBucket) {
  requiresProvisioning.push('r2Bucket');
}
```
Add alongside these (same pattern):
```javascript
// Hard gate: Umami analytics website (auto-provisionable)
const hasUmami = await umamiProvisioner.checkWebsite(project.name, project.productionUrl);
if (!hasUmami) {
  requiresProvisioning.push('umamiWebsite');
}
// Soft gate: Sentry error tracking (advisory only — does not block launch)
const hasSentry = await sentryProvisioner.checkProject(project.name);
if (!hasSentry) {
  softGates.push({ gate: 'sentryProject', label: 'Sentry error tracking recommended for Launched stage', pass: false });
  requiresProvisioning.push('sentryProject');
}
```

**Current soft gate pattern** for reference (lines 60-62):
```javascript
// Soft gate: GitHub Issues (advisory only — does not block)
softGates.push({ gate: 'githubIssuesEnabled', label: 'GitHub Issues recommended for Launched stage', pass: true });
```

**Valid determination** (line 71-72 — unchanged, valid = no hard gate failures):
```javascript
const valid = hardGates.length === 0;
return { valid, hardGates, softGates, requiresProvisioning };
```

---

### `server/routes/gsd.js` PATCH /stage block (route) — MODIFY

**Analog:** itself — targeted modification of the gap at lines 532-537

**Current gap location** (lines 532-537 of gsd.js):
```javascript
const gateResult = await validateGates(project, targetStage);
if (!gateResult.valid) {
  const failed = gateResult.hardGates.filter(g => !g.pass).map(g => g.label).join('; ');
  return res.status(422).json({ error: `Stage transition blocked: ${failed}` });
}
// ← auto-provisioning execution block goes here (currently missing)
// Retired: stop tmux session and archive GitHub repo
if (targetStage === 'retired') {
```

**Provisioning execution block to insert** (RESEARCH.md Pattern 5 + env.js write pattern):
```javascript
// Execute auto-provisioning for services in requiresProvisioning
if (gateResult.requiresProvisioning.length > 0 && targetStage === 'launched') {
  const betterStack = require('../gsd/provisioning/betterStackProvisioner');
  const r2 = require('../gsd/provisioning/r2Provisioner');
  const umami = require('../gsd/provisioning/umamiProvisioner');
  const sentry = require('../gsd/provisioning/sentryProvisioner');

  const provisioningMap = {
    betterStackMonitor: () => betterStack.provisionMonitor(project.name, project.productionUrl),
    r2Bucket:           () => r2.createBucket(project.name),
    umamiWebsite:       () => umami.createWebsite(project.name, project.productionUrl),
    sentryProject:      () => sentry.createProject(project.name),
  };

  const isSoftGate = new Set(['sentryProject']);

  for (const item of gateResult.requiresProvisioning) {
    if (provisioningMap[item]) {
      try {
        const result = await provisioningMap[item]();
        // Persist per-project env keys returned by provisioners
        if (item === 'umamiWebsite' && result.websiteId) {
          await appendEnvKey(`${project.name.toUpperCase()}_UMAMI_WEBSITE_ID`, result.websiteId);
        }
        if (item === 'sentryProject' && result.dsn) {
          await appendEnvKey(`${project.name.toUpperCase()}_SENTRY_DSN`, result.dsn);
        }
      } catch (err) {
        if (isSoftGate.has(item)) {
          console.warn(`[provisioning] ${item} soft-gate provisioning failed (non-blocking):`, err.message);
        } else {
          return res.status(500).json({ error: `Auto-provisioning failed for ${item}`, detail: err.message });
        }
      }
    }
  }

  // Write ## Stack (auto-managed) section to project's CLAUDE.md
  try {
    await injectStackSection(project);
  } catch (err) {
    console.warn('[provisioning] CLAUDE.md Stack injection failed (non-blocking):', err.message);
  }
}
```

**Env write helper** — use `parseEnvFile` / `serialiseRows` pattern from `server/routes/env.js` lines 30-57:
```javascript
// Use env.js's parseEnvFile + serialiseRows approach, but called inline
// Read env file, update/append key, atomic write via tmp+rename
const fs = require('fs');
const os = require('os');
const path = require('path');
const ENV_PATH = '/home/services/.env.production';

async function appendEnvKey(key, value) {
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  const lines = content.split('\n');
  const idx = lines.findIndex(l => l.startsWith(`${key}=`));
  if (idx >= 0) {
    lines[idx] = `${key}=${value}`;
  } else {
    lines.push(`${key}=${value}`);
  }
  const tmpPath = path.join(os.tmpdir(), `env-${Date.now()}.tmp`);
  fs.writeFileSync(tmpPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
  try { fs.renameSync(tmpPath, ENV_PATH); }
  catch (e) { if (e.code === 'EXDEV') { fs.copyFileSync(tmpPath, ENV_PATH); fs.unlinkSync(tmpPath); } else throw e; }
}
```
This mirrors the atomic write in `server/routes/env.js` lines 85-119.

**CLAUDE.md injection helper** (RESEARCH.md Pattern 7):
```javascript
// Replace between <!-- Stack ... --> and <!-- /Stack --> markers if present
// Append to end of file if markers absent
const STACK_OPEN = '<!-- Stack (auto-managed by GSD Dashboard — do not edit manually) -->';
const STACK_CLOSE = '<!-- /Stack -->';

function buildStackSection(project, provisionedKeys) {
  // Build markdown table from provisioned services
  // ...return string between STACK_OPEN and STACK_CLOSE markers
}
```

---

### `server/__tests__/provisioning.test.js` (test) — EXTEND

**Analog:** itself (lines 1-141) — add new describe blocks in same file, same style

**Global fetch mock pattern** (lines 7-14):
```javascript
let mockFetch;
const originalFetch = global.fetch;

describe('provisioning', () => {
  beforeEach(() => {
    mockFetch = null;
    global.fetch = async (url, opts) => {
      if (mockFetch) return mockFetch(url, opts);
      throw new Error('fetch not mocked');
    };
    process.env.BETTERSTACK_API_KEY = 'test-bs-key';
    // ... set all required env vars
  });
  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.BETTERSTACK_API_KEY;
    // ... clean up env vars
  });
```

**Module cache clearing pattern** (lines 37-38, repeated pattern):
```javascript
delete require.cache[require.resolve('../gsd/provisioning/betterStackProvisioner')];
const { provisionMonitor } = require('../gsd/provisioning/betterStackProvisioner');
```

**URL-discriminating fetch mock** (lines 103-108 — used for multi-provisioner tests):
```javascript
mockFetch = async (url) => {
  if (url.includes('betterstack.com')) {
    return { ok: true, json: async () => ({ data: [] }) };
  }
  return { ok: false, json: async () => ({}) };
};
```

**New env vars to add in beforeEach:**
```javascript
process.env.SENTRY_AUTH_TOKEN = 'test-sentry-token';
process.env.SENTRY_ORG = 'test-org';
process.env.UMAMI_ADMIN_PASSWORD = 'test-umami-password';
```

**New describe blocks to add** (following the betterStackProvisioner and r2Provisioner patterns):
```javascript
describe('sentryProvisioner', () => {
  it('createProject returns { dsn, projectSlug } on success', async () => { ... });
  it('createProject throws when SENTRY_AUTH_TOKEN missing', async () => { ... });
  it('checkProject returns false on 404', async () => { ... });
});

describe('umamiProvisioner', () => {
  it('createWebsite returns { websiteId } on success', async () => { ... });
  it('checkWebsite uses domain matching not just env var', async () => { ... });
  it('checkWebsite returns false on login failure', async () => { ... });
});

describe('validateGates with sentry + umami', () => {
  it('beta->launched includes umamiWebsite in requiresProvisioning when missing', async () => { ... });
  it('beta->launched includes sentryProject in softGates when missing', async () => { ... });
  it('beta->launched: sentryProject failure does not set valid=false', async () => { ... });
});
```

---

### `server/__tests__/stack-registry.test.js` (test, new)

**Analog:** `server/__tests__/provisioning.test.js` (describe/it/assert structure)

**File structure** (copy header from provisioning.test.js lines 1-3):
```javascript
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
```

**Pattern:** No fetch mocking needed — stackRegistry.js is a pure data module.

```javascript
describe('stackRegistry', () => {
  const { SERVICES } = require('../gsd/provisioning/stackRegistry');

  it('REG-01: exports SERVICES array with all expected service names', () => {
    const names = SERVICES.map(s => s.name);
    for (const expected of ['betterstack', 'r2', 'umami', 'sentry', 'resend', 'postgres', 'github', 'cloudflare-tunnel', 'pipedream']) {
      assert.ok(names.includes(expected), `missing service: ${expected}`);
    }
  });

  it('REG-02: every entry has required shape fields', () => {
    for (const svc of SERVICES) {
      assert.ok(typeof svc.name === 'string', `name must be string: ${JSON.stringify(svc)}`);
      assert.ok(['infrastructure', 'functional'].includes(svc.category), `invalid category: ${svc.category}`);
      assert.ok(Array.isArray(svc.globalKeys), `globalKeys must be array`);
      assert.ok(Array.isArray(svc.perProjectKeys), `perProjectKeys must be array`);
    }
  });

  it('REG-03: infrastructure services have gateTriggeredAt set', () => {
    SERVICES.filter(s => s.category === 'infrastructure').forEach(s => {
      assert.ok(s.gateTriggeredAt, `infrastructure service ${s.name} missing gateTriggeredAt`);
    });
  });
});
```

---

### `server/__tests__/claude-md-inject.test.js` (test, new)

**Analog:** `server/__tests__/provisioning.test.js` (fs mocking pattern) + stage-transitions.test.js (temp file pattern)

**Temp file pattern** (stage-transitions.test.js lines 9-10):
```javascript
const path = require('path');
const fs = require('fs');
const os = require('os');

const TEMP_CLAUDE_MD = path.join(os.tmpdir(), `claude-md-test-${Date.now()}.md`);
```

**Pattern:** Write temp CLAUDE.md, call inject helper, assert file content.

```javascript
describe('claudeMdInject', () => {
  afterEach(() => {
    try { fs.unlinkSync(TEMP_CLAUDE_MD); } catch {}
  });

  it('INJECT-01: creates ## Stack section with correct env var names', () => { ... });
  it('INJECT-02: replaces existing section between markers (idempotent)', () => { ... });
  it('INJECT-03: appends to file when no markers present', () => { ... });
});
```

---

## Shared Patterns

### Provisioner Module Shape
**Source:** `server/gsd/provisioning/betterStackProvisioner.js` lines 1-59
**Apply to:** `sentryProvisioner.js`, `umamiProvisioner.js`

Three-function shape: `provisionX(projectName, ...)` / `checkX(projectName)` / optionally `deleteX(id)`.

- `provisionX` throws on failure (caller catches and decides hard vs soft)
- `checkX` catches all errors and returns `false` (never throws)
- All HTTP calls use `AbortSignal.timeout(10000)` — copy exactly

### Name Sanitisation
**Source:** `server/gsd/provisioning/r2Provisioner.js` lines 16-18
**Apply to:** `sentryProvisioner.js`, `umamiProvisioner.js`

```javascript
// r2Provisioner.js lines 16-18
function bucketName(projectName) {
  return `gsd-${projectName}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}
```
Both new provisioners should use an equivalent sanitiser: `gsd-${projectName}` lowercased, only `[a-z0-9-]` allowed.

### Atomic .env.production Write
**Source:** `server/routes/env.js` lines 85-119
**Apply to:** provisioning execution block in `gsd.js`

Pattern: write to `/tmp/env-{timestamp}.tmp` with mode `0o600`, then `renameSync` → target. On EXDEV, fall back to `copyFileSync` + `unlinkSync`. Never write directly to ENV_FILE_PATH in a non-atomic way.

### Test: Global Fetch Mock
**Source:** `server/__tests__/provisioning.test.js` lines 7-30
**Apply to:** new describe blocks in provisioning.test.js for sentryProvisioner and umamiProvisioner

```javascript
let mockFetch;
const originalFetch = global.fetch;
// In beforeEach:
global.fetch = async (url, opts) => {
  if (mockFetch) return mockFetch(url, opts);
  throw new Error('fetch not mocked');
};
// In afterEach:
global.fetch = originalFetch;
```

### Test: Module Cache Clear
**Source:** `server/__tests__/provisioning.test.js` lines 37-38
**Apply to:** all new provisioner test blocks

```javascript
delete require.cache[require.resolve('../gsd/provisioning/sentryProvisioner')];
const { createProject } = require('../gsd/provisioning/sentryProvisioner');
```

## No Analog Found

No files in this phase lack a codebase analog. All patterns are directly derivable from existing files.

## Metadata

**Analog search scope:** `server/gsd/provisioning/`, `server/__tests__/`, `server/routes/`
**Files read:** betterStackProvisioner.js, r2Provisioner.js, validateGates.js, provisioning.test.js, stage-transitions.test.js, gsd.js (lines 490-590), env.js
**Pattern extraction date:** 2026-06-02
