# Phase 58: Project Maturity Stages - Research

**Researched:** 2026-05-28
**Domain:** Project lifecycle management, stage-driven UI/UX, external service integration
**Confidence:** HIGH

## Summary

Phase 58 adds a 6-stage maturity model (`draft` → `alpha` → `beta` → `launched` → `maintenance` → `retired`) to every project, stored in `gsd-projects.json` with a default of `"draft"` at creation. The stage field drives card UI defaults (task surface, preview/production URLs, action buttons), a reversible stage-transition wizard with prerequisite gates, auto-provisioning of BetterStack monitoring and R2 backup at the Beta→Launched boundary, a stage-grouping view on the Dashboard, backfill nudges for existing projects, and a two-tier kill/archive flow for Draft projects.

The implementation spans frontend (React component for stage transition modal, grouped project list view in ChatListFilters, stage badges and conditional button rendering), backend (new `/api/projects/:name/stage` PATCH endpoint, BetterStack/R2 provisioning helpers, stage eligibility checks), and JSON storage (single-field addition to `gsd-projects.json`). The transition wizard orchestrates multiple prerequisite gates, calling external APIs (BetterStack, Cloudflare/R2) as needed.

**Primary recommendation:** Storage is JSON-native (no SQLite schema change needed). Transitions are primarily a backend orchestration problem — the planner should focus on the wizard state machine, external API integration helpers, and gradual UI surface area (grouping view first, card variations as stretch). Tests should cover gate validation logic and state machine reversibility.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stage Storage (MAT-01):**
- `stage` field lives in `gsd-projects.json` alongside `name`/`root`. Single source of truth; works even when `.planning/` does not exist. Defaults to `"draft"` at project creation.

**Stage Transition Gates (MAT-03, MAT-04):**
- All transitions are reversible in both directions. Beta ↔ Launched is the only transition with data migration (Dashboard tasks → GitHub Issues).
- Gate matrix (D-03):
  | Transition | Hard gates |
  |-----------|-----------|
  | Draft → Alpha | Project name set |
  | Alpha → Beta | (soft) Preview/deploy URL set — wizard warns but doesn't block |
  | Beta → Launched | Production URL set, BetterStack monitor ✓, R2 backup ✓, GitHub Issues enabled |
  | Launched → Maintenance | None — confirmation only |
  | Any → Retired | Confirmation dialog with teardown checklist |
- Alpha→Beta is soft (no blocking) because some projects (CLI tools, libraries) have no web URL.
- No platform assumptions for deploy/preview URLs (free-form fields).

**BetterStack + R2 Auto-Provisioning (MAT-03, MAT-05):**
- When Beta→Launched transition wizard finds BetterStack monitor or R2 bucket missing, it auto-provisions them using global env keys (`BETTERSTACK_API_KEY`, `CLOUDFLARE_API_KEY`/`CLOUDFLARE_EMAIL`).
- These are hard gates at Beta→Launched only — not earlier stages.

**Card UI Per Stage (MAT-02):**
- Stage sets the default for which task surface appears (Dashboard tasks for Draft/Alpha/Beta; GitHub Issues for Launched/Maintenance).
- Project's Config tab allows per-project override.
- Card variations by stage: Draft shows kill/archive button; Launched shows Dev + Prod URLs and Promote button; Maintenance shows lower visual weight with only bug/critical items surfaced.

**Stage Grouping View on Dashboard (MAT-02):**
- Dashboard left panel gets a "Group by" toggle: **State** (existing: Waiting/Working/Paused tabs) vs **Stage** (Draft/Alpha/Beta/Launched/Maintenance/Retired).
- In Stage mode: same project cards, grouped under section headers (e.g., "🟢 Beta (3)", "🚀 Launched (2)"). No new card layout in this phase.
- `/kanban` route stays dormant (redirect to `/` unchanged).

**Backfill Flow (MAT-06):**
- Existing projects with no stage show an inline "Assign stage" chip on their card. No banner, no blocking startup flow.

**Kill / Archive Flow (MAT-08):**
- Two-tier flow for Draft projects:
  - **Archive:** Stops tmux, hides from active Dashboard view, keeps files + GitHub repo. Reversible.
  - **Full delete:** Requires typing `DELETE` to confirm. Destroys GitHub repo, `/data/home/[name]`, tmux session, and Dashboard entry. Irreversible.
- Kill/archive button only appears on Draft-stage projects.

**Retired Stage Behavior (MAT-05):**
- Retiring a project: auto-pauses tmux, auto-archives GitHub repo via API, surfaces checklist of what was torn down.
- Retired projects do not auto-start tmux.

**Stage Nudges (MAT-07):**
- When eligibility criteria are met (e.g., Beta for 14 days with ≥12 commits), nudge fires as both Portfolio Feed event and card badge.
- User always decides — nudge is a suggestion, never automatic.

### Claude's Discretion

- Exact BetterStack API call shape for monitor creation (check existing `costMeasurement.js` for API patterns)
- R2 bucket naming convention per project
- Specific eligibility criteria formula for stage nudges
- Section header styling and emoji for stage groups
- Config tab UI for task-surface override toggle

### Deferred Ideas (OUT OF SCOPE)

- Drag-to-promote on Kanban view (Phase 61)
- Railway cleanup — remove Railway status entries from `gsd-projects.json` (separate quick task)
- Auto-promotion on merged PRs + green CI (MAT-07 nudge only; Phase 61 scope)
- Stage-aware card layouts with different designs per stage (Phase 58 stretch goal)

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MAT-01 | Every project has a `stage` field in storage, defaulting to `"draft"` at creation | `gsd-projects.json` field addition + `server/routes/projects.js` default at registration |
| MAT-02 | Dashboard card UI varies by stage (preview URL prominence, Issues vs. Tasks, Promote button) | React conditional rendering in ProjectCard, stage-aware task surface toggle in config |
| MAT-03 | Stage-transition wizard guides user through prerequisites and executes transitions | Backend state machine in `/api/projects/:name/stage` PATCH endpoint, frontend modal component |
| MAT-04 | Stage transitions are reversible in both directions; Beta ↔ Launched has data migration | State machine allows all-direction reversals; Task ↔ Issue migration logic in plan scope |
| MAT-05 | Retired projects auto-pause tmux, auto-archive GitHub repo | Integration with `gracefulShutdown` and GitHub API (gh CLI or Octokit) |
| MAT-06 | Existing projects get one-time backfill "Assign stage" chip | Inline UI chip rendered when `project.stage` is undefined; triggers modal on click |
| MAT-07 | Nudge-gated suggestions when eligibility criteria met | Portfolio Feed event in `feedStore.js`, eligibility check logic (14 days + 12 commits), card badge |
| MAT-08 | Draft-stage two-tier kill/archive flow with confirmation | Archive: stop tmux + hide; Delete: requires `DELETE` typed + destroy repo/files/entry |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Stage storage and transitions | Backend (API) + JSON | Frontend (React modal) | State machine lives server-side; transitions orchestrate external APIs |
| Stage grouping view | Frontend (React) | Backend (already provides projects) | UI concern; backend already exposes stage field |
| Card UI variations | Frontend (React) | Backend (config endpoint) | Conditional rendering per stage; config API provides override toggle |
| BetterStack monitor provisioning | Backend (Node.js + HTTP) | — | External API call; no browser capability needed |
| R2 bucket provisioning | Backend (Node.js + Cloudflare SDK/HTTP) | — | Cloudflare API; sensitive credentials not exposed to frontend |
| Backfill nudge (Assign stage chip) | Frontend (React) | Backend (identifies missing stage) | UI chip rendered; backend identifies eligible projects |
| Kill/archive flow | Backend (tmux + GitHub) + Frontend (React modal) | — | Frontend captures confirmation/inputs; backend executes destructive ops |
| Stage nudges (eligibility check) | Backend (cron or event-driven) | Frontend (Portfolio Feed display) | Backend calculates eligibility (commits, time); frontend surfaces as feed + badge |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gsd-projects.json | — | Project registry with stage field | Single source of truth; survives without `.planning/`; already in use |
| Express.js | ^4.21.2 (existing) | Backend for `/api/projects/:name/stage` endpoint | Already core infrastructure; proven pattern in projects.js route |
| React + Vite | (existing) | Stage transition modal, grouped project list | Existing UI framework; conditional rendering matches project patterns |
| better-sqlite3 | ^11.7.0 (existing) | Optional: stage field in DB if needed later | Already available; not strictly required (JSON sufficient for v58) |
| Cloudflare API (R2 + Workers) | SDK or HTTP | R2 bucket creation + Tunnel config | Global credentials available; used in Phase 45 cost tracking |
| BetterStack API | HTTP (REST) | Uptime monitor provisioning | Global `BETTERSTACK_API_KEY` available; used in Phase 45 cost tracking pattern |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Octokit or gh CLI | (existing gh) | GitHub repo archival at Retired transition | `gh` already used in project creation; familiar to team |
| node-pty (via tmux) | ^1.1.0 (existing) | Session lifecycle (pause, stop) | Already used in stateBroadcaster and idleDetector |
| uuid | ^11.1.0 (existing) | Event IDs in Portfolio Feed | Existing pattern in feedStore.js |
| crypto (Node.js built-in) | — | Event ID hashing if needed | Lightweight; already used in feedStore.js |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| gsd-projects.json for stage storage | SQLite `project_stages` table | JSON is simpler for backfill (immutable source); DB adds schema migration burden for this phase. Defer to Phase 59 if Task Backend Migration refactors projects table. |
| Direct Cloudflare/BetterStack HTTP calls | Dedicated SDK packages | HTTP calls via fetch/axios lighter-weight; env credentials already loaded; existing pattern in costMeasurement.js. SDKs add dependencies for minimal gain. |
| gh CLI for GitHub archival | Octokit npm package | `gh` already in PATH on Hetzner; matches project creation pattern. Octokit requires GitHub PAT management (already done), but `gh` is simpler for one-off archival. |
| React modal for stage wizard | HTML <dialog> + form | React modal from existing component library (likely @chatscope or Radix) for consistency with Dashboard patterns. |

**Installation:**
```bash
# No new npm dependencies required — use existing stack
npm install  # Already includes all necessary packages
```

**Version verification:** All core packages are already present in `/home/services/gsddashboard/package.json`:
- Express.js: `^4.21.2` [VERIFIED: npm registry, May 2026]
- React: `^18.x` via Vite (client/) [VERIFIED: existing client/package.json]
- uuid: `^11.1.0` [VERIFIED: in package.json, used in feedStore.js]
- Cloudflare API: via global `CLOUDFLARE_API_KEY`/`CLOUDFLARE_EMAIL` in `/home/services/.env.production` [VERIFIED: CLAUDE.md, Section Shared credentials]
- BetterStack API: via global `BETTERSTACK_API_KEY` in `/home/services/.env.production` [VERIFIED: CLAUDE.md, Section Shared credentials]

---

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend (Browser)                    │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐ │
│  │  Dashboard List  │  │  Stage Transition Modal             │ │
│  │  ┌─────────────┐ │  │  ┌──────────────────────────────┐  │ │
│  │  │Stage Toggle │ │  │  │ 1. Gate Validation Display   │  │ │
│  │  │Group by:    │ │  │  │ 2. Prerequisite Checklist    │  │ │
│  │  │ State/Stage │ │  │  │ 3. Confirmation + Execute    │  │ │
│  │  └─────────────┘ │  │  │ 4. Status polling            │  │ │
│  │                  │  │  └──────────────────────────────┘  │ │
│  │  ┌─────────────┐ │  │  Backfill:                         │ │
│  │  │ProjectCard  │ │  │  ┌──────────────────────────────┐  │ │
│  │  │ ┌─────────┐ │ │  │  │"Assign stage" chip           │  │ │
│  │  │ │Stage    │ │ │  │  │(if stage undefined)          │  │ │
│  │  │ │ Badge   │ │ │  │  └──────────────────────────────┘  │ │
│  │  │ │Archived │ │ │  │                                     │ │
│  │  │ │URL list │ │ │  │  Kill/Archive:                     │ │
│  │  │ └─────────┘ │ │  │  ┌──────────────────────────────┐  │ │
│  │  │ Conditional │ │  │  │ Two-tier flow modal          │  │ │
│  │  │ buttons:    │ │  │  │ Archive / Full Delete        │  │ │
│  │  │ -Archive    │ │  │  └──────────────────────────────┘  │ │
│  │  │ -Promote    │ │  │                                     │ │
│  │  └─────────────┘ │  │  Portfolio Feed:                   │ │
│  └──────────────────┘  │  ┌──────────────────────────────┐  │ │
│                        │  │Stage nudge events            │  │ │
│                        │  │"Ready to advance" badges     │  │ │
│                        │  └──────────────────────────────┘  │ │
│                        └─────────────────────────────────────┘ │
└──────────┬──────────────────────────┬──────────────────────────┘
           │                          │
           │ WebSocket (real-time)    │ HTTP (one-shot)
           │                          │
           ▼                          ▼
┌──────────────────────────────────────────────────────────────────┐
│              Express Backend (Node.js on Hetzner VPS)            │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │  /api/projects/:name/stage (PATCH)                           ││
│  │  ┌────────────────────────────────────────────────────────┐ ││
│  │  │ 1. Parse target stage from body                        │ ││
│  │  │ 2. Load gsd-projects.json                              │ ││
│  │  │ 3. Find project by name                                │ ││
│  │  │ 4. Validate current stage → target stage is allowed    │ ││
│  │  │ 5. Check gate prerequisites:                           │ ││
│  │  │    - Draft→Alpha: name set (always true)              │ ││
│  │  │    - Alpha→Beta: warn if no preview URL (soft)         │ ││
│  │  │    - Beta→Launched: check prod URL, provisions:        │ ││
│  │  │      a. Call BetterStack API → create monitor          │ ││
│  │  │      b. Call Cloudflare R2 API → create bucket         │ ││
│  │  │      c. Check GitHub Issues enabled (soft)             │ ││
│  │  │    - Launched→Maintenance: confirm only                │ ││
│  │  │    - Any→Retired: confirm, then exec teardown          │ ││
│  │  │ 6. For Beta↔Launched: trigger task migration logic     │ ││
│  │  │ 7. Write updated stage to gsd-projects.json            │ ││
│  │  │ 8. Broadcast via stateBroadcaster                      │ ││
│  │  │ 9. Return 200 + updated project state                  │ ││
│  │  └────────────────────────────────────────────────────────┘ ││
│  │                                                              ││
│  │  Helper Modules:                                           ││
│  │  ┌────────────────────────────────────────────────────────┐ ││
│  │  │ provisioning/                                          │ ││
│  │  │ ├─ betterStackProvisioner.js                          │ ││
│  │  │ │  - provisionMonitor(projectName, url)               │ ││
│  │  │ │  - deleteMonitor(monitorId)                         │ ││
│  │  │ └─ r2Provisioner.js                                   │ ││
│  │  │    - createBucket(projectName)                        │ ││
│  │  │    - deleteBucket(bucketName)                         │ ││
│  │  │                                                        │ ││
│  │  │ stageGates/                                            │ ││
│  │  │ ├─ validateGates.js                                   │ ││
│  │  │ │  - canTransition(currentStage, targetStage)         │ ││
│  │  │ │  - getGatesToCheck(fromStage, toStage)              │ ││
│  │  │ │  - checkPrerequisites(project, gates)               │ ││
│  │  │ └─ eligibilityChecker.js (for nudges)                 │ ││
│  │  │    - meetsNudgeCriteria(project, commits, days)       │ ││
│  │  │    - trackEligibilityChange()                         │ ││
│  │  └────────────────────────────────────────────────────────┘ ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Existing Integrations:                                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ gsd-projects.json                                          │ │
│  │ ├─ projects[].name                                        │ │
│  │ ├─ projects[].root                                        │ │
│  │ ├─ projects[].stage  ← NEW (defaults to "draft")          │ │
│  │ └─ projects[].archived                                    │ │
│  │                                                            │ │
│  │ feedStore.js (Portfolio Feed)                            │ │
│  │ ├─ pushEvent({type, projectName, label, detectedAt})     │ │
│  │ └─ getEvents() → array of 200 latest                     │ │
│  │                                                            │ │
│  │ stateBroadcaster.js (WebSocket)                          │ │
│  │ ├─ broadcast('project_state_change', {...})              │ │
│  │ └─ broadcast('project_stage_change', {...})  ← NEW        │ │
│  │                                                            │ │
│  │ gracefulShutdown.js                                      │ │
│  │ ├─ gracefulShutdown(sessionName)                          │ │
│  │ └─ Used for Retired→pause tmux                           │ │
│  │                                                            │ │
│  │ costMeasurement.js (API pattern ref)                     │ │
│  │ ├─ HTTP API calling pattern (for BetterStack model)       │ │
│  │ └─ Env var credential loading                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  External Services:                                             │
│  ├─ BetterStack API (BETTERSTACK_API_KEY)                     │
│  │  └─ POST /monitors → create uptime monitor                  │
│  ├─ Cloudflare R2 API (CLOUDFLARE_API_KEY/EMAIL)              │
│  │  └─ POST /r2/buckets → create backup bucket                │
│  └─ GitHub API (via gh CLI)                                   │
│     ├─ gh repo archive → Retired stage                        │
│     └─ gh issue list → Task backend override                 │
└──────────────────────────────────────────────────────────────────┘
```

**Data flow for a Beta→Launched transition:**
1. User clicks "Advance to Launched" on card → modal opens
2. Modal fetches `/api/projects/:name/stage` with `{ to: "launched" }`
3. Backend validates gates:
   - Production URL present? YES
   - BetterStack monitor exists? NO → provision via API
   - R2 bucket exists? NO → provision via API
   - GitHub Issues enabled? Check via gh CLI
4. If all gates pass, backend writes updated stage to gsd-projects.json
5. Backend broadcasts `project_stage_change` event → frontend receives live update
6. Card UI re-renders with new URLs, buttons, etc.
7. Portfolio Feed logs event: "🚀 [project] launched" + timestamp

### Recommended Project Structure

No new directories required; changes are localized within existing structure:

```
server/
├── routes/
│   ├── projects.js              (update project creation default stage: "draft")
│   └── gsd.js                   (add PATCH /api/projects/:name/stage endpoint)
├── gsd/
│   ├── feedStore.js             (extend for stage nudge events)
│   ├── stateBroadcaster.js      (add stage_change broadcast)
│   └── provisioning/             (NEW directory)
│       ├── betterStackProvisioner.js
│       ├── r2Provisioner.js
│       └── stageGates/
│           ├── validateGates.js
│           └── eligibilityChecker.js
client/
├── src/
│   ├── components/
│   │   ├── ChatListFilters.tsx   (add "Group by Stage" toggle)
│   │   ├── StageTransitionModal.tsx (NEW — wizard modal)
│   │   ├── ProjectCard.tsx       (add stage badge, conditional buttons)
│   │   └── StageBackfillChip.tsx (NEW — backfill "Assign stage")
│   └── lib/
│       ├── types.ts             (add ProjectStage type union)
│       └── api.ts               (add stageTransition() client)
gsd-projects.json                (no structural change; stage field added at runtime)
```

### Pattern 1: Stage Transition Gate Validation

**What:** Server-side state machine that validates prerequisites before allowing stage transitions. Each transition has a set of hard gates and soft gates (warnings).

**When to use:** Every transition request; prevents invalid state changes and orchestrates external API calls.

**Example:**
```javascript
// server/gsd/provisioning/stageGates/validateGates.js
// Source: CONTEXT.md D-03 gate matrix + costMeasurement.js HTTP pattern

const GATE_CHECKS = {
  'draft->alpha': {
    hard: ['projectNameSet'],
  },
  'alpha->beta': {
    soft: ['previewUrlSet'],  // Warns but doesn't block
  },
  'beta->launched': {
    hard: ['productionUrlSet', 'betterStackMonitor', 'r2Bucket', 'githubIssuesEnabled'],
  },
  'launched->maintenance': {
    hard: [],  // Confirmation only
  },
  'any->retired': {
    hard: [],  // Confirmation + teardown checklist
  },
};

async function validateGates(project, targetStage) {
  const transitionKey = `${project.stage}->${targetStage}`;
  const gates = GATE_CHECKS[transitionKey];
  
  if (!gates) {
    return { valid: false, reason: 'Transition not allowed' };
  }

  const hardResults = [];
  const softResults = [];

  for (const gate of gates.hard || []) {
    const result = await checkGate(project, gate);
    if (!result.pass) hardResults.push(result);
  }

  for (const gate of gates.soft || []) {
    const result = await checkGate(project, gate);
    if (!result.pass) softResults.push(result);
  }

  return {
    valid: hardResults.length === 0,
    hardGates: hardResults,
    softGates: softResults,
    requiresProvisioning: ['betterStackMonitor', 'r2Bucket'].filter(g => 
      gates.hard?.includes(g) && !hardResults.find(r => r.gate === g)
    ),
  };
}

async function checkGate(project, gateName) {
  switch (gateName) {
    case 'projectNameSet':
      return { gate: gateName, pass: !!project.name };
    case 'previewUrlSet':
      return { gate: gateName, pass: !!project.previewUrl, label: 'No preview URL set' };
    case 'productionUrlSet':
      return { gate: gateName, pass: !!project.productionUrl, label: 'Production URL required' };
    case 'betterStackMonitor':
      // Check if monitor already exists; if not, will be provisioned
      const monitorExists = await betterStackProvisioner.checkMonitor(project.name);
      return { gate: gateName, pass: monitorExists, label: 'Uptime monitor (will auto-create)' };
    case 'r2Bucket':
      const bucketExists = await r2Provisioner.checkBucket(project.name);
      return { gate: gateName, pass: bucketExists, label: 'Backup bucket (will auto-create)' };
    case 'githubIssuesEnabled':
      // Soft check via gh CLI
      const issuesEnabled = await checkGitHubIssues(project);
      return { gate: gateName, pass: issuesEnabled, label: 'GitHub Issues not enabled (optional)' };
    default:
      return { gate: gateName, pass: false };
  }
}

module.exports = { validateGates, GATE_CHECKS };
```

### Pattern 2: External API Provisioning (BetterStack + R2)

**What:** Stateless helper modules that call external APIs to create/delete monitors and buckets. Credentials loaded from env.

**When to use:** At Beta→Launched and when rolling back (Launched→Beta).

**Example:**
```javascript
// server/gsd/provisioning/betterStackProvisioner.js
// Source: costMeasurement.js HTTP pattern + CONTEXT.md D-06

const { getSecret } = require('../../crypto');

async function provisionMonitor(projectName, productionUrl) {
  const apiKey = process.env.BETTERSTACK_API_KEY;
  if (!apiKey) {
    throw new Error('BETTERSTACK_API_KEY not configured');
  }

  const response = await fetch('https://uptime.betterstack.com/api/v2/monitors', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      monitor_name: projectName,
      url: productionUrl,
      monitor_type: 'uptime',
      check_frequency: 300,  // 5 minutes
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`BetterStack provision failed: ${err.message}`);
  }

  const { monitor } = await response.json();
  return { monitorId: monitor.id, status_page_url: monitor.public_status_page_url };
}

async function checkMonitor(projectName) {
  const apiKey = process.env.BETTERSTACK_API_KEY;
  if (!apiKey) return false;

  try {
    const response = await fetch(
      `https://uptime.betterstack.com/api/v2/monitors?search=${encodeURIComponent(projectName)}`,
      { headers: { 'Authorization': `Bearer ${apiKey}` } }
    );
    const { monitors } = await response.json();
    return monitors?.length > 0;
  } catch {
    return false;
  }
}

async function deleteMonitor(monitorId) {
  const apiKey = process.env.BETTERSTACK_API_KEY;
  if (!apiKey) throw new Error('BETTERSTACK_API_KEY not configured');

  const response = await fetch(`https://uptime.betterstack.com/api/v2/monitors/${monitorId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    throw new Error(`BetterStack delete failed: ${response.statusText}`);
  }
}

module.exports = { provisionMonitor, checkMonitor, deleteMonitor };
```

```javascript
// server/gsd/provisioning/r2Provisioner.js
// Source: costMeasurement.js HTTP pattern + CONTEXT.md D-06

async function createBucket(projectName) {
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const email = process.env.CLOUDFLARE_EMAIL;
  if (!apiKey || !email) {
    throw new Error('CLOUDFLARE_API_KEY or CLOUDFLARE_EMAIL not configured');
  }

  const bucketName = `gsd-${projectName}`.replace(/[^a-z0-9-]/g, '-').toLowerCase();

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/{accountId}/r2/buckets`,
    {
      method: 'POST',
      headers: {
        'X-Auth-Key': apiKey,
        'X-Auth-Email': email,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: bucketName }),
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`R2 bucket creation failed: ${err.errors?.[0]?.message || err.message}`);
  }

  const { result } = await response.json();
  return { bucketName: result.name, createdAt: result.creation_date };
}

async function checkBucket(projectName) {
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const email = process.env.CLOUDFLARE_EMAIL;
  if (!apiKey || !email) return false;

  try {
    const bucketName = `gsd-${projectName}`.replace(/[^a-z0-9-]/g, '-').toLowerCase();
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/{accountId}/r2/buckets/${bucketName}`,
      {
        headers: {
          'X-Auth-Key': apiKey,
          'X-Auth-Email': email,
        },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function deleteBucket(bucketName) {
  const apiKey = process.env.CLOUDFLARE_API_KEY;
  const email = process.env.CLOUDFLARE_EMAIL;
  if (!apiKey || !email) throw new Error('Cloudflare credentials not configured');

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/{accountId}/r2/buckets/${bucketName}`,
    {
      method: 'DELETE',
      headers: {
        'X-Auth-Key': apiKey,
        'X-Auth-Email': email,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`R2 bucket delete failed: ${response.statusText}`);
  }
}

module.exports = { createBucket, checkBucket, deleteBucket };
```

### Pattern 3: Stage Transition Orchestration (PATCH /api/projects/:name/stage)

**What:** Main endpoint that orchestrates the entire transition flow — validation, provisioning, state update, broadcast.

**When to use:** Every POST/PATCH to change project stage.

**Example:**
```javascript
// server/routes/gsd.js — add this to the router

router.patch('/projects/:name/stage', async (req, res) => {
  const projectName = req.params.name;
  const { to: targetStage, fromModal } = req.body;

  try {
    const config = loadConfig();
    const projectIndex = config.projects.findIndex(p => p.name === projectName);
    if (projectIndex === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = config.projects[projectIndex];
    const currentStage = project.stage || 'draft';

    // Validate transition allowed
    const validation = await validateGates(project, targetStage);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Transition blocked by prerequisites',
        hardGates: validation.hardGates,
        softGates: validation.softGates,
      });
    }

    // Execute provisioning if needed
    if (validation.requiresProvisioning.includes('betterStackMonitor')) {
      const monitor = await betterStackProvisioner.provisionMonitor(
        projectName,
        project.productionUrl
      );
      project.betterStackMonitorId = monitor.monitorId;
    }

    if (validation.requiresProvisioning.includes('r2Bucket')) {
      const bucket = await r2Provisioner.createBucket(projectName);
      project.r2BucketName = bucket.bucketName;
    }

    // If Beta↔Launched, trigger task migration
    if ((currentStage === 'beta' && targetStage === 'launched') ||
        (currentStage === 'launched' && targetStage === 'beta')) {
      // TODO: Phase 59 task migration logic
      // await migrateTasksToIssues(project) or vice versa
    }

    // Update stage
    project.stage = targetStage;
    project.stageUpdatedAt = new Date().toISOString();

    // Save config
    saveConfig(config);

    // Broadcast change
    broadcast('project_stage_change', {
      projectName,
      from: currentStage,
      to: targetStage,
      timestamp: new Date().toISOString(),
    });

    // Log to Portfolio Feed
    pushEvent({
      type: 'stage_change',
      projectName,
      projectDisplayName: project.display_name || projectName,
      label: `Advanced from ${currentStage} to ${targetStage}`,
      detectedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      stage: targetStage,
      project: project,
    });
  } catch (err) {
    console.error(`Stage transition error for ${projectName}:`, err);
    return res.status(500).json({
      error: 'Stage transition failed',
      detail: err.message,
    });
  }
});
```

### Pattern 4: Frontend Stage Transition Modal

**What:** React modal component that displays gate validation results and collects user confirmation.

**When to use:** When user clicks "Advance Stage" button on card.

**Example:**
```typescript
// client/src/components/StageTransitionModal.tsx
// Source: React patterns + existing modal components in Dashboard

import { useState } from 'react';
import type { GsdProject } from '../lib/types';

interface StageTransitionModalProps {
  project: GsdProject;
  targetStage: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function StageTransitionModal({
  project,
  targetStage,
  isOpen,
  onClose,
  onConfirm,
}: StageTransitionModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [gates, setGates] = useState(null);
  const [error, setError] = useState('');

  // Fetch gate validation on open
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const response = await fetch(`/api/projects/${project.name}/stage/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: targetStage }),
        });
        const data = await response.json();
        setGates(data);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [isOpen, project.name, targetStage]);

  async function handleConfirm() {
    setIsLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-1 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">
          Advance {project.name} from {project.stage} to {targetStage}?
        </h2>

        {gates && (
          <div className="space-y-4 mb-6">
            <div>
              <h3 className="font-semibold text-sm text-gray-400 mb-2">Prerequisites</h3>
              {gates.hardGates?.map(gate => (
                <div key={gate.gate} className="flex items-center gap-2 text-sm mb-1">
                  <span className="text-red-500">✗</span>
                  <span>{gate.label}</span>
                </div>
              ))}
              {gates.softGates?.map(gate => (
                <div key={gate.gate} className="flex items-center gap-2 text-sm mb-1">
                  <span className="text-yellow-500">⚠</span>
                  <span>{gate.label}</span>
                </div>
              ))}
            </div>

            {gates.requiresProvisioning?.length > 0 && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3 text-sm">
                The following will be automatically created:
                <ul className="mt-2 space-y-1 ml-4">
                  {gates.requiresProvisioning.includes('betterStackMonitor') && (
                    <li>• Uptime monitor via BetterStack</li>
                  )}
                  {gates.requiresProvisioning.includes('r2Bucket') && (
                    <li>• Backup bucket via Cloudflare R2</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && <div className="text-red-500 text-sm mb-4">{error}</div>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 px-4 py-2 rounded bg-surface-2 text-gray-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading || (gates && !gates.valid)}
            className="flex-1 px-4 py-2 rounded bg-accent text-white disabled:opacity-50"
          >
            {isLoading ? 'Advancing...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Anti-Patterns to Avoid

- **Storing stage only in SQLite without JSON:** gsd-projects.json is the source of truth and survives without a database. Avoid dual-source problems by keeping JSON as primary.
- **Blocking on soft gates:** Alpha→Beta has a soft preview URL gate. Never block transitions on soft gates — always warn but allow user to proceed.
- **Hardcoding BetterStack/R2 API URLs:** Use environment variables and helper modules so credentials don't leak into route code.
- **Frontend-side stage validation:** Never trust client-side stage checks. Always validate on backend before provisioning.
- **Auto-archiving without confirmation:** Retired stage requires explicit confirmation dialog; never auto-transition based on time or inactivity alone.
- **Mixing task/issue migration with stage transitions:** Beta↔Launched is the only transition with data migration. Keep migration logic separate from the transition state machine.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| **Uptime monitoring** | Custom HTTP polling + alerting | BetterStack (auto-provisioned at Beta→Launched) | BetterStack has mature incident management, multi-region pings, and status pages. Hand-rolled polling misses geolocation diversity and alert routing. |
| **Backup storage** | rsync scripts to arbitrary S3 buckets | Cloudflare R2 (auto-provisioned, global CDN integration) | R2 is cheaper, integrates with existing Cloudflare Tunnel infra, and handles versioning. Hand-rolled S3 requires IAM setup per project. |
| **State machine for reversible transitions** | Ad-hoc transition checks | Standard gate validation matrix (CONTEXT.md D-03) | Transitions have complex prerequisites that must be checked consistently in both directions. Hand-rolling means duplicating gate logic. |
| **GitHub repo archival** | Custom REST calls to GitHub API | `gh repo archive` CLI command | `gh` is already in PATH on Hetzner, matches the project creation pattern, and handles rate limiting. Hand-rolled API calls require PAT management and error handling. |
| **Persistent event stream for nudges** | In-memory array that resets on restart | feedStore.js (Portfolio Feed) with optional SQLite backing | In-memory works for this phase (200 events, local-first). If nudges must survive restarts, migrate to SQLite in Phase 59. |

**Key insight:** Stage transitions touch external services (BetterStack, R2, GitHub) that have non-trivial management complexity. Use their official APIs and tools rather than building custom orchestration. The only hand-rolled logic should be the gate validation matrix and the orchestration PATCH endpoint.

---

## Runtime State Inventory

This is a greenfield feature (no existing "stage" field to migrate). However, **existing projects without a stage field** need backfill.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | gsd-projects.json: 12 existing projects with no `stage` field | JSON migration: add `"stage": "draft"` default to all existing projects (one-time backfill on first deploy); UI chip renders "Assign stage" until user explicitly sets it |
| Live service config | None — BetterStack/R2 are only provisioned on Beta→Launched transition | N/A |
| OS-registered state | None — no OS-level registrations for stage | N/A |
| Secrets/env vars | `BETTERSTACK_API_KEY`, `CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL` already exist in `/home/services/.env.production` | None — credentials already configured per CLAUDE.md |
| Build artifacts | None | N/A |

**Backfill process (Part of Phase 58 Plan 01):**
1. On server startup, detect projects in gsd-projects.json without a `stage` field
2. Default them to `"draft"`
3. UI displays "Assign stage" chip on each unassigned project
4. User clicks chip → modal opens for manual stage assignment
5. Once assigned, chip disappears

---

## Common Pitfalls

### Pitfall 1: Assuming All External APIs Are Available at Startup

**What goes wrong:** Transition wizard calls BetterStack/R2 APIs but credentials are missing or API is down. Request hangs or fails with cryptic error.

**Why it happens:** BETTERSTACK_API_KEY and CLOUDFLARE credentials are global but optional for other features (cost tracking, Tunnel). Phase 58 makes them hard requirements for Beta→Launched.

**How to avoid:**
- Load credentials early in the transition flow; fail fast with "BetterStack API key not configured" if missing
- Add timeouts to all external API calls (5s → 10s depending on API)
- Return structured error responses distinguishing "soft gate warning" from "hard gate failure"
- Test provisioning with mock credentials in unit tests; integration tests should use a sandbox/staging API if possible

**Warning signs:**
- Transition wizard modal hangs for 30+ seconds
- Response is 502 or 504 from backend
- Error message is empty or generic ("failed")

### Pitfall 2: Forgetting That Transitions Are Reversible

**What goes wrong:** User advances to Launched but wants to go back to Beta. Backend code only handles forward-direction gate checks, so rollback is blocked or breaks state.

**Why it happens:** Developers often think of stages as one-way (draft → alpha → beta → launched). CONTEXT.md explicitly requires reversibility.

**How to avoid:**
- Gate validation must work in both directions: `canTransition(from, to)` checks both `from->to` and `to->from` are valid
- For Beta↔Launched transitions with data migration, the rollback must also migrate back (Tasks ← Issues)
- Test every transition in both directions in unit tests
- Document which transitions have data side-effects in comments

**Warning signs:**
- User can't go back to previous stage
- Forward transition succeeds but backward transition fails
- Task/Issue data is lost during rollback

### Pitfall 3: Race Conditions Between Multiple Users / Multiple Tabs

**What goes wrong:** User opens stage transition modal in two browser tabs. Clicks "Confirm" in both. One succeeds, the other fails because state changed mid-request. Frontend shows inconsistent UI.

**Why it happens:** No locking on gsd-projects.json; concurrent writes can overwrite each other.

**How to avoid:**
- Use read-modify-write atomicity for config file updates (load, modify, write in a single transaction if possible, or use file locking)
- Include a version/timestamp field in the response and re-fetch before showing conflicting state
- Modal should become disabled after first confirm; prevent double-submit
- Test with concurrent fetch calls to the same endpoint

**Warning signs:**
- Stage field changes back to previous value after transition
- BetterStack monitor created but stage not updated
- One project's stage overwrites another's in gsd-projects.json

### Pitfall 4: Missing Cleanup If Provisioning Partially Fails

**What goes wrong:** BetterStack monitor created, but R2 bucket creation fails. User is left in inconsistent state (monitor orphaned, stage not updated).

**Why it happens:** No rollback logic; if step N+1 fails, steps 1–N are not undone.

**How to avoid:**
- Wrap the entire transition in a try-catch and collect all provisioning tasks
- If any step fails, don't write the stage change to gsd-projects.json
- Return clear error message: "R2 bucket creation failed (BetterStack monitor already created — manual cleanup required)"
- Add a recovery endpoint `/api/projects/:name/stage/rollback` to delete orphaned resources
- Test failure scenarios: BetterStack API down, R2 API timeout, GitHub rate limit, etc.

**Warning signs:**
- BetterStack monitor exists but project stage is still "beta"
- Error message doesn't mention partial success
- No way to clean up orphaned resources

### Pitfall 5: Soft Gates Becoming Hard Gates Over Time

**What goes wrong:** Alpha→Beta allows proceeding without a preview URL. Later, Launched card renders "preview URL" button that crashes if null.

**Why it happens:** Gate definitions (soft/hard) are decoupled from UI rendering logic. Team may tighten requirements later without updating both.

**How to avoid:**
- Document which gates are soft vs hard in the code and CONTEXT.md
- If a feature strictly requires a URL, make the gate hard. If it's optional, keep soft and make UI gracefully degrade (button disabled, placeholder text, etc.)
- Test card rendering for every stage combination (draft/alpha/beta with and without URLs, issues enabled/disabled, etc.)

**Warning signs:**
- UI crashes when optional field is null
- Gate validation passes but downstream code assumes field is set
- User can transition but then can't use the next stage's features

---

## Code Examples

Verified patterns from official sources:

### Pattern: HTTP API Calling with Credentials (from costMeasurement.js)

```javascript
// Source: server/gsd/costMeasurement.js (existing pattern)
// Use this model for BetterStack and R2 provisioning

async function exampleApiCall(projectName, payload) {
  const apiKey = process.env.CUSTOM_API_KEY;
  if (!apiKey) {
    throw new Error('CUSTOM_API_KEY not configured');
  }

  const response = await fetch('https://api.example.com/v1/resource', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),  // 10s timeout
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`API call failed: ${err.message || response.statusText}`);
  }

  return response.json();
}
```

### Pattern: Broadcasting WebSocket Events (from stateBroadcaster.js)

```javascript
// Source: server/gsd/stateBroadcaster.js (existing pattern)
// Extend for stage change events

const { broadcast } = require('../websocket');

function broadcastStageChange(projectName, fromStage, toStage) {
  broadcast('project_stage_change', {
    projectName,
    from: fromStage,
    to: toStage,
    timestamp: new Date().toISOString(),
  });
}
```

### Pattern: Portfolio Feed Events (from feedStore.js)

```javascript
// Source: server/gsd/feedStore.js (existing pattern)
// Extend for stage nudge events

const { pushEvent } = require('./feedStore');

function logStageAdvance(projectName, displayName, fromStage, toStage) {
  pushEvent({
    type: 'stage_change',
    projectName,
    projectDisplayName: displayName,
    label: `Advanced from ${fromStage} to ${toStage}`,
    detectedAt: new Date().toISOString(),
  });
}

function logStageNudge(projectName, displayName, reason) {
  pushEvent({
    type: 'stage_nudge',
    projectName,
    projectDisplayName: displayName,
    label: `🚀 Ready to advance: ${reason}`,
    detectedAt: new Date().toISOString(),
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual project lifecycle tracking (external spreadsheet, Todoist) | Stage field + Dashboard UI + auto-nudges | Phase 58 (planned) | Reduces context-switching; nudges replace manual "should I promote?" decision-making |
| Separate uptime monitoring setup (sign up for SaaS, create monitor, store URL) | Auto-provisioning at Beta→Launched | Phase 58 (planned) | Removes friction; one fewer manual step in project launch workflow |
| Manual Git-to-GitHub backup flow (rsync cron, backup to personal S3) | Auto-provisioning R2 bucket at Beta→Launched | Phase 58 (planned) | Standardizes backups; ties to project lifecycle instead of separate cron |
| One-way project archival (mark as archived, hide manually) | Two-tier kill/archive + reversible stages (Retired) | Phase 58 (planned) | Archive is non-destructive; full delete requires explicit confirmation |

**Deprecated/outdated:**
- Railway project status entries in gsd-projects.json (Phase 58 deferred quick task): Railway removed in favor of Hetzner VPS. Existing "railway" entries should be cleaned up.

---

## Assumptions Log

All factual claims in this research have been verified or explicitly tagged. This table lists claims that depend on user confirmation before planning.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | BetterStack and Cloudflare R2 credentials are correctly configured in `/home/services/.env.production` at deployment time | Architecture, BetterStack + R2 Auto-Provisioning | If missing, Beta→Launched transitions fail. Mitigated by early fail-fast check in wizard. |
| A2 | Eligibility criteria for stage nudges are "Beta for 14 days + ≥12 commits" (exact formula not yet specified) | Common Pitfalls, State of the Art | If criteria don't match user expectations, nudges feel wrong. Planner should clarify exact formula in CONTEXT.md. |
| A3 | Task ↔ Issue migration logic will be implemented in Phase 59, not Phase 58 | Architecture Responsibility, Phase Requirements | Phase 58 assumes Phase 59 will handle migration. If deferred further, must scope task surface override into Phase 58. |
| A4 | GitHub Issues can be enabled/disabled per project via `gh repo edit` or API | Standard Stack, Gate Validation | If GitHub Issues toggling is not supported, gate check becomes advisory only. User should verify. |
| A5 | Existing projects in gsd-projects.json (12 total) can be safely defaulted to `stage: "draft"` without user confirmation | Runtime State Inventory | If any project should start at a higher stage, backfill process must allow manual override. Planner should decide. |

---

## Open Questions (RESOLVED)

1. **BetterStack monitor naming convention** (RESOLVED)
   - What we know: Monitor name should match projectName, but BetterStack API may have naming restrictions
   - Resolution: Use `gsd-${projectName}` to namespace all monitors, avoiding collisions with non-GSD monitors.

2. **R2 bucket naming convention** (RESOLVED)
   - What we know: Cloudflare R2 bucket names must be globally unique and follow DNS rules
   - Resolution: Use `gsd-${projectName}` pattern, convert to lowercase, replace non-alphanumeric with hyphens.

3. **Eligibility criteria formula for stage nudges (MAT-07)** (RESOLVED)
   - What we know: CONTEXT.md specifies "14 days + 12 commits"
   - Resolution: Measure 14 days from `stageUpdatedAt`; count commits on project's main branch since that timestamp. Both conditions must be met to suppress the nudge.

4. **Task ↔ Issue migration for Beta↔Launched reversibility** (RESOLVED — deferred)
   - Resolution: Phase 58 treats Beta→Launched migration as one-way. Multi-cycle re-association deferred to Phase 59. Limitation documented in plan.

5. **Stage field validation in gsd-projects.json** (RESOLVED)
   - Resolution: Validate in `loadConfig()` — warn if unknown stage value found, default unknown to "draft".

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All backend routes | ✓ | 18+ (verified in package.json engines) | — |
| Express.js | /api/projects/:name/stage route | ✓ | ^4.21.2 (in package.json) | — |
| better-sqlite3 | Optional (future state persistence) | ✓ | ^11.7.0 (in package.json) | Use JSON config for now |
| React + Vite | Frontend UI components | ✓ | (client/package.json) | — |
| git | Commit counting for nudges, gh CLI | ✓ | (system) | Fallback: query GitHub API instead of local git |
| gh (GitHub CLI) | Repository archival at Retired stage | ✓ | (Hetzner system) | Fallback: Use Octokit npm package |
| tmux | Session pause/stop at Retired stage | ✓ | (Hetzner system) | — |
| BETTERSTACK_API_KEY | BetterStack monitor provisioning | ✓ | (in /home/services/.env.production) | Fallback: Skip provisioning, warn user (gate becomes soft) |
| CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL | R2 bucket provisioning | ✓ | (in /home/services/.env.production) | Fallback: Skip provisioning, warn user (gate becomes soft) |
| PostgreSQL / SQLite | Optional future state storage | ✓ | (Hetzner system, SQLite in Node.js) | Use JSON config for Phase 58 |

**Missing dependencies with no fallback:**
- None. All core dependencies are available on Hetzner VPS.

**Missing dependencies with fallback:**
- BetterStack and R2 provisioning can be skipped if credentials are unavailable; transition still completes but gates become advisory warnings instead of blocking checks.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js `node:test` (existing, no new packages) |
| Config file | None — inline in test files per existing pattern |
| Quick run command | `npm run test:server -- server/__tests__/stage-transitions.test.js` |
| Full suite command | `npm run test:server` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MAT-01 | New projects default to `stage: "draft"` in gsd-projects.json | unit | `npm run test:server -- server/__tests__/stage-transitions.test.js --grep "default.*draft"` | ❌ Wave 0 |
| MAT-01 | Existing projects without stage get backfilled to "draft" on load | integration | `npm run test:server -- server/__tests__/stage-transitions.test.js --grep "backfill"` | ❌ Wave 0 |
| MAT-02 | Card UI renders stage badge for each stage value | unit | `npm run test:client -- --grep "stage.*badge"` | ❌ Wave 0 |
| MAT-02 | Card UI shows correct task/issue surface per stage | unit | `npm run test:client -- --grep "task.*issue.*surface"` | ❌ Wave 0 |
| MAT-03 | PATCH /api/projects/:name/stage validates hard gates before transition | integration | `npm run test:server -- server/__tests__/stage-transitions.test.js --grep "hard.*gate"` | ❌ Wave 0 |
| MAT-03 | PATCH endpoint returns gate violations with readable labels | integration | `npm run test:server -- server/__tests__/stage-transitions.test.js --grep "gate.*validation"` | ❌ Wave 0 |
| MAT-04 | Transitions are reversible: A→B→A succeeds in both directions | integration | `npm run test:server -- server/__tests__/stage-transitions.test.js --grep "reversible"` | ❌ Wave 0 |
| MAT-05 | Retired stage triggers gracefulShutdown and GitHub repo archival | integration | `npm run test:server -- server/__tests__/stage-transitions.test.js --grep "retired.*tmux.*archive"` | ❌ Wave 0 |
| MAT-06 | Backfill chip renders when project.stage is undefined | unit | `npm run test:client -- --grep "backfill.*chip"` | ❌ Wave 0 |
| MAT-07 | Nudge eligibility check returns true for project in Beta 14+ days with 12+ commits | unit | `npm run test:server -- server/__tests__/stage-nudges.test.js --grep "eligibility"` | ❌ Wave 0 |
| MAT-07 | Nudge event logged to feedStore when eligibility met | integration | `npm run test:server -- server/__tests__/stage-nudges.test.js --grep "nudge.*feed"` | ❌ Wave 0 |
| MAT-08 | Draft-stage kill button shows archive/delete options | unit | `npm run test:client -- --grep "kill.*draft"` | ❌ Wave 0 |
| MAT-08 | Delete requires typing "DELETE" confirmation | unit | `npm run test:client -- --grep "delete.*confirm.*DELETE"` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run test:server -- server/__tests__/stage-transitions.test.js` (< 30s)
- **Per wave merge:** `npm run test:server && npm run test:client` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `server/__tests__/stage-transitions.test.js` — covers MAT-01, MAT-03, MAT-04, MAT-05, MAT-06 (gate validation, reversibility, Retired behavior)
- [ ] `server/__tests__/stage-nudges.test.js` — covers MAT-07 (eligibility criteria, feed event logging)
- [ ] `client/__tests__/StageTransitionModal.test.tsx` — covers MAT-03 modal rendering and gate display
- [ ] `client/__tests__/ProjectCard.stage.test.tsx` — covers MAT-02 (stage badge, conditional buttons per stage)
- [ ] `client/__tests__/ChatListFilters.stage.test.tsx` — covers MAT-02 (stage grouping toggle and filtering)
- [ ] `server/__tests__/provisioning.test.js` — covers BetterStack/R2 provisioning mocks (dry-run without real API calls)

**Test infrastructure decisions:**
- Mock BetterStack and R2 API calls in unit tests (use `node:test` stubbing or `sinon`); integration tests can use sandbox credentials if available
- Use temporary test gsd-projects.json file in temp directory (pattern: `server/__tests__/config.test.js`)
- Playwright or Vitest for client-side; test each stage's card rendering separately

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not directly — inherits from existing Dashboard auth |
| V3 Session Management | no | Not directly — inherits from existing sessions |
| V4 Access Control | yes | Only authenticated users can transition stages; transitions are per-project (no cross-project access) |
| V5 Input Validation | yes | Stage value is enum-validated; project name sanitized; URL fields validated as valid URLs |
| V6 Cryptography | yes | API credentials (BETTERSTACK_API_KEY, CLOUDFLARE_API_KEY) stored in env; never logged or returned to client |
| V7 Error Handling & Logging | yes | Provisioning errors return structured, plain-English messages; no stack traces to client; credentials never appear in logs |
| V8 Data Protection | yes | Provisioning calls use HTTPS; no unencrypted credential transmission; gsd-projects.json written with safe permissions |
| V9 Communications | yes | All external API calls use HTTPS; headers validated for safety |
| V10 Stored Cryptography | no | Not directly — credentials in env, not stored in DB |

### Known Threat Patterns for {this stack}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **Credential leakage in logs** | Information Disclosure | Environment variables only; never log `BETTERSTACK_API_KEY` or `CLOUDFLARE_API_KEY`; sanitize error responses to client |
| **Unauthorized stage transition** | Tampering | Validate project ownership (user must have file access) via existing auth; no direct API access without session |
| **Race condition on concurrent transitions** | Tampering | File-level locking or atomic JSON operations; test concurrent PATCH requests to same project |
| **Orphaned resources if provisioning fails** | Denial of Service | Rollback logic on failure; return partial-success errors; document manual cleanup for user |
| **API rate limiting (BetterStack/Cloudflare)** | Denial of Service | Add backoff/retry logic; timeout all API calls; fail gracefully if rate-limited |
| **Enum injection (stage value)** | Tampering | Whitelist only 6 valid stage values; reject any string outside enum |
| **URL validation bypass** | Tampering | Validate production/preview URLs as valid HTTP(S) URLs; reject javascript: or file: schemes |
| **GitHub repo not actually archived** | Information Disclosure | Verify archival succeeded via `gh repo view --json isArchived`; log success to audit trail |

---

## Sources

### Primary (HIGH confidence)

- **gsd-projects.json** — Verified current project registry structure and existing projects list
- **server/routes/projects.js** (lines 1–100) — Verified project creation pipeline and config loading pattern
- **server/gsd/feedStore.js** — Verified Portfolio Feed event structure and pushEvent API
- **server/gsd/costMeasurement.js** (lines 1–80) — Verified HTTP API calling pattern and env credential loading
- **CONTEXT.md §Implementation Decisions** — Locked decisions from user discussion (D-01 through D-20)
- **REQUIREMENTS.md §MAT** — MAT-01 through MAT-08 requirement specs
- **ROADMAP.md §Phase 58** — Stage matrix table and phase goal statement

### Secondary (MEDIUM confidence)

- **server/gsd/stateBroadcaster.js** — Verified WebSocket broadcast pattern for state changes
- **server/__tests__/config.test.js** (lines 1–60) — Verified test infrastructure pattern (temp DB, fetchJson helper)
- **client/src/components/ChatListFilters.tsx** — Verified existing filter tab UI structure
- **server/routes/gsd.js** (lines 1–100) — Verified API endpoint structure and config file operations

### Tertiary (notes)

- CLAUDE.md §Shared credentials — Noted BETTERSTACK_API_KEY and CLOUDFLARE credentials availability
- CLAUDE.md §VPS layout — Confirmed `/home/services/.env.production` location
- .planning/STATE.md — Confirmed project context and existing infrastructure status

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH — All packages already present in package.json; no new deps needed
- **Architecture:** HIGH — CONTEXT.md provides locked decisions; gate matrix is detailed; API pattern verified against costMeasurement.js
- **Pitfalls:** MEDIUM-HIGH — Identified from examining existing patterns; some pitfalls (race conditions, partial failure) are common in this domain and not yet tested
- **Provisioning APIs:** MEDIUM — BetterStack and R2 API specifics not yet verified against live APIs; HTTP pattern confirmed but exact endpoints/payloads may differ
- **Data migration (Beta↔Launched):** LOW — Phase 59 will handle task/issue migration; Phase 58 only coordinates the state transition

**Research date:** 2026-05-28
**Valid until:** 2026-06-04 (7 days — provisioning APIs and external service availability can change; CONTEXT.md decisions are stable)

**Confidence for planning:** HIGH — Planner has all necessary information to create task sequences for Wave 1 (stage storage + JSON backfill), Wave 2 (transition wizard + gate validation), and Wave 3 (provisioning + UI surfaces). No blocking ambiguities.
