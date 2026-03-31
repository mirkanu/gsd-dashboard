# Architecture: Autopilot + Cost Intelligence Integration

**Project:** GSD Dashboard v3.0
**Researched:** 2026-03-31
**Scope:** Integrating autonomous execution controller (autopilot) and cost tracking into existing Express + React + SQLite + tmux architecture

---

## Executive Summary

v3.0 adds two major features to GSD Dashboard: **GSD Autopilot** (autonomous plan-all → execute-all loop) and **cost intelligence** (Claude Max limits, service cost tracking). Both integrate cleanly into the existing architecture by extending existing patterns:

- **Autopilot** spawns tmux sessions (like terminal.js already does) and monitors STATE.md for phase completion (like readers.js already does)
- **Cost tracking** extends the existing token_usage + pricing tables with Claude API limit tracking and external service cost ingestion
- **New React pages** follow the existing Analytics page pattern (WebSocket live updates, cost calculations)

**Key insight:** The existing architecture already has all the pieces (tmux control, file monitoring, WebSocket broadcast, cost calculation). v3.0 is composition + orchestration, not fundamental redesign.

---

## Current Architecture (v2.3)

### Data Flow

```
Terminal Input (xterm.js)
    ↓
WebSocket (/ws/terminal/[project])
    ↓
node-pty + tmux attach-session
    ↓
Pane capture + state detection (tmux.js)
    ↓
SQLite (sessions, agents, events, token_usage)
    ↓
Express routes (/api/gsd/*, /api/pricing/*, /api/sessions/*)
    ↓
React components (GSD.tsx, Analytics.tsx, KanbanBoard.tsx)
    ↓
WebSocket broadcast (/ws) → UI updates
```

### Key Components

| Component | File(s) | Responsibility | State |
|-----------|---------|-----------------|-------|
| **tmux control** | `server/gsd/tmux.js` | Check session status, capture pane output, detect rate limits | Stateless, calls execFileSync('tmux', ...) |
| **Planning file readers** | `server/gsd/readers.js` | Parse STATE.md, ROADMAP.md, REQUIREMENTS.md | Stateless, reads filesystem |
| **GSD routes** | `server/routes/gsd.js` | HTTP endpoints for project config, file content, terminal connection | Thin wrapper, delegates to readers/tmux |
| **Database** | `server/db.js` | SQLite with sessions, agents, events, token_usage, model_pricing, project_tasks | Persistent, incremental migrations |
| **WebSocket** | `server/websocket.js` | Broadcast agent/session state changes | In-memory connection tracking |
| **Terminal routes** | `server/routes/terminal.js` | node-pty bridge for xterm.js | Per-connection PTY + message logging |
| **Cost calculation** | `server/routes/pricing.js` | Pattern-match tokens against pricing rules | Uses model_pricing table |
| **MCP server** | `mcp/src/` | Tool registry exposing dashboard APIs as Claude-callable tools | Standalone, calls dashboard HTTP API |

### Why This Matters for v3.0

- **tmux is already a control plane:** We can send keystrokes to a session and capture output. Autopilot can spawn new sessions.
- **File monitoring already works:** readers.js can parse STATE.md. Autopilot loop watches for phase completion.
- **Cost calculation already exists:** Pricing tables are seeded, token hooks populate token_usage. Autopilot tracks cumulative cost.
- **Broadcasting works:** /ws already sends agent/session updates to all connected clients. Cost page can subscribe to price updates.

---

## New Components for v3.0

### 1. Autopilot Controller

**Purpose:** Autonomous plan-all → execute-all loop per project

**Responsibility:**
- Monitor project STATE.md for phase completion
- Chain `/gsd:plan-phase` → `/gsd:execute-phase` commands
- Track execution state (planning, executing, waiting for input, paused, error)
- Detect rate limits and backoff
- Report progress to dashboard

**Architecture:**

```
Autopilot Controller
├── ProjectAutopilot (per project, in a tmux session)
│   ├── state: planning | executing | waiting | paused | error
│   ├── currentPhase: phase number from STATE.md
│   ├── planData: { phase, goals, tasks, success_criteria }
│   ├── executionLog: { command, timestamp, exitCode, output }
│   └── failureCount: for circuit breaker
│
├── AutopilotManager (orchestrator)
│   ├── projects: Map<projectName, ProjectAutopilot>
│   ├── startAutopilot(projectName): spawn tmux session + controller
│   ├── pauseAutopilot(projectName): kill active commands
│   ├── resumeAutopilot(projectName): resume from checkpoint
│   └── watchLoop(): main polling loop
│
└── Monitor Tasks
    ├── STATE.md parser: detect phase changes
    ├── Rate limit detector: tmux output analysis
    ├── Circuit breaker: fail N times → pause + notify
    └── Cost tracker: sum token usage for this phase
```

**Deployment:**

```javascript
// server/gsd/autopilot.js — NEW FILE
const AutopilotManager = class {
  constructor(db, broadcast) {
    this.db = db;
    this.broadcast = broadcast;
    this.projects = new Map();
    this.watchInterval = 5000; // check every 5s
  }

  startAutopilot(projectName, options = {}) {
    // 1. Spawn new tmux session: gsd-autopilot-{projectName}
    // 2. Send initial /gsd:plan-all command
    // 3. Start monitor loop
  }

  pauseAutopilot(projectName) {
    // Kill active command (Ctrl+C)
    // Update autopilot_state table to 'paused'
    // Broadcast status change
  }

  watchLoop() {
    // Every 5s:
    // - Check each active autopilot project
    // - Parse STATE.md for phase progress
    // - If phase complete, queue next execute-phase command
    // - Check for rate limits in tmux output
    // - Track cost delta
  }
};

module.exports = { AutopilotManager };
```

**Database Schema — NEW:**

```sql
CREATE TABLE IF NOT EXISTS autopilot_state (
  project_name TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'error', 'waiting', 'completed')),
  tmux_session TEXT,
  current_phase INTEGER,
  current_command TEXT,
  last_state_file_hash TEXT,
  started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  paused_at TEXT,
  completed_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  cost_snapshot REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS autopilot_execution_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_name TEXT NOT NULL,
  phase INTEGER,
  command TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  exit_code INTEGER,
  output_summary TEXT,
  cost_delta REAL,
  FOREIGN KEY (project_name) REFERENCES autopilot_state(project_name) ON DELETE CASCADE
);
```

**API Endpoints — NEW:**

```
POST /api/autopilot/start/:projectName
  → Start autopilot for project, spawn tmux session, begin watch loop

POST /api/autopilot/pause/:projectName
  → Pause autopilot, Ctrl+C active command, update status

POST /api/autopilot/resume/:projectName
  → Resume from paused state

GET /api/autopilot/status/:projectName
  → { status, currentPhase, lastCommand, cost, failures }

GET /api/autopilot/execution-log/:projectName?limit=50
  → List recent execution log entries with cost deltas

WebSocket message: "autopilot_status_changed"
  → { projectName, status, currentPhase, cost, failure }
```

**Integration Points:**

- **Trigger:** Dashboard card button "Start Autopilot" sends POST /api/autopilot/start
- **Monitoring:** Existing WebSocket broadcast used for status updates
- **File parsing:** Reuse existing `readState()` from readers.js
- **Rate limits:** Reuse `detectRateLimit()` from tmux.js
- **Cost tracking:** Use existing token_usage queries, sum deltas

---

### 2. Cost Intelligence Module

**Purpose:** Track Claude Max session limits, external service costs, cost projections

**Components:**

```
Cost Intelligence
├── ClaudeMaxTracker
│   ├── sessionLimit: tokens/month (from env or API)
│   ├── weeklyLimit: tokens/week
│   ├── currentSession: tokens used in current session
│   ├── weeklyTotal: sum of all sessions in past 7 days
│   └── warningThresholds: 80%, 95%, 100%
│
├── ExternalServiceCosts
│   ├── Railway: /api/railway/status + cost endpoint
│   ├── GitHub: API call count → estimated cost
│   ├── Claude API: calculated from token_usage
│   ├── OpenAI (if any): fallback service tracker
│   └── Custom receipts: email parser (future)
│
└── CostProjection
    ├── burnRate: $/day based on last 7 days
    ├── daysUntilLimit: based on weekly rate
    └── costForecast: monthly projection
```

**Database Schema — NEW:**

```sql
CREATE TABLE IF NOT EXISTS claude_max_usage (
  session_id TEXT PRIMARY KEY,
  month INTEGER,
  year INTEGER,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  messages_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS service_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  period TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  timestamp TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata TEXT -- JSON: { api_calls, units, rate_per_unit }
);

CREATE TABLE IF NOT EXISTS claude_max_limits (
  period TEXT PRIMARY KEY, -- 'session', 'week', 'month'
  token_limit INTEGER NOT NULL,
  cost_limit REAL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
```

**API Endpoints — NEW:**

```
GET /api/cost/claude-max
  → {
      sessionLimit: 4_000_000,
      weeklyLimit: 12_000_000,
      currentSession: { tokens, sessions, burnRate, daysRemaining },
      weeklyTotal: { tokens, sessions, burnRate, daysRemaining },
      warningLevel: 'ok' | 'caution' | 'critical'
    }

GET /api/cost/services
  → { claude: 23.45, railway: 5.0, github: 0, total: 28.45 }

GET /api/cost/projection
  → {
      dailyBurnRate: 2.34,
      weeklyProjection: 16.38,
      monthlyProjection: 70.92,
      daysUntilLimit: 45
    }

GET /api/cost/history?days=30
  → [ { date, service, amount, cumulative } ]

PUT /api/cost/limits
  → Update sessionLimit, weeklyLimit, costLimit thresholds
```

**Calculation Pattern:**

```javascript
// server/routes/cost-intelligence.js — NEW FILE
const router = express.Router();

function calculateClaudeMaxUsage(db) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const monthStats = db.prepare(`
    SELECT
      SUM(tu.input_tokens + tu.output_tokens + tu.cache_read_tokens + tu.cache_write_tokens) as total,
      COUNT(DISTINCT tu.session_id) as sessions,
      MAX(s.updated_at) as last_activity
    FROM token_usage tu
    JOIN sessions s ON s.id = tu.session_id
    WHERE s.started_at >= ?
  `).get(monthStart.toISOString());

  const weekStats = db.prepare(`
    SELECT
      SUM(tu.input_tokens + tu.output_tokens + tu.cache_read_tokens + tu.cache_write_tokens) as total,
      COUNT(DISTINCT tu.session_id) as sessions
    FROM token_usage tu
    JOIN sessions s ON s.id = tu.session_id
    WHERE s.started_at >= ?
  `).get(weekStart.toISOString());

  const burnRate = weekStats.total / 7; // tokens/day

  return {
    sessionLimit: parseInt(process.env.CLAUDE_MAX_LIMIT || 4_000_000),
    weeklyLimit: 12_000_000, // Anthropic Claude Max policy
    currentMonth: { tokens: monthStats.total, sessions: monthStats.sessions },
    currentWeek: { tokens: weekStats.total, sessions: weekStats.sessions },
    burnRate,
    daysUntilSessionLimit: (4_000_000 - monthStats.total) / burnRate,
  };
}

router.get('/claude-max', (req, res) => {
  const stats = calculateClaudeMaxUsage(db);
  const warningLevel =
    stats.currentWeek.tokens > stats.weeklyLimit * 0.95 ? 'critical' :
    stats.currentWeek.tokens > stats.weeklyLimit * 0.80 ? 'caution' :
    'ok';
  res.json({ ...stats, warningLevel });
});

module.exports = router;
```

**React Component Pattern:**

```typescript
// client/src/pages/CostIntelligence.tsx — NEW FILE
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ClaudeMaxStats } from "../lib/types";

export function CostIntelligence() {
  const [claudeMax, setClaudeMax] = useState<ClaudeMaxStats | null>(null);
  const [services, setServices] = useState<Record<string, number>>({});

  useEffect(() => {
    const fetchData = async () => {
      const [max, svc] = await Promise.all([
        api.get<ClaudeMaxStats>("/api/cost/claude-max"),
        api.get<Record<string, number>>("/api/cost/services"),
      ]);
      setClaudeMax(max);
      setServices(svc);
    };
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (!claudeMax) return <div>Loading...</div>;

  const weekPct = (claudeMax.currentWeek.tokens / claudeMax.weeklyLimit) * 100;
  const warningColor =
    claudeMax.warningLevel === 'critical' ? 'bg-red-500/10' :
    claudeMax.warningLevel === 'caution' ? 'bg-amber-500/10' :
    'bg-emerald-500/10';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cost Intelligence</h1>

      {/* Claude Max Progress */}
      <div className={`p-4 rounded-lg ${warningColor} border`}>
        <h2 className="font-semibold mb-2">Claude Max Weekly Usage</h2>
        <div className="flex justify-between text-sm mb-2">
          <span>{(claudeMax.currentWeek.tokens / 1_000_000).toFixed(1)}M tokens</span>
          <span>{weekPct.toFixed(0)}% of {(claudeMax.weeklyLimit / 1_000_000).toFixed(0)}M limit</span>
        </div>
        <div className="w-full h-2 bg-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${Math.min(weekPct, 100)}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Burn rate: {(claudeMax.burnRate / 1_000_000).toFixed(2)}M tokens/day
        </p>
      </div>

      {/* Service Costs */}
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(services).map(([service, cost]) => (
          <div key={service} className="p-3 bg-surface-2 rounded border">
            <p className="text-xs text-gray-400 capitalize">{service}</p>
            <p className="text-lg font-mono">${cost.toFixed(2)}</p>
          </div>
        ))}
      </div>

      {/* Projection */}
      <div className="p-4 bg-surface-2 rounded border">
        <h3 className="font-semibold mb-2">Projection</h3>
        <p className="text-sm">
          At current burn rate, you have <strong>{claudeMax.daysUntilSessionLimit.toFixed(0)} days</strong> until monthly limit
        </p>
      </div>
    </div>
  );
}
```

**Integration Points:**

- **Trigger:** Dashboard settings page displays Claude Max limit
- **Monitoring:** Cost page updates every 30s via API polling (not WebSocket — cost is calculated, not streaming)
- **Alerts:** Telegram notifications when warning thresholds crossed (reuse existing telegram.js)
- **Card display:** Project cards show cost delta during autopilot execution

---

## Integration Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ React Dashboard (client/)                                        │
│  ├─ GSD.tsx (existing) → add autopilot start/pause buttons      │
│  ├─ CostIntelligence.tsx (NEW) → Claude Max, service costs      │
│  ├─ KanbanBoard.tsx (existing) → add cost badge on cards        │
│  └─ Layout.tsx (existing) → add Cost Intelligence nav link      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    WebSocket + HTTP API
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Express Server (server/)                                         │
│                                                                 │
│ NEW ROUTES:                                                     │
│  /api/autopilot/start        → AutopilotManager.startAutopilot()
│  /api/autopilot/pause        → AutopilotManager.pauseAutopilot()
│  /api/autopilot/resume       → AutopilotManager.resumeAutopilot()
│  /api/autopilot/status       → autopilot_state table           │
│  /api/autopilot/exec-log     → autopilot_execution_log table   │
│  /api/cost/claude-max        → calculateClaudeMaxUsage()       │
│  /api/cost/services          → aggregateServiceCosts()         │
│  /api/cost/projection        → projectBurnRate()               │
│  /api/cost/history           → queryCostHistory()              │
│                                                                 │
│ MODIFIED ROUTES:                                                │
│  /api/gsd/projects           → (no change, but costs broadcast) │
│  /api/pricing/cost           → (no change)                      │
│                                                                 │
│ NEW MODULES:                                                    │
│  gsd/autopilot.js            → AutopilotManager class          │
│  routes/cost-intelligence.js → Cost tracking routes            │
│  routes/autopilot-control.js → Control plane routes            │
│                                                                 │
│ EXISTING MODULES (USED BY V3.0):                               │
│  gsd/tmux.js                 → execFileSync tmux commands      │
│  gsd/readers.js              → STATE.md parsing                │
│  gsd/telegram.js             → Cost limit alerts               │
│  routes/pricing.js           → Model pricing calculation       │
│  db.js                        → SQLite schema + migrations      │
│  websocket.js                → Broadcast autopilot status      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Local System (machine running dashboard)                         │
│  ├─ tmux sessions: gsd-autopilot-{projectName} (NEW)            │
│  ├─ .planning/ files: STATE.md, ROADMAP.md (read by autopilot)  │
│  └─ .claude/ hooks: token data piped to API                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Component Boundaries

### New vs Modified

| Component | Type | Why |
|-----------|------|-----|
| AutopilotManager | NEW | Orchestrates /gsd:plan-all, /gsd:execute-phase loop + state tracking |
| autopilot_state table | NEW | Persists autopilot execution state across server restarts |
| autopilot_execution_log table | NEW | Audit trail: which phases executed, cost per phase, exit codes |
| ClaudeMaxTracker | NEW | Calculates session/weekly usage against limits, burn rate |
| ExternalServiceCosts | NEW | Aggregates Railway, GitHub, Claude costs |
| CostIntelligence React page | NEW | UI for limits, projections, alerts |
| /api/autopilot/* routes | NEW | HTTP control plane for start/pause/resume/status |
| /api/cost/* routes | NEW | HTTP endpoints for cost queries |
| gsd/autopilot.js | NEW | Main file with AutopilotManager and watch loop |
| routes/autopilot-control.js | NEW | Express route handlers |
| routes/cost-intelligence.js | NEW | Express route handlers |
| GSD.tsx card buttons | MODIFIED | Add "Start Autopilot" button, show cost badge |
| KanbanBoard.tsx | MODIFIED | Show cost delta per card during autopilot execution |
| CostIntelligence.tsx | NEW | New page route /cost-intelligence |
| gsd/readers.js | USED | parseState() called by autopilot watch loop |
| gsd/tmux.js | USED | execFileSync() for /gsd: commands, pane capture |
| routes/pricing.js | USED | calculateCost() reused for cost tracking |
| db.js | EXTENDED | Add 3 new tables, keep existing migrations |
| websocket.js | USED | broadcast("autopilot_status_changed", ...) |

### Data Flow: Autopilot Example

```
User clicks "Start Autopilot" on GSD card
        ↓
POST /api/autopilot/start?project=josie
        ↓
AutopilotManager.startAutopilot("josie")
        ├─ spawn tmux session: gsd-autopilot-josie
        ├─ send: /gsd:plan-all → waits for completion
        └─ start watchLoop()
        ↓
watchLoop() every 5s:
        ├─ readState(josie/.planning/STATE.md)
        ├─ parse current_phase from STATE.md
        ├─ if phase changed:
        │  └─ update autopilot_state.current_phase
        │     insert autopilot_execution_log
        │     broadcast("autopilot_status_changed", ...)
        ├─ check for "waiting for input" pattern in pane
        │  └─ if found: set status='waiting', notify Telegram
        ├─ calculateCost(phase_start_token_usage ... phase_end)
        │  └─ store cost_delta in execution_log
        └─ if phase complete: send /gsd:execute-phase
        ↓
UI subscribers (WebSocket)
        ├─ receive autopilot_status_changed message
        ├─ GSD.tsx updates card status + cost badge
        ├─ CostIntelligence.tsx updates live projection
        └─ Analytics.tsx adds execution log entry
```

### Data Flow: Cost Intelligence Example

```
User navigates to /cost-intelligence page
        ↓
CostIntelligence.tsx mounted
        ├─ GET /api/cost/claude-max
        │  └─ calculateClaudeMaxUsage(db)
        │     ├─ sum tokens for past month
        │     ├─ sum tokens for past week
        │     ├─ calculate burn rate (tokens/day)
        │     └─ calculate days until limit
        │
        ├─ GET /api/cost/services
        │  └─ aggregateServiceCosts()
        │     ├─ sum claude cost from token_usage * pricing
        │     ├─ fetch railway status → cost
        │     ├─ estimate github cost from API call count
        │     └─ return { claude, railway, github, total }
        │
        └─ setInterval(refetch every 30s)
        ↓
UI displays:
  ├─ Claude Max weekly progress bar (warning color if > 80%)
  ├─ Service breakdown (Claude, Railway, GitHub, etc.)
  ├─ Burn rate (tokens/day)
  ├─ Days until monthly limit
  └─ Monthly projection
```

---

## Key Design Decisions

### 1. Autopilot as Separate Process

**Decision:** Run autopilot in its own tmux session (`gsd-autopilot-{projectName}`)

**Why:**
- Isolation: Can pause/kill without affecting user's manual terminal
- Checkpointing: Easy to grep logs, resume from STATE.md snapshot
- Monitoring: Capture output pattern-matches (rate limits, waiting states)
- Simpler than async task queue: No extra process, just tmux + polling

**Not:** Spawn threads/promises that run /gsd: commands in-process
- Would block other requests
- Hard to recover from crashes
- Can't capture terminal I/O cleanly

### 2. Watch Loop Pattern (5s Polling)

**Decision:** Poll STATE.md every 5 seconds instead of using file watchers

**Why:**
- Simpler: No chokidar dependency, no edge cases with network filesystems
- Resilient: Miss a STATE.md write by 5s, catch it on next check
- Cost tracking: Loop also recalculates token_usage deltas
- Debuggable: Log every loop iteration

**Not:** Event-based (file watcher or webhook)
- Network filesystem issues
- Hard to debug timing

### 3. Cost Tracking via Dual Snapshots

**Decision:** Store `cost_snapshot` at autopilot start, calculate delta at end

```javascript
startPhase() {
  const phase_cost_start = getCurrentCost(db);
  // ... phase executes ...
  const phase_cost_end = getCurrentCost(db);
  const delta = phase_cost_end - phase_cost_start;
  log({ phase, costDelta: delta });
}
```

**Why:**
- Atomic: One cost value per phase, no interpolation errors
- Auditable: Every phase has before/after snapshots
- Projection-friendly: Multiply phase cost * remaining phases

**Not:** Continuous streaming or complex attribution
- Hard to know which tokens belong to which phase
- Autopilot doesn't have visibility into token hooks

### 4. Separate Cost Intelligence Routes

**Decision:** New `/api/cost/*` routes, separate from `/api/pricing/*`

| Endpoint | Purpose | Data Source |
|----------|---------|-------------|
| `/api/pricing/*` | Model pricing rules + token cost calculation | model_pricing table, token_usage table |
| `/api/cost/*` | Claude Max limits, service costs, projections | token_usage aggregations, service APIs |

**Why:**
- Pricing = rates per token (admin-managed)
- Cost = actual spend (calculated, queryable)
- Clear separation of concerns

### 5. Telegram Alerts Reused

**Decision:** Reuse existing telegram.js for autopilot alerts

**Patterns:**
- Rate limit detected → send Telegram with reset time
- Autopilot paused due to failures → notify user
- Weekly cost threshold crossed → notification

**Not:** New notification system
- Existing telegram.js battle-tested
- User already configured with BOT_TOKEN, CHAT_ID

---

## Migration Path (Ordered by Dependency)

### Phase 1: Foundations (Week 1)

**Add new tables + routes (no autopilot yet)**

1. Extend db.js with 3 new tables:
   - autopilot_state
   - autopilot_execution_log
   - claude_max_usage
   - service_costs
   - claude_max_limits

2. Create routes/cost-intelligence.js:
   - GET /api/cost/claude-max
   - GET /api/cost/services
   - GET /api/cost/projection
   - GET /api/cost/history
   - PUT /api/cost/limits

3. Update server/index.js to register new routes

**Testing:**
```bash
npm run test:server  # Ensure db.js migrations work
curl http://localhost:4820/api/cost/claude-max
```

### Phase 2: React Cost Page (Week 1)

**Add CostIntelligence page, update navigation**

1. Create client/src/pages/CostIntelligence.tsx
   - Display Claude Max progress bar
   - Service cost breakdown
   - Burn rate + projection

2. Update client/src/App.tsx navigation

3. Add cost badge to project cards (GSD.tsx)

**Testing:**
```bash
npm run dev:client
# Navigate to /cost-intelligence, check displays match API
```

### Phase 3: Autopilot Core (Week 2)

**Build AutopilotManager without UI**

1. Create server/gsd/autopilot.js:
   - AutopilotManager class
   - startAutopilot(projectName)
   - watchLoop() polling logic
   - Cost snapshot + delta calculation

2. Create routes/autopilot-control.js:
   - POST /api/autopilot/start
   - POST /api/autopilot/pause
   - POST /api/autopilot/resume
   - GET /api/autopilot/status
   - GET /api/autopilot/execution-log

3. Update server/index.js to start AutopilotManager

**Testing:**
```bash
# Manual test: start autopilot via curl
curl -X POST http://localhost:4820/api/autopilot/start?project=josie

# Check execution log
curl http://localhost:4820/api/autopilot/execution-log/josie
```

### Phase 4: UI Integration (Week 2)

**Wire autopilot buttons + status displays**

1. Update GSD.tsx:
   - Add "Start Autopilot" button on cards
   - Show autopilot status (active/paused/error)
   - Display cost badge + delta during execution

2. Update KanbanBoard.tsx:
   - Show autopilot status indicator on cards

3. Subscribe to WebSocket "autopilot_status_changed" events

**Testing:**
```bash
npm run dev
# Click "Start Autopilot" on a card, watch status update
```

### Phase 5: Polish (Week 3)

**Edge cases, alerts, circuit breaker**

1. Autopilot circuit breaker:
   - Track failure_count in autopilot_state
   - Pause after 3 consecutive failures
   - Send Telegram alert

2. Rate limit handling:
   - Detect rate limit from tmux pane output
   - Backoff exponentially
   - Notify user

3. Cost alerts:
   - Telegram when weekly usage > 80% of limit
   - Warn when daily burn rate would exceed monthly budget

**Testing:**
```bash
npm run test:server
```

---

## Risk Mitigation

### Risk: Autopilot Spam Loop

**Scenario:** Autopilot executes same phase repeatedly, tokens drain

**Mitigation:**
- Circuit breaker: fail_count > 3 → pause + alert
- Track STATE.md hash: only proceed if hash changed
- Timeout: Kill stuck tmux session after 30min of no output

### Risk: Cost Calculation Off

**Scenario:** Double-counting tokens, cost tracking inaccurate

**Mitigation:**
- Token hooks immutable once logged
- Cost snapshots always take from existing db.query()
- Audit log: every cost delta logged with snapshot before/after
- Manual verification: can recalculate from token_usage table anytime

### Risk: Card Refresh Stale After Terminal Close

**Scenario:** User closes terminal, project still shows "waiting" but actually complete

**Mitigation:**
- Refresh STATE.md and redetect session state on every /ws message
- Add explicit "Refresh" button on cards
- Auto-refresh every 30s

### Risk: Autopilot Blocks Manual Control

**Scenario:** User wants to send Ctrl+C, but autopilot still sending commands

**Mitigation:**
- Separate tmux session: autopilot can't interfere
- "Pause Autopilot" button kills gsd-autopilot-{projectName} session
- WebSocket broadcast ensures UI shows pause immediately

---

## Suggested Build Order (for implementation team)

1. **Database schema** (1 day)
   - Add 4 new tables to db.js
   - Test migrations work cleanly

2. **Cost routes** (1 day)
   - `/api/cost/claude-max` working
   - `/api/cost/services` skeleton (returns hardcoded values)

3. **CostIntelligence page** (1 day)
   - React component displays mock data
   - Wire to real API

4. **Autopilot manager** (2 days)
   - AutopilotManager class + watchLoop
   - tmux spawning, command sending, output capture

5. **Autopilot routes** (1 day)
   - /api/autopilot/* endpoints
   - WebSocket broadcast integration

6. **UI wiring** (1 day)
   - GSD card buttons
   - Status displays
   - Cost badges

7. **Polish & testing** (2 days)
   - Circuit breaker
   - Rate limit handling
   - Cost alerts
   - Manual testing on real projects

**Total:** ~2 weeks for v3.0 core features

---

## Open Questions Requiring Phase-Specific Research

1. **Autopilot command syntax:** Exact GSD CLI flags for plan-all vs plan-phase
   - Need to verify `/gsd:plan-all` exists or if it's `/gsd:plan --phase=all`
   - Check GSD docs for exact command surface

2. **STATE.md completion detection:** What marks a phase as "complete"?
   - Is it `status: complete` in STATE.md?
   - Or a check mark in ROADMAP.md?
   - Need to verify across different projects (josie, debates, reforma)

3. **Rate limit message patterns:** Exact Claude/Anthropic error formats
   - Current regex patterns in tmux.js may need adjustment
   - Test against real rate limit messages

4. **Railway cost API:** Does Railway expose usage/cost programmatically?
   - May need fallback to manual receipt ingestion
   - Could defer to Phase future work

5. **External service APIs:** GitHub, OpenAI (if used) cost tracking
   - Determine if APIs exist or if cost is always estimated
   - Defer GitHub integration if not straightforward

6. **Token limit values:** What are actual Claude Max limits?
   - Anthropic policy may have changed
   - Verify 4M monthly, 12M weekly from latest docs
   - Add configuration UI if limits change

---

## Sources & References

- **GSD Autopilot reference:** [github.com/nine-one-six-systems/gsd-autopilot](https://github.com/nine-one-six-systems/gsd-autopilot)
- **Claude Code autonomous patterns:** [Anthropic engineering blog](https://www.anthropic.com/engineering/claude-code-auto-mode) — Auto Mode permission delegation
- **GSD meta-prompting system:** [gsd-build/gsd-2](https://github.com/gsd-build/gsd-2) — Phase planning, spec-driven development
- **Existing dashboard codebase:** `/data/home/gsddashboard/server/` — tmux.js, readers.js, pricing.js patterns
