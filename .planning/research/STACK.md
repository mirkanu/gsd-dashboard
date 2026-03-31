# Stack Research: GSD Autopilot & Cost Intelligence

**Domain:** Autonomous workflow execution controller + multi-service cost aggregation
**Researched:** 2026-03-31
**Confidence:** HIGH (Claude API endpoints official, job scheduling mature, email parsing established)

## Executive Summary

v3.0 adds three new capabilities to the existing Express + SQLite + React stack:

1. **GSD Autopilot** — autonomous plan-all → execute-all loop, requires lightweight job scheduling (no Redis/MongoDB needed)
2. **Claude Max usage tracking** — Admin API cost/usage endpoints with organization-level access control
3. **External service cost monitoring** — Railway API + GitHub billing API + receipt email parsing

**Key decision:** Use lightweight, in-process job scheduling (node-cron or Bree) instead of distributed queue systems. Autopilot is single-machine (local development controller), not a horizontally-scaled service. No new database tables needed — reuse existing SQLite schema.

---

## Recommended Stack

### Core Technologies (New)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **node-cron** | ^3.0.2 | Autonomous task scheduling for GSD plan/execute loop | Mature, no external dependencies (no Redis/MongoDB), simple GNU cron syntax, synchronous execution suitable for sequential GSD phases. Runs in main thread, sufficient for single-machine autopilot. |
| **Anthropic Admin API** | v2023-06-01 | Claude API usage/cost tracking | Official endpoint for organization-level billing data. Requires `sk-ant-admin...` key (organization admin only). Returns token counts, cost breakdowns by model/workspace, 5-minute data freshness. |
| **mailparser** | ^3.6.0 | Receipt email parsing for cost ingestion | Industry-standard MIME parser handles large emails (100MB+), extracts attachments. Low overhead, works with imap/pop3 adapters. Alternative: AgentMail for managed solution, but overkill for single-user dashboard. |
| **node-fetch** (or built-in fetch) | Node.js 18+ | HTTP client for Railway API, GitHub API | Already available in Node 18+. Simple, no additional dependency. |

### Supporting Libraries (New)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **simple-cron** (alternative) | ^1.0.0 | Alternative to node-cron if you need fewer features | Only if node-cron feels bloated; simpler API, less active maintenance. NOT recommended unless you have specific constraints. |
| **node-schedule** | ^2.1.0 | Alternative task scheduler with richer syntax | More powerful than node-cron, supports date/time/recurrence patterns. Use ONLY if you need complex scheduling (e.g., "every 2nd Tuesday"). For simple "every 30 minutes", node-cron is sufficient. |
| **axios** | ^1.7.0 | Optional HTTP client wrapper (convenience) | If you prefer axios's interceptor/timeout syntax over node-fetch. NOT required — use built-in fetch to reduce dependencies. |
| **dotenv** | ^16.4.0 | Environment variable management for API keys | Already likely in use; ensure it's in package.json for Admin API key (`CLAUDE_ADMIN_API_KEY`). |

### Database Schema (SQLite Extension — No New Tables)

Reuse existing better-sqlite3 with schema additions:

```sql
-- Track Claude API usage from Admin API polls
CREATE TABLE IF NOT EXISTS claude_api_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  bucket_date TEXT NOT NULL,  -- ISO date YYYY-MM-DD
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_claude_usage_date ON claude_api_usage(bucket_date DESC);

-- Track external service costs
CREATE TABLE IF NOT EXISTS external_service_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,  -- 'railway', 'github', 'openai', etc.
  cost_usd REAL NOT NULL,
  billing_period TEXT,     -- e.g., "2026-03" for monthly
  details TEXT,           -- JSON: {plan: "pro", usage: {...}}
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_service_costs_service ON external_service_costs(service, billing_period DESC);

-- Track GSD autopilot execution runs
CREATE TABLE IF NOT EXISTS autopilot_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT CHECK(status IN ('running', 'success', 'failed', 'paused')),
  phase_outputs TEXT,     -- JSON array of {phase_name, result, duration_ms}
  error_message TEXT,
  triggered_by TEXT,      -- 'schedule', 'manual', 'webhook'
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_autopilot_project ON autopilot_runs(project, completed_at DESC);
```

### External APIs (No Local Installation)

| API | Authentication | Purpose | Rate Limits |
|-----|-----------------|---------|------------|
| **Anthropic Admin API** | `sk-ant-admin...` API key | Fetch `/v1/organizations/usage_report/messages` and `/v1/organizations/cost_report` | 1 request/min recommended for polling; 5-min data freshness |
| **Railway API** | Bearer token (`railway_prod_...`) | `GET /v1/billing/usage` for resource costs | Standard rate limits; check Railway docs |
| **GitHub REST API** | Personal access token (classic or fine-grained) | `GET /repos/{owner}/{repo}/git/refs` for usage, `GET /user/billing/actions` for usage | 5,000 requests/hour (standard), 15,000 (authenticated) |
| **OpenAI API** | Bearer token | `GET /v1/dashboard/billing/usage?start_date=...&end_date=...` | Check OpenAI docs; typically generous for billing queries |

---

## Installation

```bash
# Core task scheduling
npm install node-cron@^3.0.2

# Email parsing (for receipt ingestion)
npm install mailparser@^3.6.0

# Existing stack already provides:
# - express (API routes for new endpoints)
# - better-sqlite3 (cost tracking storage)
# - ws (WebSocket for real-time cost updates)
# - dotenv (API key management)

# Dev dependencies (optional, for testing)
npm install -D node-mocks-http@^1.13.0
```

**No breaking changes** — all new dependencies are additive. Existing API routes, database, and frontend remain untouched.

---

## New API Routes (Integration Points)

### GSD Autopilot Controller

```javascript
// POST /api/autopilot/start?project=PROJECT_NAME
// Manually trigger autonomous plan → execute loop for a project
// Payload: { max_phases?: 5, timeout_minutes?: 60 }
// Response: { run_id, started_at, status: 'running' }

// GET /api/autopilot/runs?project=PROJECT_NAME
// List past autopilot execution runs
// Response: { runs: [...], current_run?: {...} }

// GET /api/autopilot/status/:runId
// Poll status of a single autopilot run
// Response: { run_id, status, phases_completed, error, updated_at }

// POST /api/autopilot/pause/:runId
// Pause a running autopilot
// Response: { run_id, status: 'paused' }
```

### Claude API Usage Tracking

```javascript
// GET /api/costs/claude-usage?days=7
// Fetch Claude API usage from Admin API, cache in SQLite
// Response: { daily: [{date, input_tokens, output_tokens, cost_usd, model}], total_cost_usd }

// GET /api/costs/claude-limits
// Check Claude Max subscription limits (requires research)
// Response: { max_5x_hours: 140-280, max_20x_hours: 240-480, used_hours, window_type: 'rolling_5h' }

// GET /api/costs/external-services
// Aggregate Railway, GitHub, OpenAI, other services
// Response: { services: [{name, cost_usd, billing_period, last_updated}], total_monthly_usd }
```

### Email Receipt Ingestion (Deferred to Future Milestone)

```javascript
// POST /api/costs/ingest-receipt
// Parse attached email receipt, extract cost data
// Payload: { email_raw: "...", service: "railway|github|openai" }
// Response: { extracted_cost_usd, service, billing_period, confidence }
// (Currently scaffolding only — full implementation in v3.1 or later)
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative | Notes |
|-------------|-------------|-------------------------|-------|
| **node-cron** | **Bree** | If you need: worker threads for CPU-intensive jobs, advanced concurrency, long-running job isolation | Bree launches separate worker processes, heavier overhead. Overkill for simple GSD orchestration (plan-all → execute is sequential, not parallel). |
| **node-cron** | **node-schedule** | If you need: rich date/time patterns, recurring schedules across timezones | node-schedule more powerful, but added complexity. node-cron's GNU syntax sufficient for "every 30 minutes" or "at 2 AM daily". |
| **node-cron** | **BullMQ (Redis-backed)** | If you need: distributed execution, job persistence across restarts, horizontal scaling | Requires external Redis service. GSD autopilot runs on single machine (developer's local). No need for distributed state. |
| **Built-in fetch** | **axios** | If you prefer: interceptors, automatic JSON serialization, timeout middleware | axios adds ~30KB. Node 18+ fetch is sufficient and reduces dependencies. Use fetch unless you already have axios. |
| **mailparser** | **AgentMail (managed)** | If you want: full inbox management, semantic search, automated threading | AgentMail is SaaS, requires paid plan. mailparser is library — parse emails you already have (e.g., from Gmail API). Simpler for single-user dashboard. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Redis-backed queues** (Bull, BullMQ, RQ) | GSD autopilot runs locally on single machine; Redis adds operational overhead, requires container orchestration | **node-cron** for simple scheduling; Bree if you need worker threads |
| **MongoDB/Agenda scheduler** | Adds external dependency, persistence overhead. Better-sqlite3 already in use. | **SQLite for cost tracking** (already done); node-cron for task scheduling |
| **Full workflow engines** (Temporal, Prefect, Airflow) | Enterprise-scale; overkill for single developer running 1-2 projects at a time. Complex learning curve. | **node-cron + simple Express routes** for autopilot orchestration |
| **RabbitMQ/Kafka event streaming** | Premature optimization. Single machine doesn't need message broker. | **WebSocket broadcasts to React frontend** (already in place) for real-time updates |
| **cron system calls** (`node-cron` with bash) | Brittle, platform-dependent, hard to debug, no error handling. | **node-cron native callbacks** for in-process orchestration |
| **Third-party receipt OCR** (AWS Textract, GCP Vision) | Cost, API overhead, latency. Emails have structured cost data already. | **mailparser + regex extraction** for typical SaaS invoices |

---

## Stack Patterns by Scenario

### Scenario: Autopilot runs on schedule (every 30 minutes)

```javascript
// Use node-cron
const cron = require('node-cron');

cron.schedule('*/30 * * * *', async () => {
  for (const project of projects) {
    await startAutopilot(project);
  }
});
```

**Why:** Simple, in-process, no external dependencies.

### Scenario: Autopilot triggered manually from dashboard button

```javascript
// Use existing Express route
POST /api/autopilot/start?project=PROJECT_NAME

// Backend spawns GSD plan-all → execute-all loop in background
// Updates autopilot_runs table with status
// Broadcasts progress via WebSocket to React frontend
```

**Why:** Decouples UI from long-running task. WebSocket keeps frontend responsive.

### Scenario: Track Claude Max usage and trigger alerts

```javascript
// Poll Admin API every hour
cron.schedule('0 * * * *', async () => {
  const usage = await fetchClaudeUsage(adminApiKey);
  db.insert('claude_api_usage', usage);

  if (usage.cost_usd > WEEKLY_BUDGET) {
    // Emit alert to dashboard
    broadcast({ type: 'budget_alert', cost: usage.cost_usd });
  }
});
```

**Why:** Admin API is official, requires org admin key. Cache results in SQLite to avoid repeated API calls.

---

## Version Compatibility

| Package | Required Node Version | Conflicts | Notes |
|---------|----------------------|-----------|-------|
| **node-cron@^3.0.2** | >=14.0.0 | None known | Active maintenance, 2024+ releases |
| **mailparser@^3.6.0** | >=12.0.0 | None known | Depends on streaming-mime-parser |
| **better-sqlite3** | >=14.21.0 | None with cron/mailparser | Already in use; synchronous API plays well with node-cron |
| **Node 18+ fetch** | >=18.0.0 | N/A | Removes need for node-fetch dependency |

---

## Configuration (Environment Variables)

Add to `.env` or Docker/Railway environment:

```bash
# Anthropic Admin API (organization-level key, not user API key)
CLAUDE_ADMIN_API_KEY=sk-ant-admin-...
CLAUDE_ORG_ID=org-...

# External service APIs (optional if not tracking those services)
RAILWAY_API_TOKEN=railway_prod_...
GITHUB_API_TOKEN=ghp_...
OPENAI_API_TOKEN=sk-...

# Autopilot configuration
AUTOPILOT_SCHEDULE="*/30 * * * *"    # every 30 minutes
AUTOPILOT_MAX_PHASES=5               # stop after N phases
AUTOPILOT_TIMEOUT_MINUTES=120
AUTOPILOT_ENABLED=true

# Cost tracking
COST_FETCH_SCHEDULE="0 * * * *"      # hourly
WEEKLY_BUDGET_LIMIT_USD=500
```

---

## Testing & Verification

### Unit Tests

```bash
# Test node-cron scheduling logic
npm run test:server -- --grep "autopilot"

# Test Admin API client (mock fetch)
npm run test:server -- --grep "claude-usage"

# Test mailparser integration
npm run test:server -- --grep "email-receipt"
```

### Integration Tests

```bash
# Spin up local SQLite, verify cost tracking writes to DB
npm run dev

# Manual: Trigger autopilot from dashboard, verify runs table
# Manual: Check Claude Admin API response format against official docs
```

### Deployment Checklist

- [ ] CLAUDE_ADMIN_API_KEY set in Railway environment (test with `/api/costs/claude-usage`)
- [ ] node-cron schedule syntax validated (test with crontab.guru)
- [ ] Autopilot runs table created in SQLite (migration in db.js)
- [ ] WebSocket broadcasts working for autopilot progress
- [ ] Claude Max limits endpoint verified against current API docs (may change)

---

## Known Limitations & Risks

### Admin API Key Exposure

**Risk:** CLAUDE_ADMIN_API_KEY is organization-level admin secret. If exposed, attacker can read entire org's usage/costs.

**Mitigation:**
- Store in Railway secrets (never in `.env` file)
- Log access to sensitive endpoints (POST /api/costs/...)
- Consider rate-limiting cost endpoints to dashboard user only
- Rotate key quarterly

### Claude Max Limits Not Publicly Documented

**Risk:** Claude Max has 5-hour rolling window + 7-day weekly limits, but "5x" and "20x" hour allocations aren't in official API. May need to reverse-engineer from `/stats` in Claude.ai.

**Status:** Currently research-only. May require reading from Claude Code session logs or user documentation.

**Recommended approach:** v3.0 tracks API usage (tokens, cost); v3.1 can add Max subscription limits once API stabilizes.

### Email Receipt Parsing Deferred

**Risk:** Parsing SaaS invoices is fragile — layouts vary per service, formats change.

**Status:** Scaffolding only in v3.0. Full implementation (mailparser + regex rules per service) deferred to v3.1.

**Alternative:** Continue manual entry in dashboard UI; email parsing as convenience feature later.

---

## Integration with Existing Stack

### Express Server

- Add new routes to `server/routes/autopilot.js`, `server/routes/costs.js`
- Integrate node-cron scheduler in `server/index.js` startup
- Reuse existing `db` and WebSocket broadcast for updates

### SQLite Database

- Add schema migration in `server/db.js` (like existing token_usage migrations)
- No schema conflicts with existing tables

### React Frontend

- Add "Costs" page to dashboard navigation
- Add "Autopilot" card to project cards (current state, next run, manual trigger button)
- Consume new WebSocket events: `autopilot_start`, `autopilot_complete`, `cost_alert`
- Use existing `<Card>` and skeleton components from shadcn

### MCP Server

- Optionally expose `/tools/trigger-autopilot` for Claude Desktop integration
- Expose `/tools/query-costs` for cost queries from Claude Code
- (Non-blocking for v3.0 core features)

---

## Sources

- [Anthropic Usage and Cost API](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api) — Official Admin API endpoints, authentication, examples (HIGH confidence)
- [node-cron NPM](https://www.npmjs.com/package/node-cron) — Scheduling library, v3.0.2 current release (HIGH confidence)
- [mailparser GitHub](https://github.com/nodemailer/mailparser) — Email MIME parsing, v3.6.0 active maintenance (HIGH confidence)
- [Railway API Docs](https://docs.railway.com/integrations/api) — Cost tracking endpoints (HIGH confidence)
- [GitHub REST API Billing](https://docs.github.com/en/rest/billing) — Recent API additions March 2026, usage reporting (HIGH confidence)
- [BullMQ vs node-cron Comparison](https://judoscale.com/blog/node-task-queues) — Job queue alternatives, when to use each (MEDIUM confidence — not official, but credible blog)
- [Bree Task Scheduler](https://jobscheduler.net/) — Worker thread-based alternative (MEDIUM confidence — less popular than node-cron)

---

**Stack research for:** GSD Dashboard v3.0 (Autopilot & Cost Intelligence)
**Researched:** 2026-03-31
**Next steps:** Architecture phase to detail system boundaries, error handling, API contract changes
