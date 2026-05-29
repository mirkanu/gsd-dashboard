# Phase 54B: Unified Notification Centre - Pattern Map

**Mapped:** 2026-05-29
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server/gsd/notificationCentre.js` | service | event-driven | `server/gsd/gracefulShutdown.js` | role-match (DI pattern, same gsd/ module shape) |
| `server/routes/notifications.js` | route | request-response | `server/routes/config.js` | exact (same GET/PUT CRUD shape, same stmts pattern) |
| `server/db.js` (migration additions) | migration | CRUD | `server/db.js` itself (Phase 56 additive columns) | exact |
| `server/gsd/stateBroadcaster.js` (modify) | service | event-driven | `server/gsd/stateBroadcaster.js` itself (landmark section) | exact (lines 139-165) |
| `server/gsd/gracefulShutdown.js` (modify) | service | event-driven | `server/gsd/gracefulShutdown.js` itself (DI fns block) | exact (lines 40-48) |
| `server/routes/gsd.js` (modify) | route | request-response | `server/routes/gsd.js` itself (lines 162-181) | exact (replace shouldNotify + sendNotification) |
| `server/index.js` (modify) | utility | event-driven | `server/index.js` itself (lines 319-344) | exact (disk alert block) |
| `client/src/components/NotificationPolicyPanel.tsx` | component | request-response | `client/src/pages/ConfigPage.tsx` | exact (Toggle, section cards, save flow) |
| `client/src/lib/api.ts` (extend) | utility | request-response | `client/src/lib/api.ts` itself (config namespace, lines 60-275) | exact |

---

## Pattern Assignments

### `server/gsd/notificationCentre.js` (service, event-driven)

**Analog:** `server/gsd/gracefulShutdown.js`

**Module header pattern** (`gracefulShutdown.js` lines 1-8):
```js
'use strict';

const { execFileSync } = require('child_process');
const { isTmuxSessionActive, capturePaneText } = require('./tmux');
const { sendNotification } = require('./telegram');
```
Copy the `'use strict'` header and lazy-require approach. For notificationCentre, require `telegram` and `db` inside functions to avoid circular deps (the pattern already used via `getStmts()` in `telegram.js` lines 84-88).

**Lazy-require pattern to avoid circular deps** (`telegram.js` lines 84-88):
```js
function getStmts() {
  if (!stmts) {
    try { stmts = require('../db').stmts; } catch { /* not available */ }
  }
  return stmts;
}
```
Apply this exact pattern for both `require('./telegram')` and `require('../db')` inside `notificationCentre.js` — do not require them at module top.

**Injectable I/O functions pattern (DI)** (`gracefulShutdown.js` lines 40-48):
```js
async function _testGracefulShutdown(sessionName, projectName, opts = {}, fns = {}) {
  const {
    isTmuxActiveFn = isTmuxSessionActive,
    sendKeysFn = _sendKeysToTmux,
    captureFn = capturePaneText,
    killFn = _killTmuxSession,
    notifyFn = sendNotification,
    sleepFn = _sleep,
  } = fns;
```
`notificationCentre.js` should expose a `_testNotify(eventType, projectName, text, options, fns = {})` variant with injectable `{ sendFn, dbFn, nowFn }` for unit testing. The public `notify()` calls `_testNotify` with production defaults.

**In-memory state with module-level Map** (`telegram.js` lines 27-31):
```js
const notifyCooldowns = new Map(); // project → timestamp
const COOLDOWN_MS = 60_000; // 1 minute between notifications per project
const pendingRoutes = new Map(); // routeId → { text, expires }
let nextRouteId = 1;
```
Apply the same pattern for rate limit state:
```js
let rateWindow = { count: 0, resetAt: Date.now() + HOUR_MS };
const HOUR_MS = 60 * 60 * 1000;
```

**Module exports pattern** (`gracefulShutdown.js` line 102):
```js
module.exports = { gracefulShutdown, _testGracefulShutdown };
```
notificationCentre exports: `module.exports = { notify, _testNotify, EVENT_DEFAULTS };`

**Error suppression on async calls** (`telegram.js` lines 94-106 and pattern throughout gsd.js):
```js
async function apiCall(method, payload) {
  try {
    const res = await fetch(`${API_BASE}/${method}`, { ... });
    return await res.json();
  } catch {
    return null;
  }
}
// And at call sites:
sendNotification(name, body, options).catch(() => {});
```
`notify()` must also be called with `.catch(() => {})` at all call sites (non-blocking).

---

### `server/routes/notifications.js` (route, request-response)

**Analog:** `server/routes/config.js`

**Module header + proxy passthrough pattern** (`config.js` lines 1-16):
```js
const express = require("express");
const path = require("path");
const fs = require("fs");
const { stmts, GLOBAL_SETTINGS_KEY, getGlobalSettings } = require("../db");

const router = express.Router();

const GSD_DATA_URL = (process.env.GSD_DATA_URL || "").replace(/\/$/, "");
const INTERNAL_HEADERS = process.env.GSD_INTERNAL_SECRET
  ? { 'x-gsd-internal': process.env.GSD_INTERNAL_SECRET }
  : {};

function upstreamFetch(url, opts = {}) {
  const headers = { ...INTERNAL_HEADERS, ...(opts.headers || {}) };
  return fetch(url, { ...opts, headers });
}
```
Copy this header verbatim. Every route in `notifications.js` must have the `if (GSD_DATA_URL)` proxy passthrough block before local logic, exactly as `config.js` does.

**GET route pattern** (`config.js` lines 105-128):
```js
router.get("/project-settings", async (req, res) => {
  if (GSD_DATA_URL) {
    try {
      const upstream = await upstreamFetch(`${GSD_DATA_URL}/api/config/project-settings`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
  }

  try {
    const rows = stmts.listProjectSettings.all();
    // ... business logic
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: "Failed to list project settings", detail: err.message });
  }
});
```

**PUT route with validation pattern** (`config.js` lines 213-273):
```js
router.put("/project-settings/:project", async (req, res) => {
  // ... proxy block ...
  const { verbosity, telegram_alerts, suppress_context_reask, suppress_plan_ceremony } = req.body || {};

  // Validate verbosity
  const validVerbosity = ["verbose", "normal", "quiet"];
  const finalVerbosity = verbosity || "normal";
  if (!validVerbosity.includes(finalVerbosity)) {
    return res.status(400).json({
      error: `verbosity must be one of: ${validVerbosity.join(", ")}`,
    });
  }
  // ...
  try {
    stmts.upsertProjectSettings.run(...);
    const saved = stmts.getProjectSettings.get(project);
    res.json({ ok: true, settings: { ...saved, ... } });
  } catch (err) {
    res.status(500).json({ error: "Failed to save project settings", detail: err.message });
  }
});
```
Apply same shape for `PUT /api/notifications/policy` — validate `enabled` (boolean), `quiet_hours_from/to` (HH:MM regex `^\d{2}:\d{2}$` or null), `rate_limit_per_hour` (integer 1–100), `event_toggles` (object with keys only from `EVENT_DEFAULTS`).

**POST test route pattern** — for `POST /api/notifications/test`, use the same try/catch shape but call `sendNotification` directly (test routes bypass policy by design):
```js
router.post('/test', async (req, res) => {
  try {
    const { sendNotification } = require('../gsd/telegram');
    await sendNotification('dashboard', 'Test notification from GSD Dashboard.');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**module.exports** (`config.js` line 275):
```js
module.exports = router;
```

---

### `server/db.js` — migration additions (migration, CRUD)

**Analog:** `server/db.js` Phase 56 additive columns (lines 441-449)

**Try/catch probe migration pattern** (lines 441-449):
```js
// Migration: add GSD verbosity override columns to project_settings (Phase 56)
try {
  db.prepare("SELECT suppress_context_reask FROM project_settings LIMIT 1").get();
} catch {
  db.exec(`
    ALTER TABLE project_settings ADD COLUMN suppress_context_reask INTEGER;
    ALTER TABLE project_settings ADD COLUMN suppress_plan_ceremony INTEGER;
  `);
}
```
Use this exact pattern for the two new `project_settings` columns:
```js
// Migration: add notification override columns to project_settings (Phase 54B)
try {
  db.prepare("SELECT notification_enabled FROM project_settings LIMIT 1").get();
} catch {
  db.exec(`
    ALTER TABLE project_settings ADD COLUMN notification_enabled INTEGER;
    ALTER TABLE project_settings ADD COLUMN notification_quiet_override INTEGER NOT NULL DEFAULT 0;
  `);
}
```

**New table with try/catch probe pattern** (lines 299-311 for project_settings, lines 179-190 for project_verify_state):
```js
// Migration: add verify circuit-breaker table (Phase 53)
try {
  db.prepare('SELECT 1 FROM project_verify_state LIMIT 1').get();
} catch {
  db.prepare(
    'CREATE TABLE IF NOT EXISTS project_verify_state (' +
    '  project_id TEXT PRIMARY KEY,' +
    '  consecutive_failures INTEGER NOT NULL DEFAULT 0,' +
    '  last_verify_at TEXT' +
    ')'
  ).run();
}
```
Use `.exec()` for multi-statement DDL (notification_policy + notification_log tables + index), use `.prepare(...).run()` for single statements.

**Prepared statements block** (`db.js` lines 507+):
All new prepared statements (`getNotificationPolicy`, `upsertNotificationPolicy`, `insertNotificationLog`, `getRecentNotificationLog`) must be added to the `stmts` object alongside existing statements, following the same `db.prepare(...)` pattern.

**strftime timestamp default** — copy `DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` for all `created_at`/`updated_at` columns, matching every existing table.

---

### `server/gsd/stateBroadcaster.js` — modification (service, event-driven)

**Analog:** `server/gsd/stateBroadcaster.js` lines 139-165 (landmark event block)

**Landmark event + feedStore push pattern** (lines 139-165):
```js
// waiting_input: reuse rawPaneState transition to 'waiting'.
if (sessionState === 'waiting' && prevRaw !== 'waiting') {
  const displayName = project.display_name || project.name;
  const waitingEntry = {
    type: 'waiting_input',
    projectName: project.name,
    projectDisplayName: displayName,
    label: `Waiting for input on ${displayName}`,
    detectedAt: nowIso,
  };
  feedStore.pushEvent(waitingEntry);
  broadcastFn('feed_event', feedStore.getEvents()[0]);
}
```
Add the `notify()` call immediately AFTER `feedStore.pushEvent(waitingEntry)` and `broadcastFn(...)`:
```js
// NEW in Phase 54B — notify after feedStore push:
if (!process.env.GSD_DATA_URL) {  // same guard as idleDetector
  const { notify } = require('./notificationCentre');
  notify('waiting_input', project.name, `Waiting for input on ${displayName}`, options)
    .catch(() => {});
}
```
The `require('./notificationCentre')` must be inside the `if` block (lazy require, avoids circular dep at module top).

**Proxy mode guard** — copy the `!process.env.GSD_DATA_URL` guard from `server/gsd/idleDetector.js` (or `gsd.js` GSD_DATA_URL check). Never call `notify()` in proxy mode.

---

### `server/gsd/gracefulShutdown.js` — modification (service, event-driven)

**Analog:** `server/gsd/gracefulShutdown.js` lines 40-48 (DI fns block)

**Change default for `notifyFn`** (line 46):
```js
// BEFORE (line 46):
notifyFn = sendNotification,

// AFTER:
notifyFn = (project, text) => {
  const { notify } = require('./notificationCentre');
  return notify('idle_session_closed', project, text);
},
```
The outer `const { sendNotification } = require('./telegram')` import at line 5 stays — it is used by the default `notifyFn` only and tests can still inject their own. Remove `sendNotification` from the destructured require once `notifyFn` default no longer calls it directly.

---

### `server/routes/gsd.js` — modification (route, request-response)

**Analog:** `server/routes/gsd.js` lines 162-181 (state-transition notification block)

**Current pattern to replace** (lines 162-181):
```js
if (telegramEnabled && tmux_session) {
  const prevState = previousStates.get(name);
  previousStates.set(name, sessionState);

  if (prevState && prevState !== sessionState) {
    if (prevState === 'working' && (sessionState === 'waiting' || sessionState === 'paused')) {
      if (shouldNotify(name)) {
        const paneText = await capturePaneTextAsync(tmux_session);
        const options = paneText ? parseOptions(paneText) : [];
        const label = sessionState === 'waiting' ? 'is waiting for your input' : 'has paused';
        const cleanText = paneText ? formatForTelegram(paneText) : '';
        const body = cleanText ? `${label}:\n\n${cleanText}` : label;
        sendNotification(name, body, options).catch(() => {});
      }
    }
  }
}
```
**Replacement:**
```js
if (tmux_session && !GSD_DATA_URL) {
  const prevState = previousStates.get(name);
  previousStates.set(name, sessionState);

  if (prevState && prevState !== sessionState) {
    if (prevState === 'working' && (sessionState === 'waiting' || sessionState === 'paused')) {
      const { notify } = require('../gsd/notificationCentre');
      const paneText = await capturePaneTextAsync(tmux_session);
      const options = paneText ? parseOptions(paneText) : [];
      const label = sessionState === 'waiting' ? 'is waiting for your input' : 'has paused';
      const cleanText = paneText ? formatForTelegram(paneText) : '';
      const body = cleanText ? `${label}:\n\n${cleanText}` : label;
      notify('waiting_input', name, body, options).catch(() => {});
    }
  }
}
```
Remove `shouldNotify` from the destructured import on line 11 (it moves into notificationCentre). Keep `parseOptions`, `formatForTelegram` imports — they're still needed here for text prep before calling `notify`.

---

### `server/index.js` — modification (utility, event-driven)

**Analog:** `server/index.js` lines 319-344 (disk alert block)

**Current pattern to replace** (lines 319-333):
```js
if (telegramEnabled) {
  sendNotification('dashboard',
    `[CRITICAL] Disk at ${diskPct}% ...`
  );
}
// and:
if (telegramEnabled) {
  sendNotification('dashboard',
    `Warning: Disk at ${diskPct}% ...`
  );
}
```
**Replacement:**
```js
const { notify } = require('./gsd/notificationCentre');
notify('system_alert', 'dashboard', `[CRITICAL] Disk at ${diskPct}% ...`).catch(() => {});
// and:
notify('system_alert', 'dashboard', `Warning: Disk at ${diskPct}% ...`).catch(() => {});
```
Remove the `telegramEnabled` guard — notificationCentre checks `ENABLED` inside `sendNotification`. Remove `sendNotification` from the `require('../gsd/telegram')` destructure if it's no longer used elsewhere in `index.js` after this change.

---

### `client/src/components/NotificationPolicyPanel.tsx` (component, request-response)

**Analog:** `client/src/pages/ConfigPage.tsx`

**Imports pattern** (`ConfigPage.tsx` lines 1-14):
```tsx
import { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Save,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { api } from "../lib/api";
import type { ProjectSettings, GsdProject } from "../lib/types";
```
Use same import shape. Add `BellOff`, `Clock` icons for quiet hours and disabled state.

**Toggle component** (`ConfigPage.tsx` lines 44-78) — copy verbatim:
```tsx
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer group">
      <span className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
          checked ? "bg-accent" : "bg-surface-3"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}
```

**Section card pattern** (`ConfigPage.tsx` lines 562-595 — Telegram Alerts card):
```tsx
<div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
  <div className="flex items-center gap-2 mb-1">
    <Bell className="w-4 h-4 text-gray-400" />
    <h2 className="text-sm font-semibold text-gray-200">
      Telegram Alerts
    </h2>
  </div>
  {settingsLoading ? (
    <SettingsSkeleton />
  ) : (
    <div className="space-y-1">
      {ALERT_TYPES.map(({ key, label }) => (
        <div key={key} className="flex items-center">
          <Toggle
            checked={settings?.telegram_alerts?.[key] ?? false}
            onChange={(v) => handleAlertToggle(key, v)}
            label={label}
          />
          {settingsSaved === key && (
            <span className="flex items-center gap-1 text-emerald-400 text-xs ml-2 flex-shrink-0">
              <Check className="w-3 h-3" />
            </span>
          )}
        </div>
      ))}
      <p className="text-xs text-gray-600 mt-3">...</p>
    </div>
  )}
</div>
```
`NotificationPolicyPanel` renders multiple such cards vertically: Global Enable, Quiet Hours, Rate Limit, Event Toggles, Per-Project Overrides, Action Row.

**Load + save pattern** (`ConfigPage.tsx` lines 214-289):
```tsx
const loadSettings = useCallback(async (project: string) => {
  setSettingsLoading(true);
  try {
    const data = await api.config.getProjectSettings(apiKey);
    setSettings(data);
  } catch {
    setSettings({ project_key: apiKey, verbosity: "normal", telegram_alerts: {} });
  } finally {
    setSettingsLoading(false);
  }
}, []);
```
Copy this shape for `loadPolicy` / `savePolicy`. Use `setSettingsSaved(feedbackKey)` + `setTimeout(() => setSettingsSaved(null), 2000)` for save feedback (lines 278-279).

**Number input pattern** (`ConfigPage.tsx` lines 633-643):
```tsx
<input
  type="number"
  min={1}
  value={idleThresholdMinutes}
  onChange={(e) => setIdleThresholdMinutes(Number(e.target.value))}
  className="w-24 bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
/>
```
Use for rate limit input. For time inputs, use `type="time"` with same class string.

**Skeleton component** (`ConfigPage.tsx` lines 27-39):
```tsx
function SettingsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 w-32 bg-surface-3 rounded" />
      <div className="h-10 w-48 bg-surface-3 rounded-lg" />
      ...
    </div>
  );
}
```
Reuse `SettingsSkeleton` directly — import it or co-locate in the same file.

**"Send Test" button pattern** — copy the `bg-indigo-600 hover:bg-indigo-500` Save button style (lines 641-645) for the ghost/secondary "Send Test" button variant. Use `bg-surface-3 text-gray-300 hover:bg-surface-3/80` for secondary.

---

### `client/src/lib/api.ts` — extension (utility, request-response)

**Analog:** `client/src/lib/api.ts` `config` namespace (lines 60+)

**Namespace pattern** (existing `config` namespace):
```ts
config: {
  getClaudeMd: (project: string) =>
    request<ClaudeMdResponse>(`/config/claude-md?project=${encodeURIComponent(project)}`),
  saveClaudeMd: (project: string, content: string) =>
    request<{ ok: boolean; path: string }>(`/config/claude-md`, {
      method: "PUT",
      body: JSON.stringify({ project, content }),
    }),
  getProjectSettings: (project: string) =>
    request<ProjectSettings>(`/config/project-settings/${encodeURIComponent(project)}`),
  saveProjectSettings: (project: string, settings: Partial<ProjectSettings>) =>
    request<{ ok: boolean; settings: ProjectSettings }>(`/config/project-settings/${encodeURIComponent(project)}`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
  applyGlobalSettings: () =>
    request<{ ok: boolean; updated: number }>(`/config/project-settings/apply-global`, { method: "POST" }),
},
```
Add a `notifications` namespace with the same pattern:
```ts
notifications: {
  getPolicy: () =>
    request<{ policy: NotificationPolicy }>('/notifications/policy'),
  savePolicy: (policy: Partial<NotificationPolicy>) =>
    request<{ ok: boolean }>('/notifications/policy', {
      method: 'PUT',
      body: JSON.stringify(policy),
    }),
  sendTest: () =>
    request<{ ok: boolean }>('/notifications/test', { method: 'POST' }),
},
```

---

### Unit test files (3 new, test, CRUD + event-driven)

**Analog:** `server/routes/env.test.js` and `server/routes/__tests__/gsd-pause-session.test.js`

**Test file header pattern** (`env.test.js` lines 1-3):
```js
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
```

**Injectable function test pattern** (`gsd-pause-session.test.js` lines 11-33):
```js
test('gsd-pause-session: active session → runVerify called before gracefulShutdown', async () => {
  const calls = [];
  const project = { name: 'proj-a', tmux_session: 'proj-a-sess' };

  const result = await _testPauseSession(project, {
    isTmuxActiveFn: () => true,
    runVerifyFn: async (p, b, opts) => {
      calls.push({ fn: 'runVerify', project: p.name });
      return { ok: true, passed: true };
    },
    gracefulShutdownFn: async (session, name) => {
      calls.push({ fn: 'gracefulShutdown', session, name });
      return { pauseWorkCompleted: true };
    },
    broadcastFn: () => {},
  });

  assert.strictEqual(calls.length, 2, 'both runVerify and gracefulShutdown must be called');
```
Tests for `notificationCentre` inject `{ sendFn, dbFn, nowFn }` using this same shape. Tests for `notifications.js` route can use a real in-memory SQLite (same approach as `env.test.js` uses real fs via temp file).

---

## Shared Patterns

### `'use strict'` + lazy require
**Source:** `server/gsd/telegram.js` lines 1, 84-88 and `server/gsd/gracefulShutdown.js` line 1
**Apply to:** `notificationCentre.js`, `notifications.js`

All new server-side JS files start with `'use strict';`. Require `db` and `telegram` inside functions (not at module top) in `notificationCentre.js` to prevent circular dependency.

### GSD_DATA_URL proxy passthrough
**Source:** `server/routes/config.js` lines 8-16 and every route block (lines 107-117, 133-144, etc.)
**Apply to:** `notifications.js` — all three routes (GET /policy, PUT /policy, POST /test)

```js
const GSD_DATA_URL = (process.env.GSD_DATA_URL || "").replace(/\/$/, "");
// Every route must start with:
if (GSD_DATA_URL) {
  try {
    const upstream = await upstreamFetch(`${GSD_DATA_URL}/api/notifications/...`, { ... });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
  }
}
```

### Error response shape
**Source:** `server/routes/config.js` lines 127, 178, 210, 272
**Apply to:** `notifications.js` all routes
```js
res.status(500).json({ error: "Failed to ...", detail: err.message });
res.status(400).json({ error: "field must be ..." });
res.status(404).json({ error: "Not found" });
```

### Async notification fire-and-forget
**Source:** `server/routes/gsd.js` line 177, `server/gsd/gracefulShutdown.js` line 81
**Apply to:** Every new `notify()` call site in stateBroadcaster, gracefulShutdown, index.js
```js
notify('event_type', projectName, body, options).catch(() => {});
```
Never await; never let notification failures surface to callers.

### Try/catch probe migration in db.js
**Source:** `server/db.js` lines 179-190 (project_verify_state), lines 441-449 (Phase 56 suppress columns)
**Apply to:** All 4 Phase 54B DB changes (2 new tables, 2 new columns)
```js
try {
  db.prepare('SELECT 1 FROM notification_policy LIMIT 1').get();
} catch {
  db.exec(`CREATE TABLE IF NOT EXISTS notification_policy (...)`);
}
```

### CSS token classes for components
**Source:** `client/src/pages/ConfigPage.tsx` throughout
**Apply to:** `NotificationPolicyPanel.tsx`
- Card: `bg-surface-2 border border-border rounded-xl p-4 space-y-3`
- Input: `bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50`
- Primary button: `bg-accent text-white hover:bg-accent/90` (or `bg-indigo-600 hover:bg-indigo-500`)
- Secondary button: `bg-surface-3 text-gray-300 hover:bg-surface-3/80`
- Save feedback: `flex items-center gap-1 text-emerald-400 text-xs`
- Disabled/loading toggle: `opacity-50 cursor-not-allowed`
- Helper text: `text-xs text-gray-600 mt-3`

### `module.exports = router`
**Source:** `server/routes/config.js` line 275
**Apply to:** `notifications.js` last line — must export the Express router only.

---

## No Analog Found

No files in this phase lack an analog. All patterns are covered by existing codebase files.

---

## Metadata

**Analog search scope:** `server/gsd/`, `server/routes/`, `server/db.js`, `server/index.js`, `client/src/pages/`, `client/src/lib/api.ts`
**Files scanned:** 14 source files read in full or part
**Pattern extraction date:** 2026-05-29
