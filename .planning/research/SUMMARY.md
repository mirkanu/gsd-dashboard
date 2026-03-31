# Project Research Summary: GSD Dashboard v3.0

**Project:** GSD Dashboard v3.0 — Autopilot & Cost Intelligence
**Domain:** Autonomous workflow execution controller + multi-service cost aggregation
**Researched:** 2026-03-31
**Confidence:** HIGH

---

## Executive Summary

GSD Dashboard v3.0 adds autonomous execution and cost intelligence to an existing Express + React + SQLite dashboard that monitors Claude Code workflows. The core capability is **GSD Autopilot** — a hands-off plan-all → execute-all loop that chains GSD phases automatically without human intervention — plus **cost tracking** across Claude Max, external services (Railway, GitHub, OpenAI), and projected spending.

The recommended approach reuses existing patterns: Autopilot spawns tmux sessions like the terminal already does, monitors STATE.md files like readers.js already does, and broadcasts updates via WebSocket like the existing analytics page does. This is **composition + orchestration**, not architectural redesign. The critical difference from v2.x is adding **safety mechanisms first**: cost ceilings, loop counters, token meters, and circuit breakers must ship with Autopilot or the feature becomes dangerous to use (infinite token drain is a real risk documented in production AI agent systems).

**Key risk:** Runaway execution loops can escalate token consumption from normal ($5/hour) to ruinous ($500+/hour) in minutes. Prevention requires hard cost limits enforced before execution starts, real-time token monitoring, and a circuit breaker that stops retrying after N failures. Without these guardrails, v3.0 is a liability, not a feature.

---

## Key Findings

### Recommended Stack

v3.0 adds minimal new dependencies to the existing stack. No Redis, MongoDB, or distributed queues needed — a single-machine Autopilot controller fits the use case perfectly.

**Core new technologies:**
- **node-cron** (^3.0.2): Lightweight in-process job scheduling (GNU cron syntax). Sufficient for "autopilot check every 5 minutes" and "fetch costs hourly." No external services.
- **Anthropic Admin API** (v2023-06-01): Official organization-level usage/cost tracking. Requires `sk-ant-admin-...` key (org admin only). Returns token counts, cost breakdowns by model/workspace, 5-minute data freshness.
- **mailparser** (^3.6.0): Email MIME parser for future receipt ingestion (deferred to v3.1, scaffolding in v3.0). Handles SaaS invoice parsing from emails.
- **Node.js 18+ native fetch**: Replaces need for axios or node-fetch; already available.

**Database extensions (SQLite):**
- `claude_api_usage`: Daily token consumption and cost per model
- `external_service_costs`: Railway, GitHub, OpenAI costs with billing period
- `autopilot_runs`: Execution history (started_at, status, phase outputs, errors)

**No new external services.** Autopilot is single-machine, so no need for Redis-backed queues, Temporal, or distributed schedulers.

### Expected Features

**Table stakes (v3.0 must have — all five are required together):**
1. **Autopilot execution loop** — Plan-all → execute-all → verify → next phase, autonomous
2. **Pause/Resume from dashboard** — User override without SSH; state persists on disk
3. **Session/Weekly token limits** — Claude Max tracking (88K / 5-hour window, 12M / 7-day week); real-time display
4. **Waiting state accuracy** — Distinguish "blocked on human input" (pause autopilot) vs. "agent thinking" (continue)
5. **Failure detection & circuit breaker** — Stop after 3 consecutive failures; alert user; allow manual resume

These five form a dependency chain: Autopilot without pause is uncontrollable. Pause without waiting accuracy causes false pauses. Autopilot without token limits burns budget. Without circuit breaker, failures cascade infinitely. **All five must launch together or autopilot is unsafe.**

**Differentiators (v3.1, can defer):**
- Failure learning: Auto-fix common errors with adjusted prompts
- External services cost page: Unified Railway + GitHub + Claude visibility
- Real-time cost alerts: Proactive warnings before limit hits
- Dynamic GSD shortcuts: Suggest next command based on phase state

**Anti-features (don't build):**
- Auto-fix forever (masks real blockers, token waste)
- Pause entire project hierarchy (complex state, risky)
- Predict phase completion time (non-deterministic, unreliable)
- Cost limits that auto-downgrade model (quality drops)

### Architecture Approach

v3.0 integrates cleanly into existing architecture by extending proven patterns. No fundamental redesign needed.

**Autopilot Controller** (NEW):
- Spawns tmux session `gsd-autopilot-{projectName}` (like existing terminal.js)
- Watches `.planning/STATE.md` for phase completion (like existing readers.js)
- Chains `/gsd:plan-phase` → `/gsd:execute-phase` commands sequentially
- Tracks failure count per phase; pauses at 3 failures
- Reports progress via WebSocket (like existing analytics broadcasts)

**Cost Intelligence Module** (NEW):
- Queries Anthropic Admin API every 6 hours; caches in SQLite (prevent rate limit)
- Aggregates token_usage table for Claude Max session/weekly usage
- Polls Railway/GitHub APIs for external service costs (if APIs exist; defer if not)
- Calculates burn rate (tokens/day) and days until monthly limit
- Displays on new React page with warning colors (green/yellow/red by usage %)

**Integration Points:**
- Existing `gsd/tmux.js` + `gsd/readers.js` reused by Autopilot
- Existing token_usage schema extended with claude_api_usage table
- Existing /ws WebSocket reused for autopilot status broadcasts
- New routes: `/api/autopilot/*` (control) and `/api/cost/*` (queries)
- New table: `autopilot_runs` for execution audit trail

**Build order (implementation):**
1. Add 4 new SQLite tables
2. Create `/api/cost/*` routes (Claude Max stats, service breakdown, projection)
3. Build CostIntelligence React page
4. Build AutopilotManager class + watchLoop (state monitoring)
5. Wire /api/autopilot/* routes (start/pause/resume/status)
6. Add UI buttons and status displays on project cards
7. Polish: circuit breaker, rate limit handling, alerts

### Critical Pitfalls

The research identified **7 critical pitfalls** that must be prevented before launch:

1. **Runaway Execution Loop (Infinite Cost Escalation)**
   - **What happens:** Autopilot enters undetected infinite cycle; token consumption explodes from $5/hour to $500+/hour in minutes.
   - **Prevention:** Hard cost ceiling per project (enforce before execution), loop step counter (max 20 plan-execute cycles), token meter with real-time alert if TPM exceeds 3× normal, per-phase timeouts (30 min), idempotency checks.
   - **Status:** GATING REQUIREMENT — must implement before any Autopilot is enabled.

2. **Claude Max Weekly Limit Exhaustion (Silent Degradation)**
   - **What happens:** Autopilot runs Mon-Thu, fails silently Fri when weekly limit hits. Dashboard shows "Waiting" (user thinks paused), actually deadlocked.
   - **Prevention:** Query Usage API at startup; calculate remaining weekly budget. Display prominently with color coding. Pre-check before each execution: "remaining > estimated_cost + 20% buffer?"
   - **Status:** PHASE 1 REQUIREMENT — dashboard cannot trust Autopilot without this.

3. **Race Condition on Concurrent Projects (State Corruption)**
   - **What happens:** Multiple autopilot loops write `.planning/` state simultaneously; one write lost; state becomes inconsistent; project A thinks phase done, B thinks pending.
   - **Prevention:** File locking with timeout on state writes. Atomic writes with version/timestamp checking. Dashboard as read-only observer (only GSD engine writes). Per-project mutex.
   - **Status:** PHASE 1 REQUIREMENT for 6-project concurrency.

4. **Dashboard as Single Point of Failure (UI Timeout)**
   - **What happens:** Long-running phase (15+ min) blocks Express event loop; all dashboard requests hang; user can't check status, pause, or view other projects.
   - **Prevention:** Spawn GSD commands detached with `{ detached: true }`. Track in SQLite `autopilot_jobs` table. Status endpoint returns immediately (no blocking). Separate worker thread polls job completion async.
   - **Status:** PHASE 1 REQUIREMENT — blocking UI is unacceptable.

5. **Cost API Rate Limits (Cascading Failure)**
   - **What happens:** Anthropic Usage API has undisclosed rate limits (~100 req/hr estimated). If dashboard queries too frequently or multiple instances run, API rejects with 429. Cost display becomes stale/wrong.
   - **Prevention:** SQLite cache with 6-hour TTL. Request deduplication (multiple simultaneous requests wait for first). Manual refresh with 60s frontend + 5min backend backoff. Graceful degradation (show cache if API down).
   - **Status:** PHASE 2 (Cost Intelligence) REQUIREMENT.

6. **Stale Cost Data Masking Real Problems (Decision Paralysis)**
   - **What happens:** Cost data is 4 hours old. User enables autopilot thinking "I have $200 budget left" but actually spent $50 since last update.
   - **Prevention:** Cost timestamp on every display ("Updated: 4h ago"). Color-code freshness (green <1h, yellow 1-6h, red >6h). Real-time token meter for active sessions. Disable Autopilot button if cost >6h stale.
   - **Status:** PHASE 2 REQUIREMENT.

7. **Process Orphaning & Resource Leaks (Memory Exhaustion)**
   - **What happens:** Autopilot spawns GSD processes; if parent crashes, children become orphans. Over weeks, 50+ orphans accumulate; each 50MB RAM; 2.5GB total; container OOM.
   - **Prevention:** SQLite process tracking by PID. Heartbeat mechanism (parent writes heartbeat every 60s; if no heartbeat for 5 min, parent dead). Explicit cleanup on shutdown (signal handlers). Periodic audit every 30 min; kill stale processes.
   - **Status:** PHASE 1 REQUIREMENT.

---

## Implications for Roadmap

### Suggested Phase Structure

**Phase 1: Autopilot Foundation + Safety Mechanisms** (2 weeks)

**Rationale:** Autopilot is useless without safety guardrails. Cost ceilings, token meters, circuit breakers, and process tracking must ship with the feature or risk catastrophic token burn. Database extensions and cost API routes must be in place before any autonomous loop runs.

**Delivers:**
- SQLite schema extensions (4 new tables): autopilot_runs, claude_api_usage, external_service_costs, service_costs
- Cost Intelligence routes: `/api/cost/claude-max`, `/api/cost/services`, `/api/cost/projection`, `/api/cost/history`
- AutopilotManager class with watchLoop, state monitoring, cost tracking, failure counter
- Autopilot control routes: `/api/autopilot/start`, `/api/autopilot/pause`, `/api/autopilot/resume`, `/api/autopilot/status`
- Safety mechanisms: hard cost ceiling (enforced before execution), loop counter (max 20 replans), TPM alert (>3× normal for 2+ min), per-phase timeout (30 min), idempotency guard
- File locking on `.planning/` state writes with atomic move + version checking
- Detached process spawning; job tracking in SQLite; async status endpoint (no blocking)
- Process tracking and orphan audit running every 30 min with heartbeat mechanism
- Weekly budget projection; display with color-coding on dashboard
- Waiting state accuracy fix (distinguish human-blocked vs agent-thinking)

**Features from FEATURES.md:**
- All five table stakes: Autopilot loop, Pause/Resume, Token limits, Waiting accuracy, Circuit breaker

**Pitfalls avoided:**
- Runaway loops (cost ceiling + loop counter + TPM alert)
- Weekly limit exhaustion (budget tracking + pre-check)
- Race conditions (file locking + versioning)
- Dashboard hang (async spawning + job tracking)
- Process orphans (tracking + heartbeat + audit)
- Incomplete phase detection (exit code + marker file + MCP query)

**Phase 1 Checklist:**
- [ ] Database tables created and migrations tested
- [ ] Cost API routes returning real Claude Max usage from Admin API
- [ ] Autopilot manager spawning tmux session and parsing STATE.md
- [ ] Cost ceiling enforced before first GSD command
- [ ] Circuit breaker tested (fail 3 times → pause + alert)
- [ ] File locking working with concurrent writes (6 projects simultaneously)
- [ ] Dashboard status endpoint returns in <1s (async job check, not blocking)
- [ ] Process tracking audit runs; orphans killed within 30 min
- [ ] Weekly budget tracking + color-coded display
- [ ] Manual test: start autopilot on 1 project, verify state updates, cost tracking, pause works

---

**Phase 2: Cost Intelligence UI + External Services** (1-2 weeks)

**Rationale:** With Autopilot foundation stable, surface cost visibility in React UI. Users need to see real-time token consumption, service costs, and warnings before hitting limits. Phase 2 completes the cost intelligence story; not strictly required for basic autopilot but critical for production safety.

**Delivers:**
- CostIntelligence React page: Claude Max progress bar, service breakdown (Railway/GitHub/Claude), burn rate, days-to-limit projection
- Cost history chart (last 30 days, daily breakdown)
- Cost alerts: yellow at 80%, red at 95%, auto-pause at 100%
- External service cost aggregation (attempt Railway API, GitHub API; graceful fallback if unavailable)
- Per-project cost badges on project cards
- Manual cost refresh button with 60s debounce; 6h cache TTL

**Features from FEATURES.md:**
- Session/Weekly token limit tracking (enhanced with UI)
- Real-time cost alerts (WebSocket push when crossing thresholds)
- External services cost page
- Cost visibility prevents budget surprises

**Pitfalls avoided:**
- Stale cost data (timestamp + freshness indicator on every display)
- Cost API rate limits (cache + dedup + graceful degradation)
- Cost estimate inaccuracy (show ranges, not point estimates; per-project history)

**Phase 2 Checklist:**
- [ ] CostIntelligence page displays Claude Max usage with color-coded progress
- [ ] Service costs aggregated and displayed (Claude, Railway, GitHub)
- [ ] Cost freshness indicator on every display (green/yellow/red by age)
- [ ] Manual refresh respects rate limits (60s frontend debounce, 5min backend)
- [ ] Cost API handles 429 gracefully; falls back to cache
- [ ] Burn rate calculation correct; projection matches historical data
- [ ] Project cards show cost delta during active autopilot
- [ ] Telegram alerts sent when crossing thresholds (80%, 95%)
- [ ] Manual test: run autopilot; watch real-time cost update; pause when cost threshold exceeded

---

**Phase 3: UI Polish + Error Recovery** (1 week)

**Rationale:** With core Autopilot and Cost Intelligence working, add UX polish and error recovery flows. Most value from Phases 1–2; Phase 3 addresses edge cases and documentation.

**Delivers:**
- Autopilot confirmation dialog ("Start? Will cost ~$XX from $YYY remaining")
- Clear error messages on failure: "Phase failed after 3 attempts: [reason]. Manual fix required."
- Pause autopilot button visible on active card; shows pause status in real-time
- Clarify "Waiting" state in UI: "Waiting (human input required)" vs "Blocked (phase failed)" vs "Unknown (check logs)"
- Cost breakdown pie chart: which project spent what, phase type breakdown
- Documentation: GSD Autopilot user guide, cost management strategies, limits explanation

**Features from FEATURES.md:**
- P2 features: Failure learning (basic version), dynamic shortcuts (basic), archive all (nice-to-have)

**Pitfalls addressed:**
- UX clarity (waiting state vs blocked vs unknown)
- Error handling clarity (reason + recovery path)
- Cost visualization (per-project attribution, even if concurrent)

**Phase 3 Checklist:**
- [ ] Autopilot start dialog shows estimated cost and remaining budget
- [ ] Error messages include actionable recovery (manual fix link, logs)
- [ ] Pause button on card; label "Paused" shows next to project name
- [ ] State display disambiguates "Waiting", "Blocked", "Unknown"
- [ ] Cost pie chart by project and by phase type
- [ ] User guide explains limits, cost monitoring, when to pause

---

**Phase 4: Failure Learning + Future Enhancements** (Post-v3.0, v3.1+)

**Rationale:** Defer advanced features until Autopilot behavior stabilizes and user patterns emerge. Don't build guesses; build on data.

**Delivers (v3.1):**
- Failure pattern storage: track which phases fail on which projects; build ML classifier
- Auto-retry with adjusted prompts: "Previous attempt failed because [error]. Try: [suggestion]"
- Email receipt parsing: scaffold mailparser integration; parse Railway/GitHub/OpenAI invoices
- Per-project cost budgets: user can define "max $30/week for project X"
- Autopilot profiles: "aggressive retries" vs "conservative" (don't ship, will confuse users)

---

### Phase Ordering Rationale

1. **Phase 1 first:** Safety mechanisms are gating requirements. Without cost ceiling, loop counter, and circuit breaker, Autopilot is a budget-burning liability. Every pitfall research flagged for Phase 1 must be prevented before any autonomous loop is enabled.

2. **Phase 2 second:** Cost Intelligence UI surfaces the safety mechanisms built in Phase 1. Users need visibility to trust Autopilot. Cost freshness indicators, burn rate projections, and threshold alerts make the safety mechanisms visible and usable.

3. **Phase 3 third:** Error recovery and UX polish make Phase 1–2 production-ready. Error messages must be actionable. Waiting states must be clear. Documentation must exist.

4. **Phase 4 deferred:** Learning and advanced features are nice-to-have. Ship Phase 1–3, let users run autopilot for 1–2 weeks, then gather failure patterns for Phase 4.

---

### Research Flags

**Phases requiring deeper research during planning:**

- **Phase 1:** Anthropic Admin API exact rate limits and response format. Docs are sparse. May need to call API in test env to verify token counts, cost breakdowns, and 5-minute freshness claim.

- **Phase 1:** GSD command syntax. Need to verify `/gsd:plan-all` command exists and behavior (does it plan all phases? or is it `/gsd:plan --all`?). Check existing GSD fork + official docs.

- **Phase 1:** STATE.md completion detection. What marks a phase as complete? Is it `status: complete` in STATE.md? Or a check mark in ROADMAP.md? Or `.planning/{phase}/SUMMARY.md` created? Need to verify across 3+ projects (josie, debates, reforma).

- **Phase 2:** Railway API cost endpoint exists and is documented. GitHub API billing endpoint exists. OpenAI API billing endpoint exists. If APIs don't exist, cost aggregation will need fallback (manual receipt ingestion).

- **Phase 2:** Claude Max weekly limit policy. Current assumption: 12M tokens/week. Verify this hasn't changed. Check Anthropic support docs and Claude.com.

**Phases with standard patterns (skip research-phase):**

- **Phase 3:** Error messages and UX patterns. Standard production error handling; no research needed. Follow existing dashboard patterns from terminal.js and GSD routes.

- **Phase 4:** Learning and future enhancements. Deferral decision; no research needed. Research during requirements if Phase 4 is prioritized.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | node-cron, Anthropic Admin API, mailparser are all mature. Verified with npm docs, Anthropic official API docs. No unproven libraries. |
| **Features** | HIGH | Five P1 features derived from GSD Autopilot fork (github.com/nine-one-six-systems/gsd-autopilot) and industry patterns (Temporal, Pipedream, MicroStrategy). Requirements well-documented. |
| **Architecture** | HIGH | Reuses existing tmux.js, readers.js, WebSocket patterns. No fundamental redesign. Integration points clear. Build order verified against dependencies. |
| **Pitfalls** | HIGH | Seven critical pitfalls sourced from production AI agent incident reports (GetOnStack, Northflank), AWS/GCP design patterns, Anthropic engineering blog. Mitigations are established patterns, not novel. |
| **External APIs** | MEDIUM | Railway API, GitHub API, OpenAI API cost endpoints are assumed to exist. Anthropic Usage API is official but undocumented rate limits. Need verification during Phase 1 research. |

**Overall confidence: HIGH** — Core concepts verified across official docs, production patterns, and GSD fork. Implementation details to be refined during phase-specific research (especially Admin API rate limits and GSD command syntax).

---

### Gaps to Address

1. **Anthropic Admin API rate limits:** Docs don't specify limits. Estimated ~100 req/hour, but unconfirmed. **Action:** Test in Phase 1 planning; call API in staging env; verify 429 behavior. Implement cache/backoff based on real limits.

2. **GSD command surface:** Exact `/gsd:plan-all` vs `/gsd:plan --all` syntax. **Action:** Check gsd-autopilot fork; verify against live GSD commands in Claude Code. Confirm exit codes and output format.

3. **STATE.md completion detection:** What is the authoritative marker for phase completion? **Action:** Audit 3+ projects (.planning/ directories); identify pattern (file creation, status field, checksum); verify with GSD maintainers if unclear.

4. **External service cost APIs:** Do Railway, GitHub, OpenAI expose cost data via API? Or only via web dashboard? **Action:** Phase 1 research; check API docs. If not available, defer external services to Phase 3.

5. **Claude Max weekly limit policy:** Is 12M tokens/week current as of 2026-03-31? **Action:** Check Claude.com pricing page and Anthropic support center during Phase 1. Config-driven so can update easily if policy changes.

6. **Cost accuracy for concurrent execution:** If two projects run autopilot simultaneously, can we attribute costs to each? Or just estimate? **Action:** Document limitation in Phase 2. If attribution is critical, add per-project token counting via MCP instrumentation (Phase 4).

---

## Sources

### Primary (HIGH confidence)

- [Anthropic Usage and Cost API](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api) — Official Admin API endpoints, authentication, examples
- [node-cron NPM](https://www.npmjs.com/package/node-cron) — v3.0.2 current release, active maintenance
- [mailparser GitHub](https://github.com/nodemailer/mailparser) — Email MIME parsing, v3.6.0 active
- [GSD Autopilot fork](https://github.com/nine-one-six-systems/gsd-autopilot) — Plan-all → execute-all loop pattern, reference implementation
- [Circuit breaker pattern](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html) — AWS design pattern, industry standard
- [Claude Code autonomous patterns](https://www.anthropic.com/engineering/claude-code-auto-mode) — Anthropic engineering blog, Auto Mode permission delegation
- [Pause/Resume workflow patterns](https://pipedream.com/docs/code/python/rerun) — Pipedream, Ironclad, MicroStrategy examples

### Secondary (MEDIUM confidence)

- [Secure Code Execution for Autonomous Agents — Google Cloud, Feb 2026](https://medium.com/google-cloud/secure-code-execution-for-the-age-of-autonomous-ai-agents-d52e7acd6c5d)
- [Top Agentic AI Security Threats in Late 2026](https://stellarcyber.ai/learn/agentic-ai-securiry-threats/)
- [AI Agent Cost Control — RocketEdge, March 2026](https://rocketedge.com/2026/03/15/your-ai-agent-bill-is-30x-higher-than-it-needs-to-be-the-6-tier-fix/)
- [Cost & throughput management best practices — Skywork, 2025](https://skywork.ai/blog/ai-api-cost-throughput-pricing-token-math-budgets-2025/)
- [Autonomous agent execution best practices — Northflank, Bunnyshell, Google research](https://northflank.com/blog/code-execution-environment-for-autonomous-agents)

### Tertiary (context, lower confidence)

- [Understanding usage and length limits — Claude Help Center](https://support.claude.com/en/articles/11647753-understanding-usage-and-length-limits) — Policy documentation, may change
- [Railway API Docs](https://docs.railway.com/integrations/api) — Assumed cost tracking endpoints exist
- [GitHub REST API Billing](https://docs.github.com/en/rest/billing) — Assumed usage endpoints exist

---

*Research completed: 2026-03-31*
*Synthesized by: Claude Code (Haiku 4.5)*
*Ready for roadmap creation: yes*
