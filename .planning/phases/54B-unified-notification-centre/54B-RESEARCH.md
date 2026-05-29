# Phase 54B: Unified Notification Centre - Research

**Researched:** 2026-05-29
**Domain:** Notification architecture, Telegram delivery, event policy engine, SQLite schema migration
**Confidence:** HIGH (all claims verified against live codebase)

---

## Summary

Phase 54B replaces a fragmented, ad-hoc Telegram delivery system with a single policy-governed `NotificationCentre` module. Currently there are three independent call sites that invoke `sendNotification()` directly — none of them consult per-project settings, enforce rate limits, or support quiet hours. The architectural shift moves all delivery through one module that reads policy from SQLite before deciding whether to send.

The existing event infrastructure (stateBroadcaster `project_state_change`, feedStore landmark events, idleDetector auto-close, gracefulShutdown) already produces the exact events Phase 54B needs — no new event sources are required. The work is purely in the delivery layer: create `NotificationCentre`, route all existing callers through it, store policy in a new `notification_policy` table, and expose settings in ConfigPage.

The UI-SPEC is fully approved and prescribes the exact schema, component layout, and migration path from Phase 42's `telegram_alerts` field. This research fills in the server-side architecture gaps the spec left open.

**Primary recommendation:** Build `NotificationCentre` as a thin policy-checking wrapper around the existing `telegram.js` delivery primitives. It reads `notification_policy` from SQLite on each decision (not cached), enforces the 10 event-type toggles, applies rate limiting and quiet hours, then delegates to `sendNotification()`. Replace the three existing `sendNotification()` call sites with `NotificationCentre.notify(eventType, projectName, text, options)`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Telegram delivery primitives (API call, poller, formatForTelegram) | Backend — `server/gsd/telegram.js` | — | Already exists; owns the HTTP transport |
| Policy evaluation (event toggles, rate limit, quiet hours) | Backend — `server/gsd/notificationCentre.js` (new) | — | Policy is server-side state; client never evaluates policy |
| Notification policy storage | SQLite `notification_policy` table (new) | `project_settings` (per-project override) | Global settings in new table; per-project override extends existing table |
| Policy CRUD API | Backend — extend `GET/PUT /api/config/project-settings` | New `GET/PUT /api/notifications/policy` for global | Reuse existing config route for per-project; new route for global |
| Notification history storage | SQLite `notification_log` table (new) | — | Needed for deduplication window + UI history panel (Wave 2) |
| Settings UI (Notifications tab) | Frontend — `ConfigPage.tsx` extension | — | UI-SPEC mandates extending ConfigPage, not a new page |
| Test Telegram button | Frontend + Backend — new `POST /api/notifications/test` route | — | One-shot delivery test without full policy evaluation |
| Event ingestion → NotificationCentre bridge | Backend — call sites in `gsd.js`, `gracefulShutdown.js`, `stateBroadcaster.js`, `index.js` | — | 3 existing call sites + stateBroadcaster hook needed |

---

## Current State Audit (VERIFIED: codebase grep)

### Existing Telegram Call Sites (ALL must be replaced by NotificationCentre)

| File | Line | Event Emitted | Current Policy Check |
|------|------|---------------|---------------------|
| `server/routes/gsd.js:177` | `sendNotification(name, body, options)` | `working → waiting/paused` state transition | `shouldNotify()` cooldown only (1 min/project) |
| `server/gsd/gracefulShutdown.js:81,83` | `sendNotification(projectName, ...)` | Idle auto-close success/timeout | None |
| `server/index.js:323,333` | `sendNotification('dashboard', ...)` | Disk at 85%/95% | None |

**Total: 3 call sites.** The gsd.js site is the only one implementing even minimal policy (cooldown). The other two bypass all policy.

### Existing `telegram_alerts` Schema (Phase 42, VERIFIED: db.js)

```js
// DEFAULT_GLOBAL_SETTINGS in db.js
telegram_alerts: { taskComplete: false, waitingOnUser: false }
```

The `project_settings` table has `telegram_alerts TEXT NOT NULL DEFAULT '{}'` — a JSON blob with at most `{ taskComplete, waitingOnUser, state_change, completion, error, waiting_input }` keys. None of these map cleanly to the NTF-02 event types, so the migration in NTF-05 requires explicit key mapping (defined in UI-SPEC § Migration from Phase 42).

### Existing `shouldNotify()` Cooldown (VERIFIED: telegram.js)

```js
const notifyCooldowns = new Map(); // project → timestamp
const COOLDOWN_MS = 60_000; // 1 minute between notifications per project
```

This is an in-memory, per-project, event-type-agnostic cooldown. It resets on server restart. NotificationCentre must supersede this with the rate-limit-per-hour model from NTF-04.

### feedStore Events Already in Flight (VERIFIED: stateBroadcaster.js)

The stateBroadcaster already pushes to feedStore for:
- `waiting_input` — on `rawPaneState` transition to `'waiting'`  
- `plan_complete`, `verify_passed`, `verify_failed`, `phase_complete` — via `extractLandmarkEvent(paneText)`

These feedStore events are the natural hook points for `NotificationCentre.notify()` — no new detection needed.

### idleDetector Auto-Close Events (VERIFIED: gracefulShutdown.js)

`gracefulShutdown.js` calls `sendNotification()` directly after auto-close. This is the `idle_session_closed` event for NotificationCentre.

### Disk Alert Events (VERIFIED: index.js)

`server/index.js` maintenance cron calls `sendNotification('dashboard', ...)` for disk 85%/95%. These map to the `external_service_cost_anomaly` event type (closest semantic match) or can be treated as a new `system_alert` type that is always on.

---

## Standard Stack

### Core (all existing in codebase, no new dependencies needed)

| Module | Version | Purpose | Notes |
|--------|---------|---------|-------|
| `better-sqlite3` | existing | Notification policy + log storage | All DB access via prepared statements per project pattern |
| `server/gsd/telegram.js` | existing | Telegram HTTP delivery | Retain as-is; NotificationCentre wraps it |
| `express` | existing | API routes for policy CRUD + test | Extend existing config route |

### No New npm Dependencies

All required capabilities exist in the codebase. `NotificationCentre` is a new module with zero new npm packages. [VERIFIED: codebase scan]

---

## Architecture Patterns

### System Architecture Diagram

```
Event Sources                  NotificationCentre                  Delivery
──────────────                 ──────────────────                  ────────
stateBroadcaster               ┌─────────────────────┐
  project_state_change  ──────▶│ notify(eventType,    │
  (waiting_input,              │   projectName, text) │
  plan_complete,               │                      │
  verify_failed, ...)          │  1. Load global      │
                               │     policy from DB   │
gracefulShutdown               │  2. Check event      │
  idle_auto_close      ──────▶│     type enabled?    │──── NO ──▶ drop
                               │  3. Check quiet      │
index.js maintenance           │     hours?           │──── YES ──▶ queue/drop
  disk alerts          ──────▶│  4. Check rate        │
                               │     limit (N/hr)?    │──── OVER ──▶ dedup/drop
routes/gsd.js                  │  5. Load per-project │
  (state transition)   ──────▶│     override?        │
                               │  6. Log to           │
                               │     notification_log │
                               │  7. sendNotification │──────────▶ Telegram Bot API
                               └─────────────────────┘
                                        │
                               Policy Storage (SQLite)
                               ┌─────────────────────┐
                               │ notification_policy  │
                               │ (global settings)    │
                               │                      │
                               │ project_settings     │
                               │ (per-project toggle) │
                               └─────────────────────┘
```

### Recommended Project Structure (new files only)

```
server/gsd/
├── notificationCentre.js    # New — policy engine + delivery orchestrator
server/routes/
├── notifications.js         # New — GET/PUT /api/notifications/policy, POST /api/notifications/test
client/src/components/
├── NotificationPolicyPanel.tsx  # New — Notifications tab content in ConfigPage
client/src/
├── api.ts                   # Extend — add notification policy API methods
```

### Pattern 1: NotificationCentre Module Interface

```js
// server/gsd/notificationCentre.js
'use strict';

const { sendNotification } = require('./telegram');
const { db } = require('../db');

// Event types from NTF-02 + default policy table
const EVENT_DEFAULTS = {
  waiting_input:           { enabled: true,  highPriority: true,  rateLimited: false },
  plan_complete:           { enabled: true,  highPriority: true,  rateLimited: false },
  verify_failed:           { enabled: true,  highPriority: true,  rateLimited: false },
  verify_passed:           { enabled: false, highPriority: false, rateLimited: false },
  idle_session_closed:     { enabled: true,  highPriority: false, rateLimited: true  },
  cost_anomaly:            { enabled: true,  highPriority: false, rateLimited: true  },
  github_issue_filed:      { enabled: false, highPriority: false, rateLimited: false },
  session_started:         { enabled: false, highPriority: false, rateLimited: false },
  tool_use:                { enabled: false, highPriority: false, rateLimited: false }, // permanent off
  turn_complete:           { enabled: false, highPriority: false, rateLimited: false },
  system_alert:            { enabled: true,  highPriority: true,  rateLimited: false }, // disk alerts
};

// Rate limit window: in-memory counter reset hourly (per NTF-04)
const rateLimitCounters = new Map(); // key = 'global' or 'projectName'

/**
 * Primary entry point. Evaluates policy then delivers via telegram.js.
 * @param {string} eventType — one of EVENT_DEFAULTS keys
 * @param {string} projectName — for per-project override lookup
 * @param {string} text — message body
 * @param {string[]} [options] — optional inline keyboard buttons
 */
async function notify(eventType, projectName, text, options) {
  // ... policy evaluation pipeline
}

module.exports = { notify, EVENT_DEFAULTS };
```

### Pattern 2: Policy Storage Schema (new migration in db.js)

```sql
-- notification_policy: global settings
CREATE TABLE IF NOT EXISTS notification_policy (
  key TEXT PRIMARY KEY DEFAULT '__global__',
  enabled INTEGER NOT NULL DEFAULT 1,
  quiet_hours_from TEXT,          -- HH:MM or NULL
  quiet_hours_to TEXT,            -- HH:MM or NULL
  rate_limit_per_hour INTEGER NOT NULL DEFAULT 5,
  event_toggles TEXT NOT NULL DEFAULT '{}',  -- JSON object: { waiting_input: true, ... }
  archived_legacy_alerts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- notification_log: delivery history + deduplication ledger
CREATE TABLE IF NOT EXISTS notification_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  project_name TEXT,
  message_text TEXT,
  delivered INTEGER NOT NULL DEFAULT 0,  -- 1 = sent to Telegram, 0 = suppressed
  suppress_reason TEXT,                  -- 'rate_limit', 'quiet_hours', 'disabled', 'dedup'
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_notification_log_type_project 
  ON notification_log(event_type, project_name, created_at);
```

### Pattern 3: Per-Project Override (extends existing project_settings)

```sql
-- Add notification_override column to project_settings (additive migration)
ALTER TABLE project_settings ADD COLUMN notification_enabled INTEGER; -- NULL = use global
ALTER TABLE project_settings ADD COLUMN notification_quiet_override INTEGER NOT NULL DEFAULT 0;
```

This avoids creating a separate per-project notification table. The existing `project_settings` row already exists per project via Phase 42. The `notification_enabled` column being NULL means "inherit global" — the same pattern used by `suppress_context_reask` and `suppress_plan_ceremony`. [ASSUMED: same pattern will work — confirmed by reviewing Phase 56 suppress columns in db.js]

### Pattern 4: NTF-04 Rate Limiting and Deduplication

```js
// In-memory: rate counter per hour reset on wall-clock boundary
// 20 events burst in 10 seconds → at most rate_limit_per_hour notifications
// Deduplication: two projects same event within 30s → one combined message

const HOUR_MS = 60 * 60 * 1000;
// Map: reset timestamp → { count, resetAt }
let rateWindow = { count: 0, resetAt: Date.now() + HOUR_MS };

function checkRateLimit(policy) {
  if (Date.now() > rateWindow.resetAt) {
    rateWindow = { count: 0, resetAt: Date.now() + HOUR_MS };
  }
  if (rateWindow.count >= (policy.rate_limit_per_hour || 5)) return false;
  rateWindow.count++;
  return true;
}

// Deduplication: use notification_log — if same event_type delivered
// in last 30s, suppress with 'dedup' reason
function isDuplicate(eventType, projectName) {
  const cutoff = new Date(Date.now() - 30_000).toISOString();
  const row = db.prepare(
    `SELECT id FROM notification_log
     WHERE event_type = ? AND project_name = ? AND delivered = 1
     AND created_at > ? LIMIT 1`
  ).get(eventType, projectName, cutoff);
  return !!row;
}
```

### Anti-Patterns to Avoid

- **Calling `sendNotification()` directly from route handlers:** All three existing call sites must be replaced. New code must never call `telegram.sendNotification()` directly — only through `notificationCentre.notify()`.
- **Caching the policy in memory:** Policy is read from SQLite on each decision. SQLite reads are cheap (sub-millisecond) and caching would mean settings changes don't take effect until server restart.
- **Rate limiting per-project independently:** NTF-04 requires a global rate limit counter across all projects, not N independent per-project counters. One global window that counts all deliveries.
- **Quiet hours using server timezone:** The UI-SPEC notes quiet hours are stored as HH:MM UTC and displayed with UTC clarification. Use UTC throughout; never convert on the server.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Telegram HTTP delivery | Custom HTTP client | `telegram.js` `apiCall()` + `sendNotification()` already exists | Already handles timeouts, error suppression, message length cap |
| Inline keyboard buttons (reply options) | Custom reply routing | `telegram.js` `parseOptions()` + `injectTmux()` + reply poller | Full round-trip already implemented |
| Policy JSON parsing | Custom parser | `JSON.parse()` with try/catch (existing pattern in config.js) | Matches established `telegram_alerts` parse pattern |
| Rate limit persistence | Redis / external store | In-memory counter + `notification_log` for deduplication window | Server restarts are rare; rate window resets on restart is acceptable per spec |

---

## Common Pitfalls

### Pitfall 1: Circular Dependency — notificationCentre → telegram → tmux
**What goes wrong:** `notificationCentre.js` imports `telegram.js` which imports `tmux.js` which imports `db.js`. If `notificationCentre.js` is also imported by `stateBroadcaster.js`, and `stateBroadcaster.js` is also imported by `db.js` indirectly, Node.js will produce a half-initialized module.
**Why it happens:** The existing codebase avoids this by using `require()` lazily (e.g., `telegram.js` uses `require('../db').stmts` inside a function, not at module top).
**How to avoid:** Follow the lazy-require pattern: `notificationCentre.js` should `require('./telegram')` and `require('../db')` at the function call level, not at module top. Or use the DI pattern already established by `gracefulShutdown.js` (injectable `notifyFn`).
**Warning signs:** `TypeError: Cannot read property 'X' of undefined` on first call after startup.

### Pitfall 2: stateBroadcaster Push vs. NotificationCentre Decision Race
**What goes wrong:** `stateBroadcaster._testPollOnce()` pushes to `feedStore` and calls `broadcastFn('feed_event', ...)` on state transitions. If `NotificationCentre.notify()` is called in the same sync execution, a project that transitions waiting → working → waiting in rapid succession (2s poll cycle) could generate two notifications before the rate limiter catches up.
**Why it happens:** The 2s poll interval means two ticks can fire very quickly; the `notification_log` deduplication window (30s) should catch this, but only if the log write is synchronous (it is, with better-sqlite3).
**How to avoid:** Write to `notification_log` BEFORE calling `sendNotification()` — this ensures the dedup check is effective even if `sendNotification()` is async.

### Pitfall 3: Migration Losing Phase 42 User Preferences
**What goes wrong:** The NTF-05 migration reads the old `telegram_alerts` JSON and maps to new event toggles. If a user had custom per-project settings (e.g., one project with Telegram off), the migration must handle NULL/empty rows.
**Why it happens:** Phase 42 only writes `project_settings` rows when a user explicitly saves settings — many projects have no row at all.
**How to avoid:** Migration reads `project_settings` rows where `telegram_alerts != '{}'`; projects with no row inherit global defaults already. Only create new rows when old data exists and needs mapping.

### Pitfall 4: Quiet Hours UTC vs. User Timezone Confusion
**What goes wrong:** HH:MM stored as UTC; user configured 11pm–7am thinking it's their local time; notifications fire at wrong times.
**Why it happens:** The server has no user timezone context. `<input type="time">` returns local time but the server sees whatever the UI sends.
**How to avoid:** Store as HH:MM UTC (spec-mandated). In the UI, show "Configured: 11pm–7am UTC" helper text (UI-SPEC already specifies this). Server comparison: `new Date().toISOString().slice(11, 16)` gives current UTC HH:MM for comparison.

### Pitfall 5: `sendNotification()` Still Called Directly After Migration
**What goes wrong:** After Phase 54B ships, a future dev adds a new notification and calls `telegram.sendNotification()` directly, bypassing policy.
**Why it happens:** `telegram.js` remains a module with exported `sendNotification`. 
**How to avoid:** Add a JSDoc `@deprecated` comment to `sendNotification` in `telegram.js`: "Use notificationCentre.notify() instead." Do not remove the export — `gracefulShutdown.js` uses it via DI injection and that interface should remain testable.

---

## Phase 42 Migration Path (NTF-05 Detail)

The UI-SPEC provides the mapping table; this section specifies the server-side implementation:

```js
// Run once at startup if notification_policy row does not exist yet
// AND project_settings has telegram_alerts data
function migratePhase42Settings() {
  const globalSettings = getGlobalSettings(); // from db.js
  const legacyAlerts = globalSettings.telegram_alerts; // { taskComplete, waitingOnUser, ... }
  
  // mapping: Phase 42 key → Phase 54B event type
  const MAP = {
    state_change:    'waiting_input',   // or session_started — waiting_input is closer
    completion:      'plan_complete',
    error:           'verify_failed',
    waiting_input:   'waiting_input',   // duplicate of state_change → merged
    taskComplete:    'plan_complete',
    waitingOnUser:   'waiting_input',
  };
  
  // Build event_toggles from legacy values
  const event_toggles = { ...DEFAULT_EVENT_TOGGLES };
  for (const [oldKey, newType] of Object.entries(MAP)) {
    if (legacyAlerts[oldKey] === true && newType in event_toggles) {
      event_toggles[newType] = true;
    }
  }
  
  // Insert notification_policy row
  // Set archived_legacy_alerts = 0 (becomes 1 after first successful delivery)
  insertNotificationPolicy({ event_toggles, archived_legacy_alerts: 0 });
}
```

After one successful delivery via the new system, set `archived_legacy_alerts = 1` and stop reading from `telegram_alerts`.

---

## NTF Requirements → Implementation Map

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NTF-01 | All Telegram output flows through a single `NotificationCentre` module; no tmux-level Telegram sends remain | 3 call sites identified: gsd.js:177, gracefulShutdown.js:81/83, index.js:323/333. All must route through new `notificationCentre.notify()`. |
| NTF-02 | Event sources are existing Dashboard event bus — not tmux scraping | feedStore already pushes `waiting_input`, `plan_complete`, `verify_passed`, `verify_failed`. stateBroadcaster is the bridge. idleDetector/gracefulShutdown already fires idle events. No new event detection needed. |
| NTF-03 | Settings page: Notifications section with global enable/disable, per-event toggles, quiet hours, rate limit; per-project overrides on project Config tab | `notification_policy` table (new) stores global settings. `project_settings` table (existing) gets 2 new columns for per-project override. ConfigPage.tsx gets new Notifications tab per UI-SPEC. |
| NTF-04 | Rate limiting N/hour, deduplication (30s window), quiet hours, stage-aware defaults; verified by 20-event burst → ≤5 deliveries | In-memory hourly counter + `notification_log` table for 30s dedup window. Quiet hours: UTC HH:MM comparison. Stage-aware: read project `stage` from gsd-projects.json, apply stricter defaults for draft/alpha. |
| NTF-05 | Migration: Phase 42 `telegram_alerts` read on startup, mapped to new schema, archived after first successful delivery; old tmux hooks removed | Migration function runs at server startup (idempotent). Audit of hook files to remove any direct Telegram calls (none found in hook-handler.js — hooks never called Telegram). |
</phase_requirements>

---

## Code Examples

### Calling NotificationCentre from stateBroadcaster (VERIFIED: stateBroadcaster.js patterns)

```js
// In _testPollOnce(), after feedStore.pushEvent(waitingEntry):
const { notify } = require('./notificationCentre');
// ...
if (sessionState === 'waiting' && prevRaw !== 'waiting') {
  feedStore.pushEvent(waitingEntry);
  broadcastFn('feed_event', feedStore.getEvents()[0]);
  // NEW: route to notification centre
  const paneText = await captureFn(project.tmux_session);
  const options = paneText ? parseOptions(paneText) : [];
  const cleanText = paneText ? formatForTelegram(paneText) : '';
  notify('waiting_input', project.name, cleanText || 'Waiting for your input', options).catch(() => {});
}
```

### Replacing gsd.js direct call (VERIFIED: gsd.js:162-181)

```js
// BEFORE (gsd.js:177):
sendNotification(name, body, options).catch(() => {});

// AFTER:
const { notify } = require('../gsd/notificationCentre');
notify('waiting_input', name, body, options).catch(() => {});
// Delete the local shouldNotify() call — rate limiting moves into NotificationCentre
```

### Replacing gracefulShutdown DI (VERIFIED: gracefulShutdown.js:46)

```js
// gracefulShutdown.js already uses injectable notifyFn — change the default:
// BEFORE:
notifyFn = sendNotification,

// AFTER: 
const { notify } = require('./notificationCentre');
// In function signature:
notifyFn = (project, text) => notify('idle_session_closed', project, text),
```

### API Route Skeleton for Policy CRUD

```js
// server/routes/notifications.js
const router = express.Router();

// GET /api/notifications/policy — global policy settings
router.get('/policy', (req, res) => {
  const row = getNotificationPolicy(); // reads notification_policy table
  res.json({ policy: row });
});

// PUT /api/notifications/policy — update global policy
router.put('/policy', express.json(), (req, res) => {
  const { enabled, quiet_hours_from, quiet_hours_to, rate_limit_per_hour, event_toggles } = req.body;
  // validate + upsert
  upsertNotificationPolicy({ enabled, quiet_hours_from, quiet_hours_to, rate_limit_per_hour, event_toggles });
  res.json({ ok: true });
});

// POST /api/notifications/test — send test Telegram message
router.post('/test', async (req, res) => {
  const { sendNotification } = require('../gsd/telegram');
  try {
    await sendNotification('dashboard', 'Test notification from GSD Dashboard. Telegram delivery confirmed.');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-project cooldown in `notifyCooldowns` Map | Global hourly rate limit in NotificationCentre | Phase 54B | More predictable; survives project renaming |
| `telegram_alerts` JSON blob in `project_settings` | `notification_policy` table + project_settings additive columns | Phase 54B | Type-safe; supports 10 event types vs. 4 |
| `sendNotification()` called from 3 independent sites | Single `notificationCentre.notify()` entry point | Phase 54B | Policy enforced everywhere, including new call sites |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Per-project `notification_enabled` override stored as additive column on `project_settings` (NULL = inherit global) | Architecture Patterns | If this breaks existing queries, a separate `project_notification_overrides` table would be needed instead |
| A2 | Rate limit counter is global (across all projects), not per-project | Architecture Patterns | NTF-04 says "N/hour" without specifying scope; if per-project, the counter Map key changes |
| A3 | `tool_use` event type is "permanent off" (not configurable by user) per ROADMAP default policy table | Standard Stack | If user requests to enable it, the toggle must be added to the UI and DB |
| A4 | Disk alert events in index.js map to `system_alert` type (always on) rather than `cost_anomaly` | Architecture Patterns | Could be omitted from NTF-02 scope if treated as system-level, not user-facing |

---

## Open Questions

1. **Stage-aware defaults for `github_issue_filed` event**
   - What we know: NTF-04 says "stage-aware defaults (Draft < Launched)"; UI-SPEC shows `github_issue_filed` default is Off but "Launched only".
   - What's unclear: Should the event type be hidden/disabled in the UI for non-Launched projects, or just defaulted Off?
   - Recommendation: Grey out the toggle for non-Launched projects with "Launched stage only" label (matches UI-SPEC per-project overrides table showing stage gate).

2. **Quiet hours queueing vs. drop**
   - What we know: UI-SPEC copywriting says "excess events deduplicated or queued for later delivery" and mentions deferred state.
   - What's unclear: Wave 1 scope — does queued mean actually delivered at resume time, or just described as queued in the UI?
   - Recommendation: Wave 1 drops suppressed events and logs them as `suppress_reason = 'quiet_hours'`. Wave 2 (notification history page) can show "would have sent at X". True queued delivery is Phase 54B Wave 2 scope per UI-SPEC.

3. **Proxy mode (GSD_DATA_URL set)**
   - What we know: stateBroadcaster in proxy mode uses `proxyStateBroadcaster.js` which polls an upstream server; it does NOT call the local `broadcastFn` with real pane data. Telegram is only relevant on the local VPS.
   - What's unclear: Should NotificationCentre guard against running in proxy mode?
   - Recommendation: Check `!process.env.GSD_DATA_URL` before calling `notify()` in stateBroadcaster — same guard already used for idleDetector.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| TELEGRAM_BOT_TOKEN env var | Telegram delivery | Assumed set (Phase 42 shipped) | — | `ENABLED` flag in telegram.js is false; all notify() calls are no-ops |
| TELEGRAM_CHAT_ID env var | Telegram delivery | Assumed set (Phase 42 shipped) | — | Same |
| better-sqlite3 | notification_policy + notification_log tables | ✓ | existing | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `assert` (existing pattern: `server/routes/env.test.js`) |
| Config file | none — run with `node --test` |
| Quick run command | `npm run test:server` |
| Full suite command | `npm run test:server` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NTF-01 | `notificationCentre.notify()` calls `sendNotification()` | unit | `npm run test:server` | ❌ Wave 0 |
| NTF-01 | Old call sites removed (no direct `sendNotification` in gsd.js, gracefulShutdown, index.js) | unit | grep audit in test | ❌ Wave 0 |
| NTF-02 | stateBroadcaster calls `notify('waiting_input', ...)` on transition | unit | `npm run test:server` | ❌ Wave 0 |
| NTF-03 | `GET /api/notifications/policy` returns policy shape | unit | `npm run test:server` | ❌ Wave 0 |
| NTF-03 | `PUT /api/notifications/policy` persists and round-trips | unit | `npm run test:server` | ❌ Wave 0 |
| NTF-04 | 20-event burst in 10s produces ≤5 deliveries | unit | `npm run test:server` | ❌ Wave 0 |
| NTF-04 | Quiet hours suppresses non-high-priority events | unit | `npm run test:server` | ❌ Wave 0 |
| NTF-05 | Migration transforms old `telegram_alerts` to `notification_policy` correctly | unit | `npm run test:server` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:server`
- **Per wave merge:** `npm run test:server` (all tests)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `server/gsd/notificationCentre.test.js` — covers NTF-01, NTF-04 (policy evaluation, rate limit, quiet hours, dedup)
- [ ] `server/routes/notifications.test.js` — covers NTF-03 (API CRUD)
- [ ] `server/gsd/migration42.test.js` — covers NTF-05 (Phase 42 migration transform)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Existing cookieAuth covers all API routes |
| V3 Session Management | no | No new session concerns |
| V4 Access Control | no | Single-user dashboard; existing auth sufficient |
| V5 Input Validation | yes | Validate `notification_policy` fields: `enabled` boolean, `quiet_hours_from/to` as HH:MM regex, `rate_limit_per_hour` as integer 1–100, `event_toggles` as object with known keys only |
| V6 Cryptography | no | No secrets stored in notification system |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Telegram Bot Token leakage via notification log | Information Disclosure | Never log BOT_TOKEN; notification_log stores message text but not credentials |
| Rate limit bypass via API | Tampering | Rate limit is in-memory server-side; client cannot bypass by making API calls |
| Notification policy injection (malformed JSON in event_toggles) | Tampering | Validate event_toggles keys against known EVENT_DEFAULTS set before writing |

---

## Sources

### Primary (HIGH confidence — VERIFIED against codebase)

- `/home/services/gsddashboard/server/gsd/telegram.js` — Complete Telegram delivery module: sendNotification, shouldNotify, COOLDOWN_MS, reply poller
- `/home/services/gsddashboard/server/gsd/stateBroadcaster.js` — feedStore push points, landmark detection, poll cycle
- `/home/services/gsddashboard/server/gsd/gracefulShutdown.js` — idle auto-close notification call site
- `/home/services/gsddashboard/server/routes/gsd.js` — state-transition notification call site (line 177)
- `/home/services/gsddashboard/server/index.js` — disk alert notification call sites (lines 323, 333) + startup wiring
- `/home/services/gsddashboard/server/db.js` — project_settings schema, migration patterns, `telegram_alerts` field
- `/home/services/gsddashboard/.planning/phases/54B-unified-notification-centre/54B-UI-SPEC.md` — approved UI contract, schema contract, migration path

### Secondary (MEDIUM confidence)

- REQUIREMENTS.md § NTF-01 through NTF-05 — requirements text
- ROADMAP.md Phase 54B spec — default event policy table, dependency graph

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from live codebase, no new dependencies
- Architecture: HIGH — all call sites enumerated, schema design based on existing patterns
- Pitfalls: HIGH — derived from reading actual code patterns (circular deps, DI, race conditions)

**Research date:** 2026-05-29
**Valid until:** 2026-06-29 (stable Node/SQLite stack, 30 days)
