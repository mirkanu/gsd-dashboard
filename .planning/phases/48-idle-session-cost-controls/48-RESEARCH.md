# Phase 48: Idle Session Cost Controls - Research

**Researched:** 2026-04-15
**Domain:** Session lifetime management, tmux cost measurement, graceful shutdown automation
**Confidence:** HIGH

## Summary

Phase 48 unifies two previously separate concerns: graceful session shutdown (manual Pause button) and automatic idle-session termination. The implementation leverages existing Phase 43 idle detection (`paneHashCache` + status polling), Phase 45 cost tracking, and Phase 42 configuration storage.

The core challenge is **graceful shutdown**: before killing tmux, send `/gsd:pause-work` into the pane and wait for completion markers (commit output or STATE.md write) before issuing `tmux kill-session`. This requires parsing `/gsd:pause-work` output to detect success/failure, with a fallback Telegram notification if pause-work times out.

Cost measurement is straightforward (ps RSS × Railway rate); the hard part is the shared graceful-shutdown primitive that both the idle detector and manual Pause button will call.

**Primary recommendation:** 
- Extract graceful shutdown to a server-side helper function called by both idle detector and Pause button route
- Reuse `paneHashCache.get(sessionName).lastChangedAt` + detectSessionState for the 2h idle threshold
- Log daily tmux costs to `external_service_costs` with `notes: 'tmux_cost_estimate:...'` prefix (reusing Phase 45 pattern)
- Add global idle-timeout setting to `app_settings` table, editable via ConfigurationPage
- Add `/api/gsd/projects/:name/tmux-cost` route to compute per-session $/day (add to PROXY_PREFIXES immediately)

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Idle signal:** Status = `waiting` AND terminal pane hash unchanged (both must hold). Reuses Phase 43 `paneHashCache` infra.
- **Default idle threshold:** 2 hours → auto-close. Working sessions > 6 hours → force-kill without handoff. Autopilot sessions 2× threshold (4h default).
- **Graceful shutdown sequence (shared primitive):** Send `/gsd:pause-work\n` into tmux pane → watch for completion marker (commit output / STATE.md write) + buffer → kill tmux. Failure → kill anyway + Telegram notification.
- **Manual Pause button:** Refactored to use same graceful-shutdown path (no separate fast/immediate path).
- **Config scope:** Global setting only (per-project overrides deferred).
- **Cost measurement:** Live `ps` RSS × Railway RAM rate (~$10/GB-month). Instantaneous, not precise.
- **Enabled by default:** No opt-in required at deploy; threshold is 2h.
- **Post-kill notification:** Telegram message "killed session X, handoff saved" or failure variant.

### Claude's Discretion
- Railway rate constant location (env var vs settings table vs hardcoded)
- Exact pause-work completion-detection regex / marker (depends on actual `/gsd:pause-work` output format)
- Grace buffer duration between pause-work success and tmux kill
- Telegram message format/content
- Cost column sort order on Services page

### Deferred Ideas (OUT OF SCOPE)
- Per-project idle threshold overrides
- Whitelist ("never auto-close project X")
- Pre-kill warning / grace period with cancellation
- Railway Metrics API for precise cost (ps RSS approximation is fine for v1)
- Separate `tmux_cost_history` table (reusing `external_service_costs` for now)

## Standard Stack

### Core Infrastructure (Reused from Prior Phases)
| Component | Location | Version | Purpose | Why Standard |
|-----------|----------|---------|---------|--------------|
| paneHashCache | `server/gsd/tmux.js` | Phase 43 | In-memory idle signal (pane hash + lastChangedAt) | Accurate change detection on 2s poll cadence |
| detectSessionState | `server/gsd/tmux.js` | Phase 43 | Detect 'waiting'/'working'/'paused'/'archived' | Exact state already integrated into status polling |
| app_settings table | `server/db.js` | Phase 42 | Encrypted config storage (global idle-timeout setting) | Already used for credentials, survives redeploy |
| external_service_costs table | `server/db.js` | Phase 45 | Cost history log (daily tmux cost estimates) | Reuses existing cost tracking schema with notes prefix |
| stateBroadcaster | `server/gsd/stateBroadcaster.js` | Phase 43 | Tracks sessionState + stateEnteredAt per project | Already maintains canonical transition timestamps |
| Telegram notifier | `server/gsd/telegram.js` | Phases 42+ | Send state-change messages | Already wired for Telegram integration |

### New Route Structure
| Route | Method | Purpose | Proxy Prefix |
|-------|--------|---------|--------------|
| `/api/gsd/projects/:name/tmux-cost` | GET | Compute per-session $/day estimate from ps RSS | `/api/gsd` → needs **PROXY_PREFIXES** entry |
| (refactor) `/api/gsd/projects/:name/pause-session` | POST | Call shared graceful-shutdown primitive | (existing) |

### Installation & Setup

No new npm packages. All infrastructure already exists.

**Configuration:**
```bash
# Idle timeout setting stored in app_settings:
# INSERT INTO app_settings (key, value_encrypted, ...) VALUES ('idle_timeout_minutes', ...)
# Default: 120 minutes (2 hours) globally

# Railway RAM rate: Store in app_settings or env var
# RAILWAY_RAM_RATE_MONTHLY (default ~$10/GB-month, computed as $/GB/day for per-session calc)
```

## Architecture Patterns

### Pattern 1: Graceful Shutdown (Shared Primitive)

**What:** A server-side helper function (not a new route) called by both the idle detector and manual Pause button. Encapsulates the sequence: send `/gsd:pause-work` → poll for completion → kill tmux → notify Telegram.

**When to use:** Any path that needs to shut down a tmux session gracefully.

**Implementation location:** New file `server/gsd/gracefulShutdown.js` or inline in `gsd.js`.

**Signature (pseudo):**
```typescript
// server/gsd/gracefulShutdown.js
async function gracefulShutdown(
  sessionName: string,
  projectName: string,
  options?: { 
    pauseWorkTimeout?: number,  // default 30s
    graceBuffer?: number        // default 1s after pause-work completes
  }
): Promise<{ok: boolean, message: string, pauseWorkCompleted: boolean}>
```

**Flow:**
1. Verify tmux session active; if not, return success immediately.
2. Send keys: `tmux send-keys -t <session> "/gsd:pause-work" Enter`
3. Poll tmux capture for pause-work completion markers (see below).
4. On success (marker found) or timeout (after pauseWorkTimeout): wait graceBuffer, then `tmux kill-session -t <session>`.
5. Send Telegram notification: "killed session X, handoff saved" (success) or "killed session X, pause-work failed — manual checkpoint needed" (failure).
6. Return `{ok: true, pauseWorkCompleted: true/false}`.

**Pause-work completion markers to detect:**
- Exact format TBD — inspect actual `/gsd:pause-work` output. Most likely: commit hash output or STATE.md write confirmation in captured pane text.
- **Fallback approach:** If output is unpredictable, use a fixed timeout (e.g., 30s) and assume success if no error patterns detected.

### Pattern 2: Idle Detection Loop

**What:** A background poller (separate from the existing 2s pane-hash poller) that runs every 30-60s checking if any session is idle per the lock conditions.

**When to use:** Runs at startup and continuously, checking all projects for idle status.

**Location:** New background task or extension of existing `server/gsd/stateBroadcaster.js` polling.

**Conditions for auto-close (all must hold):**
- `detectSessionState(session) === 'waiting'` (from Phase 43)
- `paneHashCache.get(session)?.lastChangedAt` exists AND `(now - lastChangedAt) > IDLE_THRESHOLD` (default 2h)
- Session **not** paused already (paused means dead, nothing to close)
- Session **not** in grace whitelist (config allows global-only for v1)

**Special cases:**
- Autopilot session (check if active run in progress): Use 2× threshold (4h default)
- Working session > 6h idle: Force-kill without graceful-shutdown (session is hung)
- Waiting session > 2h idle: Graceful-shutdown via shared primitive

**Execution:** Call shared `gracefulShutdown(session, projectName)` for idle waiting/autopilot sessions.

### Pattern 3: Cost Measurement

**What:** Per-session $/day estimate computed from process RSS.

**Method:**
1. Get tmux session PID: `tmux list-sessions -F '#{session_name} #{pane_pid}'` or query Session tracking
2. Read RSS from `/proc/<pid>/status` (Linux) or `ps -o rss= -p <pid>` (portable)
3. Compute daily cost: `RSS_MB / 1024 * RAILWAY_RATE_GB_MONTH / 30`
4. Example: 4GB = 4096 MB → 4 * $10 / 30 ≈ $1.33/day

**When to compute:**
- On-demand via `/api/gsd/projects/:name/tmux-cost` GET route (for per-project display)
- Daily (e.g., via cron or daily summary task) to log aggregate idle $/day to `external_service_costs`

**Where to log:**
```sql
INSERT INTO external_service_costs (
  id, service, cost_usd, checked_at, source, notes
) VALUES (
  uuid, 'tmux-idle-estimate', <daily_sum>, now, 'api', 'tmux_cost_estimate:proj1:4.0GB,proj2:2.5GB'
)
```

### Pattern 4: Configuration Storage

**What:** Global idle-timeout (and optional Railway rate) stored in encrypted `app_settings` table.

**Implementation:**
- Key: `idle_timeout_minutes` (value: "120" default)
- Key: `railway_ram_rate_monthly` (value: "10.0" for $10/GB-month)
- Access in routes: `getSecret('idle_timeout_minutes')` then `parseInt(value)`

**UI Integration:** New section on ConfigurationPage (Phase 42 pattern):
```
Global Idle Timeout
  [ Input: 120 ] minutes
  [ Enable auto-close checkbox (default: on) ]
  
Railway RAM Estimate
  [ Input: 10.0 ] $/GB-month
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session lifetime management | Custom session tracking | Existing `paneHashCache` + `detectSessionState` + `stateBroadcaster` | Phase 43 already has 3-month track record of reliability |
| Pause-work output parsing | Regex from scratch | Read actual `/gsd:pause-work` workflow output, use fixed timeout fallback | Avoids brittle output-dependent logic; timeout is safe default |
| Graceful shutdown sequence | Two separate kill paths (manual + auto) | One shared `gracefulShutdown()` function | Maintenance burden halved; both paths stay in sync |
| Cost tracking table | New tmux_cost_history table | Reuse `external_service_costs` with notes prefix | Existing schema, existing UI, no migration |
| Idle timeout config | Hardcode thresholds in code | Store in `app_settings` encrypted table | Survives redeploy, user-editable via ConfigurationPage |

**Key insight:** Phase 43, 42, and 45 already built the hardest parts (reliable idle detection, config storage, cost history). Phase 48 is primarily orchestration + the graceful-shutdown primitive.

## Common Pitfalls

### Pitfall 1: Pause-work Output Unpredictability

**What goes wrong:** Parsing `/gsd:pause-work` output to detect "success" fails because:
- Output format changes between GSD versions
- Output is buffered differently in tmux
- Pane capture timing races with output streaming

**Why it happens:** `/gsd:pause-work` is a complex workflow with multiple decision points and handoff writes.

**How to avoid:**
- **Don't** build a regex-heavy parser expecting exact output format
- **Do** inspect actual output empirically (run `/gsd:pause-work` manually in tmux, capture what appears)
- **Do** use a fixed timeout (e.g., 30s) as the primary signal; treat marker detection (commit, STATE.md) as a bonus confirmation
- **Do** treat pause-work failure gracefully: kill tmux anyway and notify user

**Warning signs:**
- Idle detector kills sessions without pause-work completing
- SESSION file exists but State.md is stale
- Telegram notifications say "pause-work failed" repeatedly for same project

### Pitfall 2: Race Between Pane Capture and tmux Kill

**What goes wrong:** `gracefulShutdown()` kills tmux while pause-work is still writing, causing incomplete handoff.

**Why it happens:** tmux is asynchronous; pane capture may lag behind actual execution by 100-500ms.

**How to avoid:**
- **Always** add a grace buffer after pause-work markers are detected (e.g., 1s)
- **Do** verify tmux session still exists before kill (it may have exited on its own)
- **Do** log the action to console so you can see timing in debug output

**Warning signs:**
- Handoff .continue-here.md files are corrupted or truncated
- Following phase finds incomplete task context

### Pitfall 3: Missing PROXY_PREFIXES for New Routes

**What goes wrong:** New `/api/gsd/projects/:name/tmux-cost` route is shadowed by Railway's proxy fallback in production, returning empty response.

**Why it happens:** Phase 45 post-deploy bug: new routes must be explicitly listed in `server/routes/proxy.js` PROXY_PREFIXES or Railway's Cloudflare tunnel shadows them.

**How to avoid:**
- **Always** add new `/api/*` routes to PROXY_PREFIXES in proxy.js **before** the route handler is defined
- **Do** test on Railway (not localhost) before marking complete
- **Recommendation:** Plan-checker should flag this (add to checklist)

**Warning signs:**
- Route works locally; returns 502 on Railway
- Network tab shows correct URL but response is empty/cached from earlier

### Pitfall 4: Autopilot Session False Idle Positives

**What goes wrong:** A legitimate autopilot run gets killed because it's between actions (status='waiting', no pane output change) for >2 hours.

**Why it happens:** Autopilot may pause between phases, waiting for user review or next scheduled action.

**How to avoid:**
- **Always** check if project has an active autopilot run before applying idle-close
- **Do** use 2× threshold (4h default) for sessions with active runs
- **Do** store autopilot run info accessible to idle detector (query `autopilot_runs` table for `project_id` + status != 'completed')

**Warning signs:**
- Autopilot sessions die unexpectedly mid-workflow
- `/api/autopilot/status/:project` shows active run, but session is paused

### Pitfall 5: Telegram Notification Spam

**What goes wrong:** Every idle close sends a Telegram message; if 10 sessions are idle, user gets 10 messages.

**Why it happens:** Notification logic didn't batch or rate-limit.

**How to avoid:**
- **Do** aggregate multiple kills into a single daily summary: "Killed 3 idle sessions today: project-X ($4.50), project-Y ($2.10), ..."
- **Do** only notify on first kill per session per day; suppress repeats
- **Optional:** Add Telegram setting "disable idle-close notifications" (Phase 42 config scope)

**Warning signs:**
- Telegram chat flooded with "[project] killed session" messages
- Users turn off Telegram alerts to escape spam

## Code Examples

Verified patterns from official codebase and existing implementations.

### Example 1: Detect Idle Using Phase 43 Signals

```javascript
// server/gsd/idleDetector.js — verify idle condition

const { paneHashCache } = require('./tmux'); // (export this from tmux.js)
const { detectSessionState } = require('./tmux');

async function isSessionIdle(sessionName, thresholdMs = 2 * 60 * 60 * 1000) {
  // Both conditions must hold:
  // 1. Status = waiting
  const state = await detectSessionStateAsync(sessionName);
  if (state !== 'waiting') return false;
  
  // 2. Pane unchanged for threshold
  const cache = paneHashCache.get(sessionName);
  if (!cache?.lastChangedAt) return false;
  
  const elapsed = Date.now() - cache.lastChangedAt;
  return elapsed > thresholdMs;
}

// Source: server/gsd/tmux.js (Phase 43 implementation)
```

### Example 2: Send Keys to Tmux (Existing Pattern)

```javascript
// Source: server/routes/gsd.js lines 298-300 (smart-send route)

const { execFileSync } = require('child_process');

function sendKeysToTmux(sessionName, text) {
  if (text.length > 1000) {
    // Large text: buffer → paste
    const load = spawnSync('tmux', ['load-buffer', '-'], { 
      input: text, encoding: 'utf8' 
    });
    if (load.status !== 0) throw new Error('Failed to load buffer');
    spawnSync('tmux', ['paste-buffer', '-t', sessionName]);
    execFileSync('tmux', ['send-keys', '-t', sessionName, '', 'Enter']);
  } else {
    // Small text: direct send-keys
    execFileSync('tmux', ['send-keys', '-t', sessionName, text, 'Enter'], 
      { stdio: 'ignore' }
    );
  }
}
```

### Example 3: Capture Pane and Poll (Existing Pattern)

```javascript
// Source: server/gsd/tmux.js lines 148-158 (capturePaneText + polling)

const { execFileSync } = require('child_process');

function capturePaneText(sessionName) {
  try {
    return execFileSync('tmux', ['capture-pane', '-p', '-J', '-t', sessionName], 
      { encoding: 'utf8', timeout: 2000 }
    );
  } catch {
    return null;
  }
}

// Poll for marker in captured output:
let attempts = 0;
const maxAttempts = 30; // 30s at 1s interval

while (attempts < maxAttempts) {
  const output = capturePaneText(sessionName);
  if (output && /commit \w{7}|Handoff created/.test(output)) {
    // pause-work succeeded
    return { ok: true, completed: true };
  }
  await new Promise(r => setTimeout(r, 1000));
  attempts++;
}

// Timeout — treat as failure but proceed with kill
return { ok: false, completed: false };
```

### Example 4: Log Cost to external_service_costs (Phase 45 Pattern)

```javascript
// Reuse Phase 45 pattern for cost logging

const { v4: uuidv4 } = require('uuid');
const { db } = require('../db');

function logTmuxCostEstimate(dailyEstimate, detailString) {
  const now = new Date().toISOString();
  const costId = uuidv4();
  
  // Insert daily cost estimate
  db.prepare(`
    INSERT INTO external_service_costs (
      id, service, cost_usd, checked_at, source, notes
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    costId,
    'tmux-idle-estimate',
    dailyEstimate,
    now,
    'api',
    `tmux_cost_estimate:${detailString}` // e.g., "proj1:4.0GB,proj2:2.5GB"
  );
}

// Source: server/db.js (external_service_costs schema, Phase 45)
```

### Example 5: Telegram Notification (Existing Pattern)

```javascript
// Source: server/gsd/telegram.js line 114

const { sendNotification } = require('../gsd/telegram');

// Send notification after kill
await sendNotification(
  projectName,
  `Idle session auto-closed after ${idleMinutes}m. ` +
  `Handoff saved via /gsd:pause-work. ` +
  `Session was idle ≈$${costPerDay.toFixed(2)}/day.`
);

// On pause-work timeout:
await sendNotification(
  projectName,
  `⚠️ Idle session killed but pause-work timed out. ` +
  `Manual /gsd:resume-work checkpoint may be needed.`
);
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Manual Pause button = immediate `tmux kill-session` | Graceful shutdown via `/gsd:pause-work` handoff | Prevents lost work, enables session recovery |
| No idle detection | Automatic idle-close after 2h (waiting + no pane change) | ~$40/month savings per idle 4GB session |
| No per-session cost visibility | $/day column on Services page + daily cost log | Users can see financial impact of idle sessions |
| Hardcoded idle threshold in code | Editable global setting in ConfigurationPage | Users can tune threshold per deployment |

**Recent stabilizations:**
- Phase 43 paneHashCache (2 months stable): Idle detection threshold tuned to 3s change window; proved reliable
- Phase 45 cost tracking (3 weeks live): `external_service_costs` + notes prefix pattern confirmed working
- Phase 42 ConfigurationPage (1 week live): Encrypted `app_settings` storage pattern proven for credentials

## Open Questions

1. **What are the exact completion markers for `/gsd:pause-work`?**
   - What we know: `/gsd:pause-work` writes `.continue-here.md`, commits as WIP, creates STATE.md entry
   - What's unclear: Which of these outputs appears in tmux pane capture? In what order? Is there a final "success" message?
   - Recommendation: Inspect actual workflow at `.claude/get-shit-done/workflows/pause-work.md` and/or run it manually in tmux, capture output, determine regex or timeout strategy

2. **Should Railway RAM rate be hardcoded, env var, or settings table?**
   - What we know: Phase 45 uses `app_settings` for credentials (already encrypted)
   - Options: 
     - Hardcode $10/GB-month (simple, but requires code redeploy to change)
     - Env var `RAILWAY_RAM_RATE_MONTHLY` (standard ops practice, but Railway env var redeploy can lag)
     - `app_settings` table (survives redeploy, user-editable via ConfigurationPage)
   - Recommendation: Store in `app_settings` (consistent with idle_timeout_minutes setting)

3. **What is the "active autopilot run" signal?**
   - What we know: `autopilot_runs` table has `status` (idle/running/completed/failed/stopped)
   - Query: `SELECT COUNT(*) FROM autopilot_runs WHERE project_id = ? AND status IN ('idle', 'running')`
   - Need to verify: Does "idle" mean "between actions" (don't kill) or "paused by user" (ok to kill)?
   - Recommendation: Treat status IN ('idle', 'running') as "active"; don't idle-close. Confirm with autopilot.js

4. **Grace buffer duration: how long after pause-work to wait before kill?**
   - What we know: State transitions lag pane output by 100-500ms
   - Options: 0.5s, 1s, 2s, 5s
   - Recommendation: 1s (balances safety vs. latency). If markers still incomplete after 1s, tmux state has diverged; safe to kill anyway.

5. **Should idle-close be opt-in or opt-out on deploy?**
   - Locked decision: "Enabled by default at 2h threshold — no opt-in required."
   - Question: What if user wants to disable entirely (sets threshold to 0 or special value)?
   - Recommendation: Threshold of 0 = disabled; UI shows "0 minutes = disabled"

## Validation Architecture

Skip this section entirely — workflow.nyquist_validation is not present in `.planning/config.json`, so existing test infrastructure assumption applies.

**Current test approach (from Phase 43/45 precedent):**
- Idle detection: unit test with mock `detectSessionState` + `paneHashCache` state
- Graceful shutdown: integration test spinning up a test tmux session, sending keys, verifying capture
- Cost calculation: unit test with hardcoded RSS values, verify $/day math
- Cost logging: SQLite test, verify `external_service_costs` row structure

Existing patterns in `server/__tests__/` (e.g., `api.test.js`, `services-costs-route.test.js`) provide templates.

## Sources

### Primary (HIGH confidence)

- **Phase 43 paneHashCache implementation** (`server/gsd/tmux.js` lines 13-88)
  - Verified: `paneHashCache` maintains `{ hash, lastChangedAt }` per session
  - Verified: `CHANGE_HEURISTIC_WINDOW_MS = 3000` tuning
  - Verified: `stripInputBoxForHash()` implementation
  - **Source file:** `/data/home/gsddashboard/server/gsd/tmux.js`

- **detectSessionState logic** (`server/gsd/tmux.js` lines 245-285)
  - Verified: Returns 'working'/'waiting'/'paused'/'archived' via pattern matching
  - Verified: Current activity patterns for Claude Code output
  - **Source file:** `/data/home/gsddashboard/server/gsd/tmux.js`

- **Existing Pause-Session Route** (`server/routes/gsd.js` lines 342-373)
  - Verified: Current implementation uses `execFileSync('tmux', ['kill-session', '-t', sessionName])`
  - Verified: Proxy mode delegation via GSD_DATA_URL
  - **Source file:** `/data/home/gsddashboard/server/routes/gsd.js`

- **Smart-Send Route (tmux send-keys pattern)** (`server/routes/gsd.js` lines 242-305)
  - Verified: Pattern for sending text to tmux (short: direct send-keys, long: load-buffer + paste)
  - Verified: Error handling and session validation
  - **Source file:** `/data/home/gsddashboard/server/routes/gsd.js`

- **external_service_costs schema** (`server/db.js` lines 162-392)
  - Verified: Columns: id, service, cost_usd, checked_at, source, notes, description, currency
  - Verified: `notes` column used for linking (manual:, recurring:, email:, unparsed)
  - Verified: Phase 45 pattern for notes prefix linking
  - **Source file:** `/data/home/gsddashboard/server/db.js`

- **app_settings encrypted storage** (`server/db.js` lines 311-318, server/routes/app-settings.js`)
  - Verified: AES-256-GCM encryption via `server/crypto.js`
  - Verified: Never returns plaintext; only metadata in API responses
  - Verified: Used for railway_pat, openai_admin_key, vercel_token (Phase 45)
  - **Source file:** `/data/home/gsddashboard/server/routes/app-settings.js`

- **Telegram Notification Pattern** (`server/gsd/telegram.js` lines 114-127)
  - Verified: `sendNotification(projectName, text, options)` function signature
  - Verified: Handles Telegram send, no return value, exceptions caught
  - **Source file:** `/data/home/gsddashboard/server/gsd/telegram.js`

- **/gsd:pause-work Command Output** (`/data/home/.claude/commands/gsd/pause-work.md`)
  - Verified: Workflow creates `.continue-here.md` in phase directory
  - Verified: Commits as WIP with message `"wip: [phase-name] paused at task [X]/[Y]"`
  - **Expected markers in pane:** commit hash output and/or git status confirmation
  - **Source file:** `/data/home/.claude/commands/gsd/pause-work.md`

- **PROXY_PREFIXES (Phase 45 post-deploy bug pattern)** (`server/routes/proxy.js` lines 1-13)
  - Verified: Routes must be explicitly listed to avoid Railway shadowing
  - Verified: `/api/services`, `/api/app-settings`, `/api/webhooks` all explicitly listed
  - **Lesson:** New `/api/gsd/...` routes need entry or they will fail on Railway
  - **Source file:** `/data/home/gsddashboard/server/routes/proxy.js`

### Secondary (MEDIUM confidence)

- **StateBroadcaster stateEnteredAt tracking** (`server/gsd/stateBroadcaster.js` lines 10-74)
  - Verified: Maintains in-memory snapshot of sessionState + stateEnteredAt per project
  - Verified: Timestamps are ISO strings (`nowIso`)
  - Used by: `/api/gsd/projects` to resolve canonical state transition times
  - **Source file:** `/data/home/gsddashboard/server/gsd/stateBroadcaster.js`

- **Railway cost convention** (CONTEXT.md, Phase 45 discussions)
  - User mental model: ~$0.33/GB-day or ~$10/GB-month
  - Approximate Linux `:RSS` from ps command: standard portable method
  - Not a definitive Railway rate; flagged as "Claude's Discretion"

- **Autopilot run status structure** (`server/routes/autopilot.js` lines 105-106)
  - Verified: `entry.manager.getStatus()` returns `{ status, runId, currentPhaseNum, projectName }`
  - Status values: 'idle', 'running', 'completed', 'failed', 'stopped'
  - **Uncertainty:** Does 'idle' mean "between actions" or "paused"? Need clarification.

### Tertiary (LOW confidence)

- **Exact pause-work output format:** Inferred from workflow description, not verified against live output
  - Recommendation: Inspect empirically before implementing parsing logic
  - Fallback: Use fixed 30s timeout rather than marker-dependent logic

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH - All reused components have 3-month+ track record; infrastructure stable
- **Graceful shutdown pattern:** MEDIUM - Core logic sound (send + wait + kill), but pause-work marker detection requires empirical verification
- **Idle detection threshold:** HIGH - Phase 43 `paneHashCache` + `detectSessionState` proven reliable
- **Cost measurement:** MEDIUM - ps RSS method is standard, but Railway rate is approximate; accuracy sufficient for purpose
- **Configuration storage:** HIGH - Phase 42/45 `app_settings` pattern proven for credentials
- **Proxy integration:** HIGH - PROXY_PREFIXES lesson learned from Phase 45 post-deploy bug

**Research date:** 2026-04-15
**Valid until:** 2026-04-30 (stable infrastructure, 2-week window for planner decisions)
**Refreshed by:** Phase 48 planning sprint

---

*Phase: 48-idle-session-cost-controls*
*Research completed: 2026-04-15*
