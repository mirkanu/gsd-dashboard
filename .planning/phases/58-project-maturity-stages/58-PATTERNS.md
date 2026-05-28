# Phase 58: Project Maturity Stages - Pattern Map

**Mapped:** 2026-05-28
**Files analyzed:** 14 new/modified files
**Analogs found:** 13 / 14

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/routes/gsd.js` (PATCH /api/projects/:name/stage) | route | request-response | `server/routes/gsd.js` existing PATCH handlers | exact |
| `server/routes/projects.js` (stage default at tmux_start) | route | CRUD | `server/routes/projects.js` lines 307-324 | exact |
| `server/gsd/provisioning/betterStackProvisioner.js` | service | request-response | `server/gsd/costMeasurement.js` (HTTP API pattern) | role-match |
| `server/gsd/provisioning/r2Provisioner.js` | service | request-response | `server/gsd/costMeasurement.js` (HTTP API pattern) | role-match |
| `server/gsd/provisioning/stageGates/validateGates.js` | utility | transform | `server/gsd/proxyStateBroadcaster.js` (state machine) | partial-match |
| `server/gsd/provisioning/stageGates/eligibilityChecker.js` | utility | batch | `server/gsd/feedStore.js` | partial-match |
| `server/gsd/feedStore.js` (extend for stage nudge events) | service | event-driven | `server/gsd/feedStore.js` itself | exact |
| `server/gsd/proxyStateBroadcaster.js` (stage_change broadcast) | service | event-driven | `server/gsd/proxyStateBroadcaster.js` itself | exact |
| `client/src/components/StageTransitionModal.tsx` | component | request-response | `client/src/components/ProjectDetailsPanel.tsx` | role-match |
| `client/src/components/StageBackfillChip.tsx` | component | request-response | `client/src/components/ChatListFilters.tsx` | partial-match |
| `client/src/components/ChatListFilters.tsx` (Group by toggle) | component | event-driven | `client/src/components/ChatListFilters.tsx` itself | exact |
| `client/src/components/ProjectControls.tsx` (kill/archive) | component | request-response | `client/src/components/ProjectControls.tsx` itself | exact |
| `client/src/lib/types.ts` (ProjectStage type + FeedEntry extend) | utility | transform | `client/src/lib/types.ts` itself | exact |
| `client/src/lib/api.ts` (stageTransition client) | utility | request-response | `client/src/lib/api.ts` existing methods | exact |

---

## Pattern Assignments

### `server/routes/gsd.js` — PATCH /api/projects/:name/stage (route, request-response)

**Analog:** `server/routes/gsd.js` existing route handlers + `server/routes/projects.js`

**Imports pattern** (`server/routes/gsd.js` lines 1-16):
```javascript
const express = require("express");
const path = require("path");
const fs = require("fs");
const { gracefulShutdown } = require('../gsd/gracefulShutdown');
const { broadcast } = require('../websocket');
const { db } = require('../db');
// Add for Phase 58:
const { pushEvent } = require('../gsd/feedStore');
const { validateGates } = require('../gsd/provisioning/stageGates/validateGates');
const { provisionMonitor } = require('../gsd/provisioning/betterStackProvisioner');
const { createBucket } = require('../gsd/provisioning/r2Provisioner');
```

**loadConfig / saveConfig pattern** (`server/routes/gsd.js` lines 37-46):
```javascript
function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../../gsd-projects.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function saveConfig(config) {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}
```

**Input validation + 404 pattern** (from `server/routes/projects.js` lines 453-509):
```javascript
router.patch('/projects/:name/stage', async (req, res) => {
  const { name } = req.params;
  const { to: targetStage } = req.body || {};

  const VALID_STAGES = ['draft', 'alpha', 'beta', 'launched', 'maintenance', 'retired'];
  if (!targetStage || !VALID_STAGES.includes(targetStage)) {
    return res.status(400).json({ error: `Invalid stage "${targetStage}". Must be one of: ${VALID_STAGES.join(', ')}.` });
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read project config', detail: err.message });
  }

  const projectIndex = (config.projects || []).findIndex(p => p.name === name);
  if (projectIndex === -1) {
    return res.status(404).json({ error: `Project "${name}" not found.` });
  }
  // ... validation, provisioning, saveConfig, broadcast
});
```

**Broadcast pattern after state change** (from `server/gsd/proxyStateBroadcaster.js` lines 68-74):
```javascript
broadcast('project_stage_change', {
  project: projectName,
  from: currentStage,
  to: targetStage,
  timestamp: new Date().toISOString(),
});
```

**Error response pattern** (from `server/routes/projects.js` lines 96-105):
```javascript
// Return first line only — no stack traces to client
return res.status(500).json({
  error: 'Stage transition failed',
  detail: err.message.split('\n')[0],
});
```

---

### `server/routes/projects.js` — stage default at project registration (route, CRUD)

**Analog:** `server/routes/projects.js` lines 307-324 (`tmux_start` step)

**Pattern — add `stage: 'draft'` to the config entry** (lines 311-321):
```javascript
// In tmux_start step, extend the config.projects.push() entry:
config.projects.push({
  name: sanitizedName,
  root: projectRoot,
  tmux_session: sanitizedName,
  services: DEFAULT_SERVICES,
  stage: 'draft',              // Phase 58: default stage
  stageUpdatedAt: new Date().toISOString(),
});
```

**Pattern — startup backfill on loadConfig** (after `loadConfig()` in `server/routes/gsd.js` lines 37-41):
```javascript
// Backfill projects missing stage on every config load (one-time safe op)
function loadConfigWithBackfill() {
  const config = loadConfig();
  let dirty = false;
  for (const p of (config.projects || [])) {
    if (!p.stage) {
      p.stage = 'draft';
      dirty = true;
    }
  }
  if (dirty) saveConfig(config);
  return config;
}
```

---

### `server/gsd/provisioning/betterStackProvisioner.js` (service, request-response)

**Analog:** `server/gsd/costMeasurement.js` — HTTP API calling pattern with env credentials

**Credential loading pattern** (`server/gsd/costMeasurement.js` lines 111-119):
```javascript
// Deferred require avoids circular deps at module load
function getCredential(envKey) {
  const val = process.env[envKey];
  if (!val) throw new Error(`${envKey} not configured`);
  return val;
}
```

**HTTP fetch with timeout pattern** (from RESEARCH.md verified against `costMeasurement.js` style):
```javascript
'use strict';

async function provisionMonitor(projectName, productionUrl) {
  const apiKey = process.env.BETTERSTACK_API_KEY;
  if (!apiKey) throw new Error('BETTERSTACK_API_KEY not configured');

  const response = await fetch('https://uptime.betterstack.com/api/v2/monitors', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      monitor_name: `gsd-${projectName}`,
      url: productionUrl,
      monitor_type: 'status',
      check_frequency: 300,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`BetterStack provision failed: ${err.errors?.[0]?.title || response.statusText}`);
  }

  const { data } = await response.json();
  return { monitorId: data.id };
}

module.exports = { provisionMonitor, checkMonitor, deleteMonitor };
```

**Error handling style** (from `server/gsd/costMeasurement.js` lines 61-99 — silent catch, return 0):
```javascript
// For check functions: swallow errors, return boolean
async function checkMonitor(projectName) {
  try {
    const apiKey = process.env.BETTERSTACK_API_KEY;
    if (!apiKey) return false;
    // ... fetch ...
    return response.ok && data?.data?.length > 0;
  } catch {
    return false;
  }
}
```

---

### `server/gsd/provisioning/r2Provisioner.js` (service, request-response)

**Analog:** `server/gsd/costMeasurement.js` — same HTTP+credentials pattern as BetterStack provisioner

**Naming convention (from RESEARCH.md open question resolution):**
```javascript
// Bucket name: lowercase, hyphens only, namespaced to avoid collisions
const bucketName = `gsd-${projectName}`.replace(/[^a-z0-9-]/g, '-').toLowerCase();
```

**Module export pattern** (matching `server/gsd/costMeasurement.js` lines 223-236):
```javascript
module.exports = { createBucket, checkBucket, deleteBucket };
```

---

### `server/gsd/provisioning/stageGates/validateGates.js` (utility, transform)

**Analog:** `server/gsd/proxyStateBroadcaster.js` — state comparison logic + `server/routes/projects.js` input validation

**State machine pattern** (from `server/gsd/proxyStateBroadcaster.js` lines 36-78 — diff current vs target):
```javascript
'use strict';

// All allowed transitions (bidirectional). Any->Retired handled separately.
const ALLOWED_TRANSITIONS = new Set([
  'draft->alpha', 'alpha->draft',
  'alpha->beta', 'beta->alpha',
  'beta->launched', 'launched->beta',
  'launched->maintenance', 'maintenance->launched',
  'draft->retired', 'alpha->retired', 'beta->retired',
  'launched->retired', 'maintenance->retired',
  'retired->draft',
]);

function canTransition(from, to) {
  return ALLOWED_TRANSITIONS.has(`${from}->${to}`);
}
```

**Validation-then-return-structured-result pattern** (from `server/routes/projects.js` lines 453-509):
```javascript
async function validateGates(project, targetStage) {
  const from = project.stage || 'draft';
  if (!canTransition(from, targetStage)) {
    return { valid: false, blocked: true, reason: `Cannot transition from ${from} to ${targetStage}` };
  }
  // check hard gates, collect failures
  // return { valid: Boolean, hardGates: [], softGates: [], requiresProvisioning: [] }
}

module.exports = { validateGates, canTransition, ALLOWED_TRANSITIONS };
```

---

### `server/gsd/provisioning/stageGates/eligibilityChecker.js` (utility, batch)

**Analog:** `server/gsd/feedStore.js` + `server/gsd/costMeasurement.js` (batch/aggregate pattern)

**Pattern — check criteria and push event** (from `server/gsd/feedStore.js` lines 14-17):
```javascript
'use strict';

const { pushEvent } = require('../../feedStore');
const { execFileSync } = require('child_process');

function meetsNudgeCriteria(project, { daysThreshold = 14, commitsThreshold = 12 } = {}) {
  const stageUpdatedAt = project.stageUpdatedAt ? new Date(project.stageUpdatedAt) : null;
  if (!stageUpdatedAt) return false;
  const daysSince = (Date.now() - stageUpdatedAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < daysThreshold) return false;

  try {
    const out = execFileSync('git', ['-C', project.root, 'rev-list', '--count', 'HEAD'], {
      encoding: 'utf8', timeout: 5000,
    });
    const commitCount = parseInt(out.trim(), 10);
    return commitCount >= commitsThreshold;
  } catch {
    return false;
  }
}

module.exports = { meetsNudgeCriteria };
```

---

### `server/gsd/feedStore.js` (extend for stage nudge events)

**Analog:** `server/gsd/feedStore.js` itself — pushEvent is already generic

**Existing pushEvent signature** (`server/gsd/feedStore.js` lines 14-17):
```javascript
function pushEvent(entry) {
  events.unshift({ ...entry, id: crypto.randomUUID() });
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
}
```

**New event types to add to `FeedEntry` union in `client/src/lib/types.ts` line 250:**
- `'stage_change'` — fired on every successful stage transition
- `'stage_nudge'` — fired when eligibility criteria are met

No functional change to feedStore.js — the pushEvent API already handles arbitrary `type` values. Only the TypeScript union in `types.ts` needs extending.

---

### `client/src/components/StageTransitionModal.tsx` (component, request-response)

**Analog:** `client/src/components/ProjectDetailsPanel.tsx` — async API fetch on mount, loading/error states

**useEffect + fetch-on-open pattern** (`client/src/components/ProjectDetailsPanel.tsx` lines 49-67):
```typescript
useEffect(() => {
  if (activeTab === "tasks") return;
  let cancelled = false;
  setContent(null);
  setFetchError(null);
  setLoading(true);
  api.gsd.file(project.name, activeTab)
    .then((text) => { if (!cancelled) { setContent(text); setLoading(false); } })
    .catch((err) => {
      if (!cancelled) {
        // error handling
      }
    });
  return () => { cancelled = true; };
}, [project.name, activeTab]);
```

**Imports pattern** (`client/src/components/ProjectDetailsPanel.tsx` lines 1-11):
```typescript
import { useEffect, useState } from "react";
import { api, HttpError } from "../lib/api";
import type { GsdProject } from "../lib/types";
```

**Loading / error / content state pattern** (same file lines 42-48):
```typescript
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
```

**Stage-aware styling pattern** (from `client/src/components/ProjectDetailsPanel.tsx` lines 23-28):
```typescript
const SESSION_STATE_STYLE: Record<string, string> = {
  working: "bg-emerald-500/20 text-emerald-400",
  waiting: "bg-blue-500/20 text-blue-400",
  // ...
};
// Apply same approach for stages:
const STAGE_STYLE: Record<string, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  alpha: "bg-yellow-500/20 text-yellow-400",
  beta: "bg-blue-500/20 text-blue-400",
  launched: "bg-emerald-500/20 text-emerald-400",
  maintenance: "bg-orange-500/20 text-orange-400",
  retired: "bg-gray-600/20 text-gray-500",
};
```

---

### `client/src/components/StageBackfillChip.tsx` (component, request-response)

**Analog:** `client/src/components/ChatListFilters.tsx` — small pill/chip with count, click handler

**Pill button pattern** (`client/src/components/ChatListFilters.tsx` lines 31-48):
```typescript
<button
  onClick={() => onFilterChange(state)}
  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 flex-shrink-0 ${
    isActive
      ? "bg-accent/20 text-accent"
      : "bg-surface-3 text-gray-400 hover:text-gray-200"
  }`}
>
  {label}
  <span className={`text-[10px] px-1.5 rounded-full ${
    isActive ? "bg-accent/30 text-accent" : "bg-surface-2 text-gray-500"
  }`}>
    {count}
  </span>
</button>
```

**Backfill chip renders only when `project.stage` is falsy:**
```typescript
// In ProjectCard or wherever the chip is placed:
{!project.stage && (
  <StageBackfillChip projectName={project.name} onAssigned={onStageAssigned} />
)}
```

---

### `client/src/components/ChatListFilters.tsx` — Group by toggle (component, event-driven)

**Analog:** `client/src/components/ChatListFilters.tsx` itself — extend existing FILTERS array + props

**Current component signature** (`client/src/components/ChatListFilters.tsx` lines 1-16):
```typescript
import type { GsdProject, SessionState } from "../lib/types";

interface ChatListFiltersProps {
  projects: GsdProject[];
  activeFilter: SessionState | null;
  onFilterChange: (state: SessionState | null) => void;
}

const FILTERS: { label: string; state: SessionState | null }[] = [
  { label: "All", state: null },
  { label: "Waiting", state: "waiting" },
  // ...
];
```

**Extension pattern — add groupBy prop without breaking existing callers:**
```typescript
// Add to interface:
groupBy?: 'state' | 'stage';
onGroupByChange?: (mode: 'state' | 'stage') => void;
```

**Count function pattern** (lines 18-23) to reuse for stage counts:
```typescript
const getCount = (state: SessionState | null): number => {
  if (state === null) {
    return projects.filter((p) => p.sessionState !== "archived").length;
  }
  return projects.filter((p) => p.sessionState === state).length;
};
// Stage analog:
const getStageCount = (stage: ProjectStage): number =>
  projects.filter((p) => (p.stage ?? 'draft') === stage).length;
```

---

### `client/src/components/ProjectControls.tsx` — kill/archive button (component, request-response)

**Analog:** `client/src/components/ProjectControls.tsx` itself — conditional button rendering by sessionState

**Existing conditional pattern** (`client/src/components/ProjectControls.tsx` lines 68-93):
```typescript
{project.sessionState !== "archived" ? (
  <>
    {project.sessionState !== "paused" && (
      <button onClick={(e) => { e.stopPropagation(); onPauseSession(); }}
        className="text-[10px] text-red-600 hover:text-red-400 transition-colors">
        Pause
      </button>
    )}
    <button onClick={(e) => { e.stopPropagation(); onArchive(); }}
      className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">
      Archive
    </button>
  </>
) : (
  <button onClick={(e) => { e.stopPropagation(); onUnarchive(); }}>
    Unarchive
  </button>
)}
```

**Kill/archive button — add after archive button, only for Draft stage:**
```typescript
{/* Kill/archive — Draft projects only */}
{(project.stage ?? 'draft') === 'draft' && (
  <button
    onClick={(e) => { e.stopPropagation(); onKillDraft?.(); }}
    className="text-[10px] text-red-700 hover:text-red-500 transition-colors"
  >
    Kill / Archive
  </button>
)}
```

---

### `client/src/lib/types.ts` — ProjectStage type + FeedEntry extend (utility, transform)

**Analog:** `client/src/lib/types.ts` itself — pattern follows `SessionState` union type at line 74

**SessionState pattern to copy** (`client/src/lib/types.ts` line 74):
```typescript
export type SessionState = "working" | "waiting" | "paused" | "archived";
// Add:
export type ProjectStage = "draft" | "alpha" | "beta" | "launched" | "maintenance" | "retired";
```

**Extend GsdProject interface** (add after `currentTask` field at line 131):
```typescript
/** Phase 58: project maturity stage. Undefined on older projects (backfill pending). */
stage?: ProjectStage;
/** ISO timestamp of last stage transition. */
stageUpdatedAt?: string | null;
```

**Extend FeedEntry type union** (`client/src/lib/types.ts` lines 250-256):
```typescript
export interface FeedEntry {
  id: string;
  type: 'plan_complete' | 'verify_passed' | 'verify_failed' | 'waiting_input'
      | 'phase_complete' | 'stage_change' | 'stage_nudge'; // Phase 58 additions
  projectName: string;
  projectDisplayName: string;
  label: string;
  detectedAt: string;
}
```

**Extend WSMessage type union** (lines 436-448) — add `'project_stage_change'` to the `type` field.

---

### `client/src/lib/api.ts` — stageTransition client (utility, request-response)

**Analog:** `client/src/lib/api.ts` existing `gsd` methods

**request() helper pattern** (`client/src/lib/api.ts` lines 26-36):
```typescript
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}
```

**Method to add inside `api.gsd` object:**
```typescript
stageTransition: (projectName: string, targetStage: ProjectStage) =>
  request<{ success: boolean; stage: ProjectStage; project: GsdProject }>(
    `/gsd/projects/${encodeURIComponent(projectName)}/stage`,
    { method: 'PATCH', body: JSON.stringify({ to: targetStage }) }
  ),
validateStageTransition: (projectName: string, targetStage: ProjectStage) =>
  request<{ valid: boolean; hardGates: GateResult[]; softGates: GateResult[]; requiresProvisioning: string[] }>(
    `/gsd/projects/${encodeURIComponent(projectName)}/stage/validate`,
    { method: 'POST', body: JSON.stringify({ to: targetStage }) }
  ),
```

---

### `server/__tests__/stage-transitions.test.js` (test, CRUD)

**Analog:** `server/__tests__/config.test.js` — Node.js test framework, isolated temp DB, fetchJson helper

**Test infrastructure pattern** (`server/__tests__/config.test.js` lines 1-65):
```javascript
const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

const TEST_DB = path.join(os.tmpdir(), `stage-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;
// Also set isolated projects JSON:
const TEST_PROJECTS_JSON = path.join(os.tmpdir(), `gsd-projects-${Date.now()}.json`);
process.env.GSD_PROJECTS_PATH = TEST_PROJECTS_JSON;

// fetchJson helper (lines 18-45 of config.test.js) — copy verbatim
```

**beforeEach isolation pattern** (lines 67-70):
```javascript
beforeEach(() => {
  // Reset projects JSON to a known baseline for each test
  fs.writeFileSync(TEST_PROJECTS_JSON, JSON.stringify({ projects: [] }, null, 2));
});
```

---

## Shared Patterns

### Config File Read/Write
**Source:** `server/routes/gsd.js` lines 37-46 and `server/routes/projects.js` lines 64-73
**Apply to:** `PATCH /api/projects/:name/stage` endpoint, backfill logic
```javascript
function loadConfig() {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../../gsd-projects.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function saveConfig(config) {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, '../../gsd-projects.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}
```

### WebSocket Broadcast
**Source:** `server/gsd/proxyStateBroadcaster.js` lines 68-74 and `server/routes/projects.js` lines 197-204
**Apply to:** stage transition endpoint, stage change events
```javascript
const { broadcast } = require('../websocket');
broadcast('project_stage_change', {
  project: projectName,
  from: currentStage,
  to: targetStage,
  timestamp: new Date().toISOString(),
});
```

### Portfolio Feed Event Push
**Source:** `server/gsd/feedStore.js` lines 14-17
**Apply to:** stage transition endpoint (on success), eligibility checker (on nudge)
```javascript
const { pushEvent } = require('../gsd/feedStore');
pushEvent({
  type: 'stage_change',
  projectName,
  projectDisplayName: project.display_name || projectName,
  label: `Advanced from ${currentStage} to ${targetStage}`,
  detectedAt: new Date().toISOString(),
});
```

### HTTP API Call with Credentials + Timeout
**Source:** `server/gsd/costMeasurement.js` lines 61-99 (pattern; `server/gsd/proxyStateBroadcaster.js` lines 93-98 for AbortSignal.timeout)
**Apply to:** `betterStackProvisioner.js`, `r2Provisioner.js`
```javascript
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${process.env.API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(10000),
});
if (!response.ok) {
  const err = await response.json().catch(() => ({}));
  throw new Error(`API call failed: ${err.errors?.[0]?.title || response.statusText}`);
}
```

### Graceful tmux Shutdown
**Source:** `server/gsd/gracefulShutdown.js` lines 40-50
**Apply to:** Retired stage transition (auto-pause tmux)
```javascript
const { gracefulShutdown } = require('../gsd/gracefulShutdown');
// Already imported in gsd.js line 4 — use it directly:
await gracefulShutdown(project.tmux_session, projectName);
```

### Plain-English Error Responses
**Source:** `server/routes/projects.js` lines 90-105
**Apply to:** stage transition endpoint, provisioning helpers
```javascript
// Return first line only — no stack traces
return res.status(500).json({
  error: 'Stage transition failed',
  detail: err.message.split('\n')[0],
});
```

### Conditional Rendering by State
**Source:** `client/src/components/ProjectControls.tsx` lines 68-93
**Apply to:** `StageTransitionModal`, kill/archive button, stage badge
```typescript
// Guard pattern — show UI element only for specific stage:
{(project.stage ?? 'draft') === 'draft' && <KillButton />}
{project.stage === 'launched' && <UrlList />}
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | All files have a close codebase match |

---

## Metadata

**Analog search scope:** `server/routes/`, `server/gsd/`, `client/src/components/`, `client/src/lib/`, `server/__tests__/`
**Files scanned:** 11 existing files read in full
**Pattern extraction date:** 2026-05-28
