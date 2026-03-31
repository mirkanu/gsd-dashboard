# Feature Research: GSD Dashboard v3.0 Autopilot & Cost Intelligence

**Domain:** Autonomous code execution controller + cost intelligence dashboard
**Researched:** 2026-03-31
**Confidence:** HIGH (industry patterns well-established, Claude Code specifics verified from official docs)

## Feature Landscape

### Table Stakes (Users Expect These)

Features assumed to exist. Missing = product feels incomplete for an autonomous execution dashboard.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Autopilot execution loop** | User explicitly wants "hands-off execution" — core value proposition for v3.0 | HIGH | Must handle plan-all → execute-all → verify → next phase automatically |
| **Pause/Resume from dashboard** | Essential for autonomous systems — users need override without SSH | MEDIUM | Persists state on disk; toggle on UI updates execution controller |
| **Cost tracking per project** | Required for cost-conscious automation — users need visibility on expensive phases | MEDIUM | Claude Max tokens + session/weekly limits must be tracked; external service costs (Railway, GitHub API, etc.) |
| **Failure detection & circuit breaker** | Autonomous systems fail; safety mechanism to prevent cascade failures | MEDIUM | After N consecutive failures, halt execution and alert; allow manual resume |
| **Waiting state accuracy** | Current "Waiting" state conflates human input + agent deliberation; incorrect state breaks autopilot | HIGH | Must distinguish "blocked on human" from "agent thinking"; toggle detection in terminal state machine |
| **Session/Weekly token limits** | Claude Max users have hard limits (5x = 88K tokens / 5-hour window, 20x = 220K tokens) | MEDIUM | Real-time tracking prevents overage; alerts at 80%/95% of limit |
| **Graceful failure recovery** | Execution halts on cost limit or error; autopilot must allow retry/resume | MEDIUM | Store failure reason + context; allow manual fix + resume execution from same phase |

### Differentiators (Competitive Advantage)

Features that set product apart. Not required, but valuable for the target user (non-coder using vibe coding).

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Failure learning & retry logic** | Auto-fix common errors without human intervention; phase succeeds after self-correction | MEDIUM | Store error patterns; auto-retry with adjusted prompts on similar failures |
| **Dynamic GSD command shortcuts** | "Next suggested action" inference; reduces friction to resume work | LOW | Scan current phase state; suggest `/gsd:plan-phase`, `/gsd:execute-phase`, `/gsd:qa-run`, etc. |
| **External services cost page** | Unified cost visibility across Railway, GitHub API, OpenAI (if used), Claude tokens | MEDIUM | Aggregate costs per service; show real-time status (Circuit Breaker pattern) |
| **Archive All after Copy** | Batch task archival; reduces post-execution friction | LOW | Single-click archive all completed tasks after copying to clipboard |
| **GitHub issues link on project cards** | Quick access to issues linked in phase markdown; improves context switching | LOW | Parse `.planning/` markdown for GitHub issue URLs; add clickable link to project card |
| **Message tab styling** | Visual distinction between Claude (LLM) and human (user) messages in terminal logs | LOW | Background color + alignment; improves reading comprehension in long transcripts |
| **Real-time cost alerts** | Proactive warning before hitting limits; prevents budget surprises | MEDIUM | WebSocket push to dashboard when token consumption crosses thresholds |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-fix ALL errors forever** | "Infinite retries until success" sounds good | Masks real blockers; wastes tokens; agent goes in circles on unsolvable problems; cost runaway | Circuit breaker after N failures per phase; require human judgment for rare errors |
| **Pause entire project hierarchy** | "Pause all dependent projects together" | Shared dependencies create complex state; risky to pause mid-pipeline | Pause single project only; document dependency chain visually but don't auto-pause dependents |
| **Predict phase completion time** | "How long will autopilot take?" | LLM behavior non-deterministic; token usage varies wildly; estimates are unreliable | Show historical completion times for that phase; current token usage only |
| **Automatic phase dependency resolver** | "Auto-skip phases that don't apply" | Requires understanding project intent; skipping wrong phase breaks later phases | Document skip conditions in .planning/; manual skip button with confirmation |
| **Cost limits that auto-downgrade model** | "Switch to Haiku when approaching limit" | Haiku quality too low for most GSD tasks; breaks workflow; user never asked for degraded quality | Hard stop at limit; alert + pause; user decides next action |

## Feature Dependencies

```
GSD Autopilot Loop
    └──requires──> Execution State Machine (plan/execute/verify/next)
                       └──requires──> Session/Weekly Token Limit Tracking
                                           └──requires──> Real-time Cost Ingestion

    └──requires──> Waiting State Accuracy (distinguish human-blocked vs agent-thinking)
                       └──enhances──> Autopilot Reliability (fewer false pauses)

    └──requires──> Failure Detection & Circuit Breaker
                       └──requires──> Failure Learning (remember why previous attempt failed)

Pause/Resume from Dashboard
    └──requires──> Execution State Persistence (on-disk .gsd/STATE.md or equivalent)

Cost Tracking Dashboard
    └──requires──> Token Usage Ingestion (from Claude API, Claude Code /cost command)
    └──requires──> External Service Status Page (Railway, GitHub, OpenAI, Claude)

    └──enhances──> Autopilot (cost-aware phase selection)
    └──enhances──> Real-time Alerts (warning before limit)

Dynamic Shortcuts
    └──enhances──> Pause/Resume (suggest next action after unpause)

Archive All
    └──requires──> Task Management (existing feature, just add batch action)

GitHub Issues Link
    └──enhances──> Project Context (optional, improves discoverability)

Message Tab Styling
    └──enhances──> Terminal UX (optional, improves readability)
```

### Dependency Notes

- **Autopilot requires Waiting State Accuracy:** Without accurate detection of "waiting on human input," autopilot will pause incorrectly, defeating the hands-off goal.
- **Cost Tracking enables Autopilot Safety:** Without real-time token limit tracking, autopilot can burn through Claude Max allowance on failed retries.
- **Failure Learning enhances Autopilot Robustness:** Basic circuit breaker prevents cascade failures; failure learning turns individual failures into learnable patterns (e.g., "this phase always fails on empty JSON; always validate input first").
- **Pause/Resume requires State Persistence:** Must store execution checkpoint on disk so resume can pick up exactly where it paused, not restart the phase.

## Expected Behaviors

### 1. GSD Autopilot Execution Loop

**What happens:**
1. User clicks "Start Autopilot" on project card
2. Dashboard reads `.planning/PROJECT.md` and discovers all phases (v1.0, v1.1, v2.0, etc.)
3. For each undone phase in order:
   - Launch fresh Claude Code session with `/gsd:plan-phase [phase-number]`
   - Wait for plan completion (detected via `.planning/phases/[N]/[N]-PLAN.md` file watch)
   - Optionally show plan in dashboard for approval (user can reject)
   - If approved: launch `/gsd:execute-phase [phase-number]`
   - Wait for execution completion (detected via `.planning/phases/[N]/[N]-SUMMARY.md` file watch or phase state in `.gsd/STATE.md`)
   - Run configured verification commands (e.g., `npm test`)
   - If verification fails AND retry count < 3: auto-fix with adjusted prompt, loop back to execute
   - If verification passes: mark phase complete, advance to next
   - If verification fails after retries: trigger circuit breaker, pause autopilot, notify user
4. After all phases: notify user "Autopilot complete"

**Key behaviors:**
- Each phase gets fresh context (prevents token bloat)
- Failures are detected within 30 seconds (not waiting for human to notice)
- Circuit breaker prevents infinite retry loops
- Pauseable at any time (user can interrupt mid-phase)

**References:** GSD Autopilot fork (plan-all → autopilot loop pattern from github.com/jamoeight/get-shit-done-autopilot)

### 2. Pause/Resume from Dashboard

**What happens:**
1. User clicks "Pause Autopilot" on project card
2. Dashboard writes pause signal to `.gsd/AUTOPILOT_PAUSED` or equivalent
3. Current execution loop checks this flag at phase boundaries; does NOT kill the session
4. If mid-phase when paused: allows current phase to finish OR stops immediately (TBD on UX)
5. When paused, all UI buttons for this project become disabled except "Resume"
6. User fixes issue locally (e.g., manually runs a failing test, fixes a bug)
7. User clicks "Resume Autopilot"
8. Dashboard deletes pause signal; execution resumes from checkpoint

**Key behaviors:**
- Pause is NOT kill; session/context preserved if possible
- Resume picks up exactly where paused (no redundant work)
- During pause, dashboard shows "Waiting for Resume" state
- Clear visual affordance on dashboard that autopilot is paused

**Industry pattern:** Pipedream, Ironclad, MicroStrategy all use pause/resume with checkpoint persistence

### 3. Session & Weekly Token Limit Tracking

**What happens:**
1. Dashboard polls Claude API or reads from `.gsd/cost.json` (source TBD in phase-specific research)
2. For Claude Max 5x plan: track 88K token rolling 5-hour window; for 20x: 220K tokens
3. Display on dashboard:
   - "Tokens used this session: 45,000 / 88,000 (5-hour window)"
   - "Weekly token usage: 300,000 / ? tokens" (if weekly limit exists)
   - Progress bar that turns yellow at 80%, red at 95%
4. When crossing 80%: dashboard shows yellow warning "Approaching token limit"
5. When crossing 95%: autopilot pauses automatically; shows red alert "Token limit nearly reached"
6. When limit reached: autopilot pauses; dashboard shows "Token limit reached — resume after reset window?"

**Key behaviors:**
- Real-time updates (WebSocket push from server)
- Alerts happen BEFORE overage (not after)
- Clear explanation of reset windows (5-hour rolling for per-window limits)
- Links to Claude Code docs for cost management strategies

**Sources:** Claude Code official docs (code.claude.com/docs/en/costs) — Average $6/day, $100-200/month per developer

### 4. Waiting State Accuracy

**What happens:**
1. Current state detection (existing): watches last 50 lines of tmux pane for patterns (e.g., "awaiting input")
2. **NEW:** Add explicit detection for "waiting on human input only" vs. "agent deliberating"
3. Terminal patterns that indicate "Waiting on Human":
   - ">>> " prompt visible (Claude Code is paused awaiting user command)
   - " INPUT REQUIRED:" message in last 10 lines
   - Phase has explicit wait-for-input marker in markdown
4. Terminal patterns that indicate "Agent Working":
   - Code output scrolling (tokens being generated)
   - File being written to (agent working)
   - No user prompt visible
5. On dashboard: only show "Waiting" if waiting on human; show "Working" if agent deliberating
6. Autopilot: only pause on "Waiting on Human"; continue on "Agent Working"

**Key behaviors:**
- Fixes current bug: dashboard shows "Waiting" when phase is actually computing
- Improves autopilot reliability: fewer false pauses
- Conservative approach: if uncertain, assume "Working" (don't pause unnecessarily)

**Current issue:** Existing state detection conflates deliberation with blocking; needs refinement

### 5. Failure Detection & Circuit Breaker

**What happens:**
1. Execution phase completes; verification command runs (e.g., `npm test`)
2. Verification fails (exit code non-zero)
3. Dashboard increments failure counter for phase: `failures[phase_id] = failures[phase_id] + 1`
4. If `failures[phase_id] < 3`: retry with adjusted prompt ("Previous attempt failed because: [error]. Try a different approach.")
5. If `failures[phase_id] >= 3`: **circuit breaker trips**
   - Autopilot pauses
   - Dashboard shows red alert: "Phase [name] failed 3 times. Circuit breaker activated."
   - Stores failure context (logs, error output) for user review
   - Waits for user intervention (manual fix or resume after investigation)
6. On resume: reset failure counter; allow 3 more retries

**Key behaviors:**
- Threshold is per-phase (not global)
- Prevents token waste on unsolvable problems
- Preserves context for user debugging
- Manual override possible (expert users can force resume)

**Timeout consideration:** Long-running phases (e.g., build + deploy) might need higher threshold or adaptive timeout

### 6. Real-time Cost Alerts

**What happens:**
1. Server tracks token consumption via WebSocket or polling
2. When consumption crosses 80% of window limit:
   - WebSocket message pushed to dashboard
   - Banner appears: "⚠️ Token usage: 70,400 / 88,000 (80%). Cost optimization recommended."
   - Suggests cost-reduction actions (from Claude Code docs): clear context, reduce MCP overhead, use Sonnet, etc.
3. When crossing 95%:
   - Banner turns red
   - Autopilot pauses automatically
   - Message: "🛑 Token limit imminent (95%). Autopilot paused. Resume after 5-hour window resets."
4. Dashboard displays small "cost ticker" per project:
   - "Project X: $12.50 this month (5% of budget)" or similar

**Key behaviors:**
- Proactive (warns BEFORE overage)
- Actionable (suggests fixes)
- Non-disruptive (warning doesn't kill session, pause does)

**Data source:** Claude Code `/cost` command or Claude API usage endpoint (TBD in phase research)

## Feature Complexity & Priority

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Autopilot execution loop | HIGH | HIGH | P1 | v3.0 |
| Pause/Resume from dashboard | HIGH | MEDIUM | P1 | v3.0 |
| Session/Weekly token limits | HIGH | MEDIUM | P1 | v3.0 |
| Waiting state accuracy | HIGH | MEDIUM | P1 | v3.0 |
| Failure detection & circuit breaker | HIGH | MEDIUM | P1 | v3.0 |
| Real-time cost alerts | MEDIUM | MEDIUM | P2 | v3.0 or v3.1 |
| Failure learning & retry logic | MEDIUM | MEDIUM | P2 | v3.1 |
| External services cost page | MEDIUM | MEDIUM | P2 | v3.1 |
| Dynamic GSD command shortcuts | MEDIUM | LOW | P2 | v3.1 |
| Archive All | MEDIUM | LOW | P3 | v3.1 |
| GitHub issues link | LOW | LOW | P3 | v3.1 |
| Message tab styling | LOW | LOW | P3 | v3.1 |

**Priority key:**
- **P1 (Must have for v3.0):** Autopilot core loop + safety mechanisms (pause, limits, waiting accuracy)
- **P2 (Should have, add in v3.0-3.1):** Cost tracking, failure learning, external services page
- **P3 (Nice to have, future):** UX conveniences (shortcuts, Archive All, message styling)

## MVP Definition

### Launch v3.0 With (Minimum Viable Autopilot)

- [x] Autopilot execution loop (plan-all → execute-all → verify → next phase)
- [x] Pause/Resume from dashboard with state persistence
- [x] Session token limit tracking (Claude Max 5x, 20x windows)
- [x] Waiting state accuracy fix (distinguish human-blocked vs agent-thinking)
- [x] Failure detection & circuit breaker (prevent infinite retries)

**Why minimum:** Users get hands-off execution without risk of runaway costs or infinite failures. Safe enough for daily use.

### Add After v3.0 Validation (v3.1+)

- [ ] Failure learning & adaptive retry prompts
- [ ] External services status/cost page (Railway, GitHub, Claude, OpenAI)
- [ ] Real-time cost alerts & optimization suggestions
- [ ] Dynamic GSD command shortcuts
- [ ] Archive All, GitHub links, message styling

**Triggers for adding:**
- Failure learning: After v3.0 users run autopilot for 1+ week, collect error patterns
- External services page: When multiple projects need cost visibility across Railway + GitHub + Claude
- Alerts: After v3.0 stable; add when user asks for earlier warning

### Future (v4+)

- [ ] New project creation from dashboard (one-click scaffold + GSD init)
- [ ] Email receipt parsing for automated external cost ingestion
- [ ] Per-phase cost budgeting (e.g., "this phase should cost < $5")
- [ ] Autopilot configuration profiles (aggressive retries vs conservative)

**Why defer:**
- New project creation: Nice-to-have for power users; doesn't block core value
- Email receipt parsing: Advanced; requires webhook + parser (capability exists in YNAB project but not GSD context)
- Cost budgeting: Useful after autopilot patterns establish typical costs
- Profiles: Premature until autopilot behavior is stable

## Feature Interdependencies & Ordering

### Why v3.0 Must Include ALL Five P1 Features

1. **Autopilot + Pause/Resume:** Meaningless without pause (can't stop runaway automation)
2. **Autopilot + Token Limits:** Meaningless without limits (autopilot burns through budget on retries)
3. **Autopilot + Waiting Accuracy:** Meaningless without accuracy (pauses too often on false positives)
4. **Autopilot + Circuit Breaker:** Meaningless without breaker (failures cascade)

**Conclusion:** v3.0 is not "autopilot + one feature." It's all five features together, because each one solves a critical safety concern for autonomous execution.

### Why v3.1 Can Defer P2 Features

- **Failure learning:** Improves efficiency after autopilot baseline is stable
- **External services page:** Nice-to-have until user scales to multiple projects with different hosting
- **Cost alerts:** Already covered by circuit breaker + token limit display for v3.0
- **Shortcuts:** UX convenience, not blocking

## Competitor Feature Analysis

| Feature | GitHub Actions | Temporal | MicroStrategy Dashboard | AWS Step Functions | Our Approach (GSD Dashboard) |
|---------|----------------|----------|------------------------|-------------------|------|
| Pause/Resume | ❌ Cannot pause running workflow | ✅ Full checkpoint support | ✅ Pause dashboard execution | ✅ Wait states + pause | ✅ Dashboard button → `.gsd/STATE` file |
| Cost tracking | ❌ None (billed separately) | ❌ None | ✅ Query-level cost | ⚠️ Manual setup required | ✅ Real-time token + external services |
| Failure retry | ✅ Configurable retries | ✅ Exponential backoff + circuit breaker | ❌ Manual retry | ✅ Configurable | ✅ 3-strike circuit breaker + learning |
| Waiting for input | ❌ Workflows can't wait | ✅ Explicit wait states | ❌ Not typical use case | ✅ Wait for callback | ✅ Terminal state machine + prompt detection |
| Autonomous execution | ✅ Fully autonomous | ✅ Fully autonomous | ⚠️ Limited (visualization focus) | ✅ Fully autonomous | ✅ Autopilot loop via dashboard trigger |
| UI control | ✅ GitHub web UI | ⚠️ CLI-primary | ✅ Web dashboard | ✅ CloudWatch + SDK | ✅ React dashboard + WebSocket |

**Our advantage:** Purpose-built for GSD (phase-based workflow) + cost-conscious automation for solo developers. Simpler than enterprise tools (Temporal, Step Functions) but richer than GitHub Actions.

## Sources & Confidence Breakdown

| Area | Source | Confidence |
|------|--------|-----------|
| Claude Max token limits (88K/220K windows) | [Claude Code official docs](https://code.claude.com/docs/en/costs) | HIGH |
| Average cost ($6/day, $100-200/month) | [Claude Code official docs](https://code.claude.com/docs/en/costs) | HIGH |
| Autopilot execution patterns | [GSD Autopilot fork (github.com/jamoeight/get-shit-done-autopilot)](https://github.com/nine-one-six-systems/gsd-autopilot) | HIGH |
| Circuit breaker pattern | [AWS, Azure, industry standard docs](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html) | HIGH |
| Pause/Resume workflow patterns | [Pipedream, Ironclad, MicroStrategy](https://pipedream.com/docs/code/python/rerun) | HIGH |
| Autonomous agent execution best practices | [Northflank, Bunnyshell, Google research](https://northflank.com/blog/code-execution-environment-for-autonomous-agents) | HIGH |
| Cost tracking dashboard features | [Traceloop, Langfuse, observability platforms](https://www.traceloop.com/blog/from-bills-to-budgets-how-to-track-llm-token-usage-and-cost-per-user) | HIGH |
| State machine wait patterns | [AWS Step Functions, Glean](https://docs.aws.amazon.com/step-functions/latest/dg/concepts-statemachines.html) | MEDIUM |

**Overall confidence: HIGH** — Core concepts verified across official docs and industry sources. GSD specifics (autopilot fork) available. Implementation details to be refined in phase-specific research.

---

*Feature research for: GSD Dashboard v3.0 Autopilot & Cost Intelligence*
*Researched: 2026-03-31*
