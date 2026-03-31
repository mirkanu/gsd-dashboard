# Pitfalls: Autonomous Execution & Cost Tracking

**Domain:** Dashboard-driven autonomous agent execution with cost intelligence
**Researched:** 2026-03-31
**Confidence:** HIGH (references official docs, production patterns from E2B/Modal/Cloudflare, industry incident reports)

---

## Critical Pitfalls

### Pitfall 1: Runaway Execution Loop (Infinite Cost Escalation)

**What goes wrong:**
An autonomous execution loop enters an undetected infinite cycle (e.g., agent retry logic loops, concurrent projects trigger each other, GSD plan-all → execute-all → replan cycle never terminates). Within minutes, token consumption explodes from $5/hour to $500+/hour. Users only notice after receiving a bill spike notification or Claude Max session limit exhaustion.

Example: GetOnStack's multi-agent system escalated from $127/week to $47,000 in 4 weeks due to an infinite loop between agents running for 11 days undetected.

**Why it happens:**
- No MAX_STEPS or MAX_TOKENS guard on autopilot loop
- Concurrent projects (6+ tracked projects) can trigger cascading re-plans if state monitoring is weak
- Dashboard UI blocks or times out, but loop continues in background
- Cost visibility is delayed (API billing data arrives hours later); no real-time cost signal
- Non-technical user cannot assess whether "$50/hour is bad" or "normal"

**How to avoid:**
1. **Hard cost ceiling per project:** Before any GSD autopilot execution starts, read current Claude Max usage from Anthropic Usage API. Calculate remaining daily/weekly budget. Set per-project limit as `(remaining_budget - 10% safety_margin) / active_projects`. Reject execution if insufficient budget remains.

2. **Loop step counter:** Implement a MAX_STEPS limit (e.g., 20 plan-execute cycles). If a project re-plans more than N times in a single autopilot invocation, circuit break with "Too many replans, possible loop, stopping."

3. **Token meter with real-time alerting:** Track tokens per minute (TPM) for all GSD processes. If TPM exceeds 3× normal rate for >2 minutes, pause autopilot and alert user immediately (Telegram + dashboard flash alert).

4. **Per-phase timeouts:** Each GSD execute-phase gets a wall-clock timeout (e.g., 30 min). If exceeded, treat as stalled and halt, don't retry.

5. **Idempotency guard:** Before re-running a phase, verify the .planning/ state actually changed. If phase output is identical to previous run, don't re-execute.

**Warning signs:**
- Telegram notifications spike from 1-2/hour to >10/hour
- API usage dashboard shows unexpected TPM increase (visible if integrated with Anthropic Usage API)
- Dashboard autopilot status shows "Executing" for >30 minutes on a single phase
- Token consumption visible via dashboard cost widget shows acceleration (cost line curving up)
- System logs show rapid GSD command spawning (>5 commands/minute)

**Phase to address:**
**Phase 1: Autopilot Foundation** — Must implement cost ceiling, loop counter, and TPM alert before any autonomous loop is enabled. This is a gating requirement, not a nice-to-have.

---

### Pitfall 2: Claude Max Weekly Limit Exhaustion (Silent Autopilot Degradation)

**What goes wrong:**
User's Claude Max account has two weekly limits: one for all models, one for Sonnet specifically (limits reset 7 days from first use, August 2025 policy). Autopilot runs successfully Monday-Thursday, then all execution fails silently on Friday with "Rate limit exceeded" errors. User doesn't know they've hit the weekly cap until manually checking Claude.com or waiting 24+ hours for Anthropic Usage API billing data.

The dashboard autopilot shows "Waiting" (no error state), so user assumes the process is paused and waiting for input. Hours later they realize the project is deadlocked.

**Why it happens:**
- Claude Max weekly limits are not exposed in API responses (unlike RPM/TPM rate limits which return headers)
- Usage API returns historical usage (previous 24 hours), not real-time projection
- No weekly budget tracking in dashboard; only raw "tokens used today"
- User runs all 6 projects on same Claude Max account; no per-project quota isolation
- Autopilot doesn't check "how much of my weekly budget remains before executing"

**How to avoid:**
1. **Weekly budget projection:** At Phase 1 startup, query Usage API for `current_usage` in current billing week. Calculate `weekly_limit - current_usage = remaining`. Display prominently in dashboard with color coding (green >50%, yellow 25-50%, red <25%).

2. **Pre-execution quota check:** Before ANY GSD autopilot execution, verify `remaining_weekly_budget > estimated_phase_cost + 20% buffer`. If not, reject with clear message: "Weekly limit exhausted until [date]. Purchase additional Claude Max plan or wait until limit resets."

3. **Model-aware routing:** If Sonnet weekly limit hits but all-models limit has headroom, route future calls to Claude 3.5 Haiku (cheaper) or batch processing instead of failing hard.

4. **Daily billing sync:** Every 6 hours, fetch Usage API and update dashboard. Show week-to-date spending trend. Set Telegram alert if >80% of weekly limit consumed.

5. **Purchase/cap options UI:** Let user define fallback behavior: "Stop on limit" vs. "Purchase $10 overage allowance" vs. "Queue for next week." This educates non-technical user about limits upfront.

**Warning signs:**
- Autopilot shows "Executing" but project logs show no Claude API calls being made (visible via MCP dashboard)
- Dashboard cost widget shows usage flat-lined; no new tokens counted for 1+ hour despite autopilot running
- Claude Max status on dashboard shows <5% remaining budget with no visual warning
- User's Telegram notifications drop to zero despite scheduled autopilot runs

**Phase to address:**
**Phase 1: Autopilot Foundation** — Must integrate with Anthropic Usage API and implement weekly budget tracking before launch. Without this, autopilot is unreliable for heavy users on Claude Max.

---

### Pitfall 3: Race Condition Between Concurrent Projects (State Corruption)

**What goes wrong:**
Two projects' autopilot loops both try to update the same `.planning/` file simultaneously (e.g., both write to `gsd-projects.json` status, or both try to update a shared dependency state). One write is lost, state becomes inconsistent. Project A thinks Phase 2 is done, Project B thinks Phase 2 is pending. Dashboard shows different state than filesystem. User manually re-runs Phase 2, executing work twice, corrupting project output or creating duplicate data.

**Why it happens:**
- GSD autopilot triggers one loop per project; with 6 projects, up to 6 concurrent GSD commands
- `.planning/` state is written by multiple tmux sessions without lock coordination
- No optimistic locking or version checking on state files
- Dashboard reads stale state from filesystem (no event-driven invalidation)
- No consensus protocol between autopilot controller and GSD workers

**How to avoid:**
1. **File locking with timeout:** Before writing any `.planning/` state, acquire a lock file (e.g., `.planning/.lock`). If lock is held >30 seconds, consider holder dead and force-acquire. Lock must be held for <1 second writes only.

2. **Atomic writes with verify:** Write state to temp file, then atomic-move to target. If move fails, verify the existing file (check mtime and hash). If it's stale, retry.

3. **Version/timestamp on state objects:** Each `.planning/config.json` and phase summary gets a `updated_at` timestamp. Before writing, verify `new_updated_at > stored_updated_at`. If not, re-read and merge.

4. **Dashboard as read-only observer:** Dashboard must not write state (only GSD engine writes). Dashboard re-reads filesystem every 2-5 seconds for eventual consistency. Critical state reads are cached only briefly.

5. **Per-project mutex:** Only one autopilot can execute a given project at a time. Use a Redis/SQLite semaphore or file-based lock with project name as key.

6. **Audit log with CAS (Compare-and-Swap):** Every state transition is logged with "who wrote, when, previous state, new state." CAS prevents lost writes: "write only if previous matches expected."

**Warning signs:**
- Dashboard shows Phase 2 "Complete" but filesystem `SUMMARY.md` shows "Pending"
- Two concurrent autopilot processes both report success for the same phase on same project
- `.planning/` files show recent mtime but content hasn't changed (indicator of retry loop)
- User reports "I ran Phase 2 but it also ran automatically, so it ran twice"
- SQLite database locked errors in dashboard logs

**Phase to address:**
**Phase 1: Autopilot Foundation** — Must implement file locking and state versioning before enabling concurrent autopilot on multiple projects. Without this, state corruption is inevitable with 6+ projects.

---

### Pitfall 4: Dashboard as Single Point of Failure (Autopilot Blocked by UI Timeout)

**What goes wrong:**
Autopilot loop runs `/gsd:execute-phase` command in background, which takes 15+ minutes. Dashboard UI polls autopilot status every 2 seconds, but long-running operation times out or blocks the Express server. All dashboard requests hang while operation is in flight. User can't view other projects, can't pause autopilot, can't check cost — dashboard is frozen. Meanwhile, the GSD operation succeeds in background, but user thinks everything is broken.

Worse: If autopilot triggers another plan-phase (auto-trigger), the new plan takes 5+ minutes while the old execution is still running. Both block the dashboard.

**Why it happens:**
- Autopilot loop runs GSD commands (plan, execute) via `child_process.spawn()` and waits for completion
- Dashboard status endpoint blocks until process completes (no non-blocking pattern)
- Express single-threaded event loop can't serve other requests while waiting for spawned process
- No queue or job worker abstraction; operations are synchronous from dashboard perspective
- Mobile UI especially vulnerable to timeouts (poor network + no busy indicator for user)

**How to avoid:**
1. **Detached background jobs:** Autopilot must spawn GSD commands with `{ detached: true }` and immediately return. Store job ID in SQLite `autopilot_jobs` table with status "pending/running/done".

2. **Job status polling (not blocking):** Dashboard status endpoint returns immediately with last-known job status from SQLite, not by waiting for process. Separate worker thread periodically checks job completion and updates SQLite.

3. **At-most-once execution:** Before spawning a new job, check if a job for (project, phase) is already running. If yes, return "job already in flight" instead of spawning duplicate.

4. **WebSocket status push (not poll):** Instead of dashboard polling every 2 seconds, use WebSocket to push status updates to clients. Reduces network traffic and gives real-time feedback with no polling latency.

5. **Timeout per job type:** Phase execution has 30min timeout, plan has 10min timeout. If exceeded, kill process, mark as failed, alert user. Don't hang forever.

6. **Mobile optimizations:** Disable polling while mobile app is in background; resume on focus. Use Suspense + skeleton screens instead of spinners to avoid UI hang perception.

**Warning signs:**
- Dashboard requests take >10 seconds to respond while autopilot is running
- Mobile browser shows "Request timeout" errors
- Multiple status requests in browser devtools show same timestamp (stale responses)
- Telegram notifications stop arriving while long-running operation is active
- Browser tab becomes non-interactive for 1+ minutes

**Phase to address:**
**Phase 1: Autopilot Foundation** — Must implement detached job spawning and SQLite job tracking before enabling autopilot. UI blocking is unacceptable for autonomous execution.

---

### Pitfall 5: Cost API Rate Limits Blocking Dashboard (Cascading Failure)

**What goes wrong:**
Dashboard queries Anthropic Usage API every 6 hours to refresh cost data. But Anthropic Usage API has rate limits (details undisclosed, but estimated at ~100 requests/hour). If dashboard frequently queries, or if user manually refreshes cost page multiple times, Usage API rejects requests with 429. Dashboard catches error and shows stale cost data (from yesterday). Cost display is now wrong, user makes decisions on incorrect information. If multiple instances of dashboard are running (e.g., locally + on Railway tunnel), they all compete for same API quota, causing cascading 429 errors.

**Why it happens:**
- Anthropic Usage API is not published as a first-class service; rate limits are undisclosed
- No local cache of cost data with TTL; each dashboard reload queries API fresh
- No request deduplication; multiple simultaneous cost page loads = multiple API requests
- Railway tunnel + local dashboard = duplicate dashboard instances, both querying API
- No backoff/retry logic; failed request is immediately retried, amplifying rate limit effects

**How to avoid:**
1. **Centralized cost cache in SQLite:** Dashboard caches Usage API responses in SQLite with TTL of 6 hours. Multiple requests within TTL hit cache, not API. If cache miss, deduplicate: only one request fetches API, others wait for result.

2. **Request coalescing:** If 5 simultaneous requests come in and cache is empty, all wait for first request to complete, then return shared result. Implement via Promise deduplication in Node.

3. **Manual refresh with backoff:** User can manually refresh cost (button in UI), but frontend enforces 60-second minimum between refreshes. Backend also enforces 5min minimum to API. This prevents rapid-fire refresh DoS.

4. **Graceful degradation:** If Usage API is rate-limited or down, show cached data with "Last updated: Xh ago" label. Don't error; don't block autopilot. Cost visibility can be stale, but autopilot continues.

5. **Separate API key for dashboard:** If possible, use separate Anthropic API key for dashboard cost queries (not the same key used for GSD execution). This isolates quota usage.

6. **Monitor for rate limits:** Log all 429 responses from Usage API. Dashboard admin endpoint shows "API quota status: 10 reqs/hour remaining". Alert user if quota is exhausted.

**Warning signs:**
- Cost widget shows "Data unavailable" or "Last updated: 24h ago"
- Dashboard logs show repeated 429 errors from Usage API
- User manually refreshes cost page 3+ times; gets same stale data each time
- If running local + Railway dashboard, both show different cost values (due to race condition on cache update)

**Phase to address:**
**Phase 2: Cost Intelligence** — Must implement Usage API cache and rate limit handling before exposing cost data to user. Without this, cost feature is unreliable and may degrade dashboard performance.

---

### Pitfall 6: Stale Cost Data Masking Real Problems (Decision Paralysis)

**What goes wrong:**
Dashboard shows cost summary updated 4 hours ago. User sees "Week-to-date: $12, Remaining: $188" and thinks autopilot can run safely all day. But in reality, an autopilot loop has been running since last cache update and consumed $50. Real remaining budget is $138, not $188. User enables another autopilot project, thinking there's budget. Now two projects are running on a depleted budget. Actual remaining budget is exhausted in 2 hours. User gets surprised rate-limit or weekly limit hit, with no warning.

**Why it happens:**
- Cost data from Anthropic Usage API is delayed (historical; updated every few hours)
- Dashboard has no real-time token counter (would require streaming LLM API usage)
- Non-technical user doesn't understand "this number is old; refresh it if you made changes"
- UI shows cost data without timestamp or "staleness" indicator
- No projection algorithm (e.g., "at current rate, budget exhausted in 3 hours")

**How to avoid:**
1. **Cost timestamp + freshness indicator:** Every cost value in UI includes "Updated: 4h ago" and color coding: Green (fresh, <1h), Yellow (stale, 1-6h), Red (very stale, >6h). User cannot misunderstand age.

2. **Real-time token meter:** Track tokens consumed by active autopilot sessions locally (count tokens in GSD commands, log via MCP). Display running total: "Current session: +523 tokens (+$0.05)". This gives real-time signal without relying on API.

3. **Budget projection:** Show "Projected daily budget: $XX" based on current rate of token consumption. If autopilot is active, update every 30 seconds. User can see "if this rate continues, budget exhausted in 5 hours."

4. **Remaining budget as a prominent card:** Top of dashboard shows large, obvious number: "Weekly budget remaining: $138 (Yellow: updated 4h ago)". Make it impossible to miss. Use red background if <$20 remains.

5. **Enable only with fresh cost:** If cost data is >6 hours old, disable "Start Autopilot" button. Require manual refresh first. Tooltip: "Cost data is stale. Click Refresh to get current usage, then try again."

6. **Per-project budget override:** User can define "max spend per project this week: $30". Autopilot respects this ceiling even if global budget says OK. Prevent one runaway project from consuming all budget.

**Warning signs:**
- User enables autopilot and 30 minutes later cost page is showing data from 8 hours ago
- Two projects have autopilot running; user can't visually assess if combined cost rate fits remaining budget
- Dashboard cost widget shows no timestamp; user doesn't know if $12 is today or yesterday
- User reports "I thought I had $200 left but I got rate-limited after only $50 of new spend"

**Phase to address:**
**Phase 2: Cost Intelligence** — Must implement cost freshness indicators and real-time meter before shipping cost-controlled autopilot. Users cannot make safe decisions on stale data.

---

### Pitfall 7: Process Orphaning & Resource Leaks (Memory Exhaustion Over Time)

**What goes wrong:**
Autopilot spawns GSD processes via child_process.spawn(). If parent process crashes or is killed (e.g., Railway container restart), child processes become orphans and continue running in background. No one is monitoring them. Over 2-3 weeks, orphan processes accumulate: 50+ spawn processes, each consuming 50MB RAM, totaling 2.5GB. Railway container hits memory limit and all new processes OOM. Dashboard becomes unresponsive. Auto-restart restarts the dashboard process but orphans remain. Only manual SSH kill can clean them up.

**Why it happens:**
- GSD execution spawns tmux sessions in background detached mode; if parent dies, tmux session is not cleaned up
- No parent process reaper; orphaned tmux sessions run forever
- No periodic process audit to detect orphans
- Railway auto-restart doesn't kill dangling processes
- User cannot SSH into Railway container to manually kill orphans (no access to kill)

**How to avoid:**
1. **Process tracking in SQLite:** Every spawned process (by PID, process name, start time, parent). Before spawning a new autopilot job, query SQLite for processes older than 24 hours with no recent heartbeat. Kill them.

2. **Heartbeat mechanism:** Parent process writes heartbeat every 60 seconds to SQLite for each active job. If no heartbeat for 5 minutes, parent is dead; spawn cleanup job to terminate associated processes.

3. **Explicit process cleanup on shutdown:** Node process termination handler catches SIGTERM/SIGINT and explicitly kills all child processes by PID before exiting. Don't rely on OS re-parenting.

4. **tmux session naming scheme:** Autopilot tmux sessions named `autopilot-{project}-{epoch}`. Periodically query `tmux list-sessions` and kill sessions older than 6 hours with no recent user input (check session timestamp).

5. **Memory watchdog (existing in GSD Dashboard):** Already implemented per REQUIREMENTS. Verify it also catches and kills orphan processes, not just heap monitoring.

6. **Periodic process audit (cron-like):** Every 30 minutes, audit spawned processes. Kill any older than 2 hours or consuming >500MB RAM.

**Warning signs:**
- `ps aux` shows dozens of tmux or node processes with no associated dashboard window
- Railway container memory usage slowly increases 50MB/day
- After 2-3 weeks, new autopilot jobs fail to spawn (no memory left)
- Dashboard logs show "Cannot spawn child process: ENOMEM"
- User reports dashboard performance degradation over days

**Phase to address:**
**Phase 1: Autopilot Foundation** — Must implement process tracking and cleanup before enabling long-lived autopilot. Without this, the system will degrade to OOM after a few weeks.

---

## Moderate Pitfalls

### Pitfall 8: Incomplete GSD Phase Detection (False "Waiting" States)

**What goes wrong:**
Autopilot finishes executing a Phase and checks the state. Current logic pattern-matches the last 50 lines of terminal output. If GSD phase completes but the phase summary file isn't yet flushed to disk (race condition), or if phase exits cleanly but doesn't print the expected "Phase complete" message, dashboard marks phase as "Waiting" (no error, but not progressed). Autopilot doesn't trigger the next phase. User thinks autopilot is paused waiting for input. Actually, the phase succeeded but state detection failed.

**Why it happens:**
- State detection uses tmux capture-pane (terminal output pattern matching), which is fragile
- No direct communication between GSD process and dashboard (no structured exit codes or events)
- Phase completion state relies on `.planning/SUMMARY.md` being written, but write might be buffered
- No canonical state file; relying on inference from terminal output

**How to avoid:**
1. **Explicit exit code:** GSD process always exits with code 0 (success) or non-zero (failure). Dashboard checks $? of spawned process, not terminal output.

2. **Structured completion marker:** Phase completion writes a marker file `.planning/{phase}/.phase_complete` with timestamp and exit status JSON. Dashboard reads this marker, not terminal logs.

3. **MCP state query:** GSD dashboard has MCP endpoint that queries current project state (structured) instead of inferring from terminal. Returns `{ phase: "2-02", status: "executing|waiting|complete|failed", timestamp }`.

4. **Phase timeout with fallback:** If phase doesn't complete within expected time AND no completion marker found, query user terminal directly or via Telegram: "Phase seems stuck. Check status?" Only then assume failure.

5. **Audit logs:** Every state transition is logged with "detected via [exit_code|marker_file|mcp_query]" so we can see which detection method is working.

**Warning signs:**
- Dashboard shows phase "Waiting" but phase actually succeeded (verify by checking `.planning/SUMMARY.md` manually)
- Autopilot stalls on a phase for hours, then user manually checks and sees phase is done
- Terminal logs show "Phase execute successful" but state shows "Pending"
- MCP query (manual) shows phase complete, but dashboard UI shows waiting

**Phase to address:**
**Phase 1: Autopilot Foundation** — State detection must be reliable before autopilot can safely loop. Fragile detection causes false waits, breaking autonomous execution.

---

### Pitfall 9: Cost Estimates Wildly Inaccurate (Budget Over/Under-runs)

**What goes wrong:**
Dashboard displays cost estimate for a phase: "Plan phase costs ~$2.50" (based on historical average). User approves autopilot run expecting $2.50 cost. Phase executes and actually costs $15 (4× higher than estimate). User is surprised; budget overrun. Or opposite: phase estimated $20 but costs $3. User second-guesses cost projection algorithm and doesn't trust cost warnings anymore.

Inaccurate estimates break trust. User disables cost controls "because they're wrong anyway."

**Why it happens:**
- Cost estimation based on historical average tokens per phase, but varies 2-4× depending on context
- Different GSD actions have wildly different token costs: plan-all might be $2 or $20 depending on how many `.planning/` files exist
- Phase tokens depend on project size, Claude Code history, error recovery, etc. — high variance
- Dashboard has no per-project cost history; estimates are global average
- No feedback loop to improve estimates after actual cost is known

**How to avoid:**
1. **No cost estimates; show ranges:** Instead of "costs ~$2.50", show "costs $1–5 (typical $2.50)". User expects variance. Reduce false precision.

2. **Per-project historical cost:** After phase completes, record actual cost by project. Calculate 25th/50th/75th percentile for "plan phase on project X". Display range based on project history, not global average.

3. **Cost feedback loop:** After phase completes, dashboard logs actual cost. If significantly different from estimate (>50% variance), flag for review. Over time, estimates converge to reality.

4. **Cost cap override:** User can set "hard stop at $X for this phase" independent of estimate. If actual cost exceeds cap, kill execution. Prevents surprises.

5. **Token counting, not cost estimation:** For MVP, just count tokens (ask Claude API for token count) before and after phase. Show "phase consumed 4,250 tokens, costs $0.64 at current rates." This is measurable, not estimated.

**Warning signs:**
- User disables cost limits, saying "the estimates are way off"
- Significant discrepancy between estimated and actual cost for same phase (>2× variance)
- User questions cost projection; "I don't trust this number"
- Two runs of "plan" phase on same project show 5× cost difference

**Phase to address:**
**Phase 2: Cost Intelligence** — Cost display must be honest about variance before shipping cost controls. Poor estimates undermine trust in the entire cost system.

---

### Pitfall 10: Concurrent Cost Attribution (Who Spent the Money?)

**What goes wrong:**
Two autopilot projects run simultaneously. Tokens are consumed by both. Anthropic Usage API returns total tokens consumed but doesn't break down by project. Dashboard assigns cost proportionally (e.g., 60% to project A, 40% to B) but this is a guess. User's monthly spend summary shows "Project A: $45, Project B: $30" but can't trust attribution. For billing purposes, this is useless. User can't answer "which project cost the most?" accurately.

**Why it happens:**
- Anthropic Usage API returns aggregate token usage, not per-API-key breakdown
- Each GSD project runs under same Claude Max account; no per-project quota isolation
- Dashboard would need to instrument every GSD command to count tokens (per-project), but GSD doesn't expose token counts
- No cost allocation logic; just guessing proportionally

**How to avoid:**
1. **Per-project MCP instrumentation:** Add MCP endpoint that instruments token counting for each phase. GSD process reports tokens via MCP before and after. Dashboard accumulates per-project.

2. **Separate API keys (future, if feasible):** If Anthropic allows multiple API keys per Max plan, assign one per major project. Then Usage API gives per-key breakdown. Requires Anthropic support.

3. **Deterministic allocation:** If concurrent execution is rare, avoid it. Autopilot runs projects sequentially (project A fully completes, then B). Token costs are unambiguous. Trade concurrency for clarity.

4. **Honest attribution:** UI shows "Project A: $45 (best estimate, actual unknown, shared execution with B)". Educate user that attribution is approximate when projects run concurrently.

5. **Cost allocation report:** Monthly report shows "best estimate by project" and separately shows "allocation method: proportional to estimated phase complexity". Makes uncertainty explicit.

**Warning signs:**
- Dashboard cost summary doesn't add up to actual Claude Max bill
- User asks "which project cost more?" and dashboard can only guess
- Two projects run concurrently; cost attribution differs wildly from sequential runs
- Monthly billing reconciliation doesn't match dashboard totals

**Phase to address:**
**Phase 2: Cost Intelligence** — Per-project cost attribution should be resolved before shipping cost reporting. Without it, cost intelligence is incomplete.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Synchronous autopilot spawning (wait for completion) | Simple code, easy to debug | Dashboard hangs during long execution; blocks all other operations | Never — implement async job queue from start |
| Global cost average (no per-project history) | Quick MVP, small code footprint | Inaccurate estimates, user distrust | MVP only; must refine in Phase 2 |
| Terminal output pattern matching for state (no marker files) | No GSD modification required | Fragile state detection, false positives | Phase 1 only; add marker files once proven |
| No file locking on `.planning/` writes | Simple GSD integration | Race conditions with 6+ projects | Only acceptable if projects run sequentially; fails with concurrency |
| Cache cost data 6 hours | Reduces API load | Decisions made on 6-hour-stale data | Acceptable for daily use; improve to 1-hour+ for active autopilot |
| Orphan process cleanup via cron (not real-time) | No overhead per job | Orphans accumulate for hours before cleanup | Acceptable if cron runs every 30 min; unacceptable if >2 hours |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic Usage API (cost tracking) | Sync API call blocks dashboard requests; no caching | Cache responses 6+ hours; coalesce simultaneous requests; graceful degradation if API down |
| GSD command spawning (autopilot) | `await child_process.exec()` blocks event loop | Use detached spawn; track in SQLite; poll status async |
| `.planning/` state reading | Read fresh from disk every time | Cache for 2-5 sec; invalidate on file watcher events |
| tmux session management | Kill all sessions on container shutdown | Explicit PID tracking; signal handling; orphan audit every 30 min |
| WebSocket state pushes (real-time UI) | Push every state change (too noisy) | Debounce: coalesce changes every 1 sec; only push if status or critical field changed |
| Cost rollup across services | Assume all costs come from Claude API | Discover other costs (Railway, GitHub, OpenAI, etc.); multi-source aggregation |
| Multiple dashboard instances (local + Railway) | Cache conflicts; state divergence | Centralize cache in SQLite; timestamp all reads; invalidate via file watcher |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Polling project state every 2 seconds | 6 projects × 50 polling requests/min = 300 req/min; CPU high, battery drain on mobile | WebSocket push (once per change) instead of poll | >3 projects with dashboard open |
| Querying entire GSD history on every dashboard load | 1000+ lines of `.planning/` files parsed on each page load | Lazy load; summarize; cache + invalidate on file change | >5 projects or >10,000 files in `.planning/` |
| Cost API call on every cost page view (no dedup) | 10 refreshes = 10 API calls; quota exhausted in 1 hour | Request coalescing; cache with 6h TTL | Cost page used frequently; multiple dashboard users |
| Spawning new GSD process per project (no queue) | 6 concurrent spawns = 6× memory; OOM after few days | Job queue; at-most-one execution per project; sequential if resource-constrained | >3 concurrent projects with autopilot |
| Reading 50 lines of tmux output per state check | tmux capture-pane takes 100ms; state check every 2 sec | Use marker files; read exit code; MCP query; cache terminal output | State checks faster than 500ms required |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|----------|
| Autopilot can execute arbitrary shell commands without limits | Malicious phase script or runaway loop executes `rm -rf /` or exfils data | Require phase script approval; sandbox execution; read-only filesystem for phases; audit logs |
| Cost API key hardcoded in dashboard repo | Attacker steals key, reads entire organization's usage | Use environment variables; rotate keys regularly; separate read-only key for dashboard |
| Telegram bot token readable from frontend JS | Attacker sends fake Telegram notifications; social engineering | Bot token must be backend-only; never ship in client bundle |
| Autopilot can trigger on any project without user approval | User grants autopilot permission once; it then controls all projects automatically | Require per-project explicit opt-in; user can disable-all at any time |
| No audit log of who/what triggered autopilot | Can't track what caused a cost spike or data corruption | Log every autopilot start/stop with user, timestamp, budget check result, phase triggered |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Cost values shown with no timestamp or freshness indicator | User doesn't know if $50 spent is today or 3 days ago; makes wrong decisions | Show "Updated: 4h ago" and color-code (green <1h, yellow 1-6h, red >6h) on every cost display |
| Cost limit exceeded silently; autopilot just stops | User thinks autopilot paused to wait for input; doesn't realize budget issue | Prominent red alert in dashboard: "Weekly budget exhausted. Resets [date]." Repeat in Telegram. |
| "Waiting" state doesn't distinguish "waiting for input" vs. "phase failed" vs. "state detection failed" | User can't diagnose why autopilot stalled; tries restarting (double-execution risk) | Show reason: "Waiting: Received manual input" vs. "Blocked: Phase failed" vs. "Unknown: Check logs" |
| Autopilot button has no confirmation ("Are you sure?") | User accidentally clicks Start, expensive phase runs unintended | Confirm dialog: "Start autopilot? This will consume ~$XX from your weekly budget. Budget remaining: $YYY." |
| No way to pause autopilot mid-execution | If autopilot starts and user realizes mistake, only option is wait or kill dashboard | Pause button in autopilot card; pauses after current phase, doesn't kill processes |
| Cost breakdown doesn't show which project spent what | User can't optimize; doesn't know if autopilot-A or autopilot-B is expensive | Per-project cost pie chart; breakdown by phase type (plan vs. execute); week-to-date trend |

---

## "Looks Done But Isn't" Checklist

- [ ] **Autopilot Enabled:** Cost ceiling checked before first execution — not "checked then ignored" if plan runs longer than expected
- [ ] **Autopilot Enabled:** MAX_STEPS (loop counter) enforced; system stops if exceeded, not "logged as warning"
- [ ] **Autopilot Enabled:** Weekly limit projection implemented; UI shows days-to-reset and remaining budget; refresh button available
- [ ] **Autopilot Enabled:** Process tracking in SQLite working; orphan audit runs every 30min; orphans are killed, not just counted
- [ ] **Autopilot Enabled:** File locking prevents concurrent writes to `.planning/` state; lock timeouts tested
- [ ] **Autopilot Enabled:** Dashboard autopilot status endpoint is async (doesn't block requests); separate worker polls job completion
- [ ] **Cost Tracking Enabled:** Cost API rate limits tested; 429 errors gracefully degrade (use cache, not error); no cascading failures
- [ ] **Cost Tracking Enabled:** Cost timestamps and freshness visible on every cost display; stale data indicated clearly
- [ ] **Cost Tracking Enabled:** Real-time token meter working for active sessions (not just historical API data)
- [ ] **Cost Tracking Enabled:** Per-project cost history recorded and used for future estimates; ranges shown, not point estimates
- [ ] **Cost Tracking Enabled:** Cost rollup from Anthropic API, Railway, GitHub, and other services; total visible on dashboard
- [ ] **State Detection:** Phase completion detected via exit code OR marker file, not just terminal output pattern matching
- [ ] **State Detection:** Stale state races tested with concurrent projects; no lost writes or inconsistent state
- [ ] **Telegram Alerts:** Alerts include actionable info: "Phase failed: [reason]. Click [link] to view." Not just "Phase failed."
- [ ] **Telegram Alerts:** Rate limiting on alerts (max 1 alert per 5 minutes per event type) to prevent alert fatigue
- [ ] **Safe Defaults:** Non-technical user cannot accidentally burn through budget; defaults are conservative

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Runaway loop has consumed $500 | HIGH | 1) Stop autopilot immediately. 2) Kill all GSD processes. 3) Query Anthropic for invoice details. 4) Request credit via support (possible for clear bugs). 5) Disable autopilot until prevention implemented. |
| Weekly limit exhausted, autopilot stuck | MEDIUM | 1) Manual override via Claude.com: purchase additional Max plan or wait for reset (7 days). 2) Queue pending work for next week. 3) Check if any project phases can be deferred. |
| State corruption from concurrent writes | HIGH | 1) Manual state audit: compare `.planning/` state with tmux session state. 2) Pick canonical state (e.g., tmux is truth). 3) Manually update `.planning/` to match. 4) Re-run phases that may have double-executed. 5) Add file locking to prevent recurrence. |
| Dashboard hangs due to long-running phase | LOW | 1) Open new browser tab; if responsive, issue is isolated (just that page/operation). 2) If all requests hang, SSH to server and check process load. 3) Kill the long-running GSD process if confirmed stuck. 4) Restart dashboard if corrupted. 5) Implement async spawning to prevent recurrence. |
| Cost data stale; decisions made on bad info | LOW | 1) Manually refresh cost data (button in UI). 2) Use refreshed data for new decisions. 3) Any decisions made during stale period may need revision. 4) Improve cache TTL to prevent recurrence. |
| Orphan processes consuming memory | MEDIUM | 1) SSH to server and run `ps aux | grep tmux` and `ps aux | grep node`. 2) Kill orphans by PID. 3) Monitor memory after kill. 4) Implement periodic orphan audit and add heartbeat tracking. |
| Process crashes; autopilot job stuck "in flight" | MEDIUM | 1) Check SQLite `autopilot_jobs` table; mark stuck job as failed. 2) Check if GSD process actually completed (check `.planning/` file timestamps). 3) If phase succeeded but job marked pending, manually mark complete. 4) If phase failed, retry or escalate. 5) Implement heartbeat + timeout to auto-recover stuck jobs. |
| Multiple dashboard instances diverged state | MEDIUM | 1) Centralize source of truth: `.planning/` filesystem is canonical. 2) All dashboard instances re-read state from filesystem. 3) Rebuild SQLite cache if corrupted. 4) Implement file watcher to invalidate cache on file change. 5) Eliminate need for per-instance state; read from shared source. |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Runaway execution loop | Phase 1: Autopilot Foundation | Cost meter shows ≤2× normal rate; loop counter tested and enforced; cost ceiling respected in test run |
| Claude Max weekly limit exhaustion | Phase 1: Autopilot Foundation | Dashboard shows remaining weekly budget; manual run with 90% budget consumed fails with clear message; refresh updates budget |
| Race condition between concurrent projects | Phase 1: Autopilot Foundation | File locking tested; concurrent writes to same file don't corrupt state; CAS verify pass |
| Dashboard as single point of failure | Phase 1: Autopilot Foundation | Dashboard requests don't hang during 30min+ phase execution; WebSocket updates flow while job runs; UI is responsive |
| Cost API rate limits | Phase 2: Cost Intelligence | No cascading failures when API rate-limited; cache serves requests; manual refresh forces fresh API call; dedup tested |
| Stale cost data masking problems | Phase 2: Cost Intelligence | Cost timestamp visible and accurate; freshness indicator color-correct; stale-data warnings prevent bad decisions |
| Process orphaning & resource leaks | Phase 1: Autopilot Foundation | Process tracking in SQLite accurate; orphan audit runs and kills stale processes; memory stable over 7 days with active autopilot |
| Incomplete GSD phase detection | Phase 1: Autopilot Foundation | Phase completion detected via exit code + marker file + MCP; no false "waiting" states in 100 test runs |
| Cost estimates inaccurate | Phase 2: Cost Intelligence | Cost ranges shown (not point estimates); per-project history improves estimates over time; feedback loop working |
| Concurrent cost attribution | Phase 2: Cost Intelligence | Per-project token tracking working; if concurrent execution occurs, cost breakdown estimated and labeled as such |

---

## Sources

- [Secure Code Execution for the Age of Autonomous AI Agents | Google Cloud, Feb 2026](https://medium.com/google-cloud/secure-code-execution-for-the-age-of-autonomous-ai-agents-d52e7acd6c5d)
- [Top Agentic AI Security Threats in Late 2026](https://stellarcyber.ai/learn/agentic-ai-securiry-threats/)
- [AI Agent Sandbox: How to Safely Run Autonomous Agents in 2026](https://www.firecrawl.dev/blog/ai-agent-sandbox)
- [The Top Code Execution Risks in Agentic AI Systems in 2026](https://apiiro.com/blog/code-execution-risks-agentic-ai/)
- [Best Practices for AI API Cost & Throughput Management (2025)](https://skywork.ai/blog/ai-api-cost-throughput-pricing-token-math-budgets-2025/)
- [Anthropic API Pricing: Complete Guide and Cost Optimization Strategies (2025)](https://www.finout.io/blog/anthropic-api-pricing)
- [Usage and Cost API - Claude API Docs](https://platform.claude.com/docs/en/build-with-claude/usage-cost-api)
- [Everything We Know About Claude Code Limits](https://portkey.ai/blog/claude-code-limits/)
- [What is the Max plan? | Claude Help Center](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)
- [Understanding usage and length limits | Claude Help Center](https://support.claude.com/en/articles/11647753-understanding-usage-and-length-limits)
- [Claude is limiting usage more aggressively during peak hours | TechRadar](https://www.techradar.com/ai-platforms-assistants/claude/claude-is-limiting-usage-more-aggressively-during-peak-hours-heres-what-changed)
- [Anthropic tweaks Claude usage limits to manage capacity | The Register](https://www.theregister.com/2026/03/26/anthropic_tweaks_usage_limits/)
- [We Built a Circuit Breaker Because We Couldn't Trust Ourselves — Askew](https://write.as/askew/we-built-a-circuit-breaker-because-we-couldnt-trust-ourselves)
- [What 1,200 Production Deployments Reveal About LLMOps in 2025 - ZenML](https://www.zenml.io/blog/what-1200-production-deployments-reveal-about-llmops-in-2025)
- [AI Agent Cost Control: Avoiding Budget Overruns](https://rocketedge.com/2026/03/15/your-ai-agent-bill-is-30x-higher-than-it-needs-to-be-the-6-tier-fix/)
- [The Economics of Autonomy: Preventing Token Runaway in Agentic Loops | Alps Agility](https://www.alpsagility.com/cost-control-agentic-systems)
- [Agentic AI Design Patterns | Medium](https://medium.com/@balarampanda.ai/agentic-ai-design-patterns-choosing-the-right-multimodal-multi-agent-architecture-2022-2025-046a37eb6dbe)
- [Race Condition Vulnerability | Causes, Impacts & Prevention | Imperva](https://www.imperva.com/learn/application-security/race-condition/)
- [Avoiding Single Points of Failures in Distributed Systems | Baeldung](https://www.baeldung.com/cs/distributed-systems-prevent-single-point-failure)
- [System Design: How to Avoid Single Points of Failure (SPOFs) - DEV](https://dev.to/zeeshanali0704/system-design-how-to-avoid-single-points-of-failure-spofs-260k)
- [5 Tips for Cleaning Orphaned Node.js Processes | Medium](https://medium.com/@arunangshudas/5-tips-for-cleaning-orphaned-node-js-processes-196ceaa6d85e)
- [How to Fix 'Zombie Process' Issues in Linux](https://oneuptime.com/blog/post/2026-01-24-fix-zombie-process-issues-in-linux/view)

---

*Pitfalls research for: GSD Dashboard v3.0 — Autonomous Execution & Cost Intelligence*
*Researched: 2026-03-31*
*Confidence: HIGH*
