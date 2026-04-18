# AUDIT-CLN-05 — Dead Route + Schema Cleanup

**Audited:** 2026-04-18
**Author:** Plan 50.5-03

## Routes audited

### server/routes/agents.js

**Endpoints enumerated:**
- `GET /api/agents` — list agents with optional status/session filters
- `GET /api/agents/:id` — get single agent by ID
- `POST /api/agents` — create agent
- `PATCH /api/agents/:id` — update agent

**Grep command + result:**
```bash
grep -rn "/api/agents" client/ server/ mcp/ scripts/ .claude/ \
  --include='*.js' --include='*.ts' --include='*.tsx' --include='*.json' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.planning \
  | grep -v "server/routes/agents.js:" | grep -v "test"
```

**Caller inventory:**
1. **MCP tools (LIVE):** `mcp/src/tools/domains/agent-tools.ts` lines 23, 42, 62, 93 — registers 4 MCP tools that call `/api/agents` endpoints:
   - `dashboard_list_agents` → GET /api/agents
   - `dashboard_get_agent` → GET /api/agents/:id
   - `dashboard_create_agent` → POST /api/agents
   - `dashboard_update_agent` → PATCH /api/agents/:id

2. **MCP observability:** `mcp/src/tools/domains/observability-tools.ts` line 65, 68 — uses `GET /api/agents` within dashboard session monitoring tool

3. **Server tests:** `server/__tests__/api.test.js` — unit test coverage for all CRUD operations

**Classification:** **LIVE — MCP actively exposes agent management tools to Claude Code sessions. Agents table feeds subagent hierarchy tracking, state machine (idle/connected/working/completed), and parent-agent relationships.**

**Decision:** KEEP — agents route is a critical part of the MCP dashboard tool surface.

---

### server/routes/events.js

**Endpoints enumerated:**
- `GET /api/events` — list events with optional session filter + pagination
- (Only endpoint in the route)

**Grep command + result:**
```bash
grep -rn "/api/events" client/ server/ mcp/ scripts/ .claude/ \
  --include='*.js' --include='*.ts' --include='*.tsx' --include='*.json' \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.planning \
  | grep -v "server/routes/events.js:" | grep -v "test"
```

**Caller inventory:**
1. **MCP tools (LIVE):** 
   - `mcp/src/tools/domains/event-tools.ts` line 22 — registers `dashboard_list_events` tool that calls `GET /api/events`
   - `mcp/src/tools/domains/observability-tools.ts` line 61 — uses `GET /api/events` in session monitoring

2. **Server tests:** `server/__tests__/api.test.js` — unit test coverage

**Classification:** **LIVE — MCP exposes event listing to Claude Code sessions for session transcript inspection and debugging.**

**Decision:** KEEP — events route is required by MCP observability tools.

---

## Tables audited

### agents

**Write/read sites:**
- `server/db.js` line 51-66: CREATE TABLE IF NOT EXISTS agents (table schema)
- `server/db.js` line 480-481: `insertAgent` prepared statement
- `server/db.js` line 483-484: `updateAgent` prepared statement
- `server/db.js` line 472: `getAgent` prepared statement
- `server/db.js` line 473-478: `listAgents*` prepared statements (3 variants)
- `server/db.js` line 486-487: `reactivateAgent` prepared statement
- `server/routes/agents.js`: All 4 route endpoints use agents table via prepared statements
- `server/routes/hooks.js` line 119-192: **HEAVY USE** — `insertAgent` on session init, subagent creation; `updateAgent` on tool execution, completion
- `server/routes/hooks.js` line 206-228: Tool lifecycle hooks write agent state
- `server/routes/sessions.js` line 24: `listAgentsBySession` — session detail fetches agents
- `server/index.js` line 187-191: Startup cleanup marks orphaned agents as completed on stale sessions
- `server/index.js` line 214: Compaction import fetches agent by ID

**Classification:** **LIVE — agents table is actively populated during hook ingestion (every tool call updates agent state) and read by sessions, hooks, and startup cleanup. Zero evidence of abandonment.**

**Decision:** KEEP — central to agent lifecycle tracking.

---

### events

**Write/read sites:**
- `server/db.js` line 68-79: CREATE TABLE IF NOT EXISTS events (table schema)
- `server/db.js` line 499-500: `insertEvent` prepared statement
- `server/db.js` line 502-504: `listEvents*` prepared statements (2 variants)
- `server/db.js` line 506-510: `countEvents*` prepared statements (3 variants: all, since timestamp, today)
- `server/db.js` line 512-626: Events table queried in stats, tool usage, daily counts, event type distribution, avg events per session
- `server/routes/hooks.js` line 425, 468: **HEAVY USE** — `insertEvent` on every hook event (PreToolUse, PostToolUse, CompactionAnalysis, etc.)
- `server/routes/hooks.js` line 389-451: Event insertion with compaction transcript tracking
- `server/routes/settings.js` line 27-28: Event counts in stats summary
- `server/routes/settings.js` line 92, 162, 226: Export/cleanup delete events
- `server/routes/settings.js` line 195: Query to check if session has recent events
- `server/routes/sessions.js` line 25: `listEventsBySession` — session detail shows event log
- `server/routes/stats.js` line 12: `countEventsToday` — dashboard stats
- `server/index.js` line 201: Periodic maintenance scans active sessions' transcript paths in events table
- `mcp/src/tools/domains/event-tools.ts`: MCP tool queries events

**Classification:** **LIVE — events table is the core transcript ledger. Every hook event (tool start/end, compaction analysis, etc.) inserts a row. Read for session history, stats, and MCP observability.**

**Decision:** KEEP — essential for session transcript and audit trail.

---

### token_usage

**Write/read sites:**
- `server/db.js` line 81-90: CREATE TABLE IF NOT EXISTS token_usage (table schema with model column)
- `server/db.js` line 523-530: `upsertTokenUsage` — incremental token count updates
- `server/db.js` line 532-550: `replaceTokenUsage` — full token state after compaction
- `server/db.js` line 552-567: `getTokenTotals`, `getTokensBySession` — query token usage
- `server/db.js` line 257-271: Compaction baseline columns (baseline_input, baseline_output, baseline_cache_read, baseline_cache_write)
- `server/db.js` line 274-283: last_input_tokens column for context window tracking
- `server/routes/hooks.js` line 451: `replaceTokenUsage` on hook events that include CompactionAnalysis
- `server/routes/analytics.js` line 7: `getTokenTotals` — dashboard usage stats
- `server/routes/pricing.js` line 102, 112, 143, 208, 263: Extensive use for cost calculation by model and session
- `server/routes/gsd.js` line 108: `context_tokens` subquery for project card metadata
- `server/routes/settings.js` line 27-28, 92, 163, 176, 224, 231: Export/cleanup operations
- **No MCP callers found** — token_usage is internal analytics table, not exposed via MCP tools

**Classification:** **LIVE — actively updated on hook events; consumed by analytics, pricing, and GSD project routes for cost tracking and context window monitoring.**

**Decision:** KEEP — essential for cost tracking and analytics.

---

## Preserved (CONTEXT.md allowlist — reaffirmed)

The following tables are NOT touched and remain untouched:
- `sessions` — core session lifecycle (kept, actively used)
- `project_tasks` — project task management (kept, actively used)
- `external_service_costs` — service cost tracking (kept, Phase 45 addition)
- `service_mapping_rules` — email → project mapping (kept, Phase 45 addition)
- `manual_cost_entries` — user-entered cost records (kept, Phase 45 addition)
- `app_settings` — encrypted app credential storage (kept, Phase 45 addition)
- `autopilot_runs` — Phase 24 autopilot execution tracking (kept, may be used in Phase 53 retry work)
- `process_registry` — Phase 24 subprocess tracking (kept, autopilot support)
- `model_pricing` — LLM pricing configuration (kept, actively used for cost calc)
- `claude_api_usage` — Phase 24 API usage ledger (kept, autopilot cost tracking)
- `classifier_feedback` — unused but low cost; kept for future work
- `classifier_overrides` — unused but low cost; kept for future work
- `processed_emails` — Phase 45 Pipedream email dedup ledger (kept, active)
- `project_settings` — Phase 42 per-project configuration (kept, actively used)
- `gsd_messages` — Phase 23 message history (kept, feeds portfolio feed views)

---

## Summary

- **Routes to delete:** NONE — Both agents.js and events.js are actively called by MCP tools that Claude Code sessions depend on.
- **Tables to drop:** NONE — All three candidate tables (agents, events, token_usage) are actively written and read by core server subsystems.
- **Risk notes:** 
  - Agents route depends on agents table (subagent hierarchy, state machine).
  - Events route depends on events table (session transcript, audit trail).
  - Token_usage is internal but essential for cost analytics + pricing calculations.
  - MCP tool surface (agent-tools.ts, event-tools.ts, observability-tools.ts) is active and in use — deleting routes would break Claude Code sessions that call these tools.

**Conclusion:** No deletions recommended. All routes and tables audited have live callers and are essential for MCP, analytics, and core dashboard functionality. CLN-05 objectives cannot be met without breaking the MCP tool surface.

---

*Audit prepared by Plan 50.5-03 executor on 2026-04-18*
