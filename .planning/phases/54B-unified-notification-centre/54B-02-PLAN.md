---
phase: 54B
plan: 02
type: execute
wave: 2
depends_on:
  - 54B-01
files_modified:
  - server/routes/notifications.js
  - server/index.js
  - server/routes/proxy.js
autonomous: true
requirements:
  - NTF-01
  - NTF-03

must_haves:
  truths:
    - "GET /api/notifications/policy returns the current global policy (enabled, quiet_hours_from, quiet_hours_to, rate_limit_per_hour, event_toggles)"
    - "PUT /api/notifications/policy persists changes and round-trips correctly"
    - "POST /api/notifications/test sends a Telegram test message (bypasses policy)"
    - "/api/notifications is mounted in server/index.js and in proxy.js PROXY_PREFIXES"
    - "In proxy mode (GSD_DATA_URL set), all three routes forward to upstream"
  artifacts:
    - path: "server/routes/notifications.js"
      provides: "GET/PUT /policy + POST /test routes"
      exports: ["router"]
    - path: "server/index.js"
      provides: "Mount point for notificationsRouter"
      contains: "notificationsRouter"
    - path: "server/routes/proxy.js"
      provides: "Proxy passthrough for /api/notifications"
      contains: "'/api/notifications'"
  key_links:
    - from: "server/index.js"
      to: "server/routes/notifications.js"
      via: "app.use('/api/notifications', notificationsRouter)"
      pattern: "app.use.*notifications"
    - from: "server/routes/proxy.js"
      to: "server/routes/notifications.js"
      via: "PROXY_PREFIXES includes '/api/notifications'"
      pattern: "'/api/notifications'"
---

<objective>
Create the notifications API routes and wire them into the server.

Purpose: Expose policy CRUD and test-delivery endpoints that the ConfigPage UI (Plan 03) will consume. Includes proxy passthrough so the route works in Railway/tunnel mode.
Output: server/routes/notifications.js (3 routes), server/index.js mount, server/routes/proxy.js prefix entry.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
@/data/home/gsddashboard/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/54B-unified-notification-centre/54B-RESEARCH.md
@.planning/phases/54B-unified-notification-centre/54B-PATTERNS.md
@.planning/phases/54B-unified-notification-centre/54B-01-SUMMARY.md

<interfaces>
<!-- Key contracts extracted from codebase. -->

From server/routes/config.js (exact template for notifications.js):
```js
const express = require("express");
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
// Every route body:
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
    // ... local logic
    res.json({ ... });
  } catch (err) {
    res.status(500).json({ error: "Failed to ...", detail: err.message });
  }
});
module.exports = router;
```

From server/routes/proxy.js (PROXY_PREFIXES list — append here):
```js
const PROXY_PREFIXES = [
  '/api/sessions', '/api/agents', '/api/events', '/api/stats',
  '/api/analytics', '/api/pricing', '/api/config', '/api/services',
  '/api/app-settings', '/api/webhooks', '/api/projects', '/api/env', '/api/feed',
  // ADD: '/api/notifications',
];
```

From server/index.js (mount pattern — add after configRouter line 134):
```js
// existing:
app.use("/api/config", configRouter);   // line 134
app.use("/api/feed", feedRouter);        // line 138
// ADD (between config and feed):
const notificationsRouter = require("./routes/notifications");
app.use("/api/notifications", notificationsRouter);
```

From server/gsd/notificationCentre.js (just created in Plan 01):
```js
// EVENT_DEFAULTS keys:
['waiting_input','plan_complete','verify_failed','verify_passed','idle_session_closed',
 'cost_anomaly','github_issue_filed','session_started','tool_use','turn_complete','system_alert']
```

From server/db.js stmts (added in Plan 01):
```js
stmts.getNotificationPolicy.get()       // returns row or undefined
stmts.upsertNotificationPolicy.run(enabled, quiet_hours_from, quiet_hours_to, rate_limit_per_hour, event_toggles_json, archived_legacy_alerts)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create server/routes/notifications.js with GET/PUT /policy and POST /test</name>
  <files>server/routes/notifications.js</files>

  <read_first>
    - server/routes/config.js — read the full file to copy the proxy passthrough pattern, GET/PUT shape, and validation style
    - server/gsd/notificationCentre.js — confirm EVENT_DEFAULTS export (to build valid-keys validation list)
    - server/db.js — confirm stmts.getNotificationPolicy and stmts.upsertNotificationPolicy parameter order
  </read_first>

  <behavior>
    - GET /policy with no DB row: returns { policy: { enabled: true, quiet_hours_from: null, quiet_hours_to: null, rate_limit_per_hour: 5, event_toggles: {} } }
    - GET /policy with DB row: returns saved values
    - PUT /policy with valid body: responds { ok: true }; subsequent GET returns updated values
    - PUT /policy with enabled=2 (not boolean): returns 400 { error: "enabled must be a boolean" }
    - PUT /policy with quiet_hours_from="25:00": returns 400 { error: "quiet_hours_from must be HH:MM or null" }
    - PUT /policy with rate_limit_per_hour=200: returns 400 { error: "rate_limit_per_hour must be an integer 1–100" }
    - PUT /policy with event_toggles containing unknown key "foo": returns 400 { error: "event_toggles contains unknown key: foo" }
    - POST /test: calls telegram sendNotification directly (bypasses policy); returns { ok: true } or { error: ... }
    - All routes: in GSD_DATA_URL proxy mode, forward to upstream with 10s timeout
  </behavior>

  <action>
Create server/routes/notifications.js with this exact structure:

```js
'use strict';

const express = require("express");
const { stmts } = require("../db");
const { EVENT_DEFAULTS } = require("../gsd/notificationCentre");
const router = express.Router();

const GSD_DATA_URL = (process.env.GSD_DATA_URL || "").replace(/\/$/, "");
const INTERNAL_HEADERS = process.env.GSD_INTERNAL_SECRET
  ? { 'x-gsd-internal': process.env.GSD_INTERNAL_SECRET }
  : {};

function upstreamFetch(url, opts = {}) {
  const headers = { ...INTERNAL_HEADERS, ...(opts.headers || {}) };
  return fetch(url, { ...opts, headers });
}

const VALID_EVENT_KEYS = new Set(Object.keys(EVENT_DEFAULTS));
const HH_MM_RE = /^\d{2}:\d{2}$/;

function getDefaultPolicy() {
  return {
    enabled: true,
    quiet_hours_from: null,
    quiet_hours_to: null,
    rate_limit_per_hour: 5,
    event_toggles: {},
  };
}

function parsePolicy(row) {
  if (!row) return getDefaultPolicy();
  let event_toggles = {};
  try { event_toggles = JSON.parse(row.event_toggles || '{}'); } catch { }
  return {
    enabled: row.enabled === 1,
    quiet_hours_from: row.quiet_hours_from || null,
    quiet_hours_to: row.quiet_hours_to || null,
    rate_limit_per_hour: row.rate_limit_per_hour || 5,
    event_toggles,
    archived_legacy_alerts: row.archived_legacy_alerts === 1,
  };
}

// GET /api/notifications/policy
router.get("/policy", async (req, res) => {
  if (GSD_DATA_URL) {
    try {
      const upstream = await upstreamFetch(`${GSD_DATA_URL}/api/notifications/policy`, {
        signal: AbortSignal.timeout(10000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
  }
  try {
    const row = stmts.getNotificationPolicy.get();
    res.json({ policy: parsePolicy(row) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load notification policy", detail: err.message });
  }
});

// PUT /api/notifications/policy
router.put("/policy", express.json(), async (req, res) => {
  if (GSD_DATA_URL) {
    try {
      const upstream = await upstreamFetch(`${GSD_DATA_URL}/api/notifications/policy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(10000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
  }

  const { enabled, quiet_hours_from, quiet_hours_to, rate_limit_per_hour, event_toggles } = req.body || {};

  // Validate enabled
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }

  // Validate quiet hours
  if (quiet_hours_from !== undefined && quiet_hours_from !== null && !HH_MM_RE.test(quiet_hours_from)) {
    return res.status(400).json({ error: "quiet_hours_from must be HH:MM or null" });
  }
  if (quiet_hours_to !== undefined && quiet_hours_to !== null && !HH_MM_RE.test(quiet_hours_to)) {
    return res.status(400).json({ error: "quiet_hours_to must be HH:MM or null" });
  }

  // Validate rate limit
  if (rate_limit_per_hour !== undefined) {
    const n = Number(rate_limit_per_hour);
    if (!Number.isInteger(n) || n < 1 || n > 100) {
      return res.status(400).json({ error: "rate_limit_per_hour must be an integer 1–100" });
    }
  }

  // Validate event_toggles keys
  if (event_toggles !== undefined) {
    if (typeof event_toggles !== 'object' || Array.isArray(event_toggles)) {
      return res.status(400).json({ error: "event_toggles must be an object" });
    }
    for (const k of Object.keys(event_toggles)) {
      if (!VALID_EVENT_KEYS.has(k)) {
        return res.status(400).json({ error: `event_toggles contains unknown key: ${k}` });
      }
    }
  }

  try {
    // Merge with existing row so partial updates work
    const existing = stmts.getNotificationPolicy.get();
    const current = parsePolicy(existing);

    const finalEnabled = enabled !== undefined ? (enabled ? 1 : 0) : (current.enabled ? 1 : 0);
    const finalQhFrom = quiet_hours_from !== undefined ? quiet_hours_from : current.quiet_hours_from;
    const finalQhTo = quiet_hours_to !== undefined ? quiet_hours_to : current.quiet_hours_to;
    const finalRateLimit = rate_limit_per_hour !== undefined ? Number(rate_limit_per_hour) : current.rate_limit_per_hour;
    const finalToggles = event_toggles !== undefined
      ? JSON.stringify({ ...current.event_toggles, ...event_toggles })
      : JSON.stringify(current.event_toggles);
    const archivedLegacy = existing ? existing.archived_legacy_alerts : 0;

    stmts.upsertNotificationPolicy.run(finalEnabled, finalQhFrom, finalQhTo, finalRateLimit, finalToggles, archivedLegacy);

    const saved = stmts.getNotificationPolicy.get();
    res.json({ ok: true, policy: parsePolicy(saved) });
  } catch (err) {
    res.status(500).json({ error: "Failed to save notification policy", detail: err.message });
  }
});

// POST /api/notifications/test — bypasses policy, sends test message directly
router.post("/test", async (req, res) => {
  if (GSD_DATA_URL) {
    try {
      const upstream = await upstreamFetch(`${GSD_DATA_URL}/api/notifications/test`, {
        method: "POST",
        signal: AbortSignal.timeout(10000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
  }
  try {
    const { sendNotification } = require("../gsd/telegram");
    await sendNotification("dashboard", "Test notification from GSD Dashboard. Telegram delivery confirmed.");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
```
  </action>

  <verify>
    <automated>npm run test:server</automated>
  </verify>

  <acceptance_criteria>
    - test -f /home/services/gsddashboard/server/routes/notifications.js
    - grep "module.exports = router" /home/services/gsddashboard/server/routes/notifications.js
    - grep "router.get.*policy" /home/services/gsddashboard/server/routes/notifications.js
    - grep "router.put.*policy" /home/services/gsddashboard/server/routes/notifications.js
    - grep "router.post.*test" /home/services/gsddashboard/server/routes/notifications.js
    - grep "GSD_DATA_URL" /home/services/gsddashboard/server/routes/notifications.js shows proxy passthrough present
    - npm run test:server exits 0
  </acceptance_criteria>

  <done>notifications.js created with 3 routes, all with proxy passthrough, all with input validation matching the behavior block. Tests pass.</done>
</task>

<task type="auto">
  <name>Task 2: Wire notifications router into server/index.js and proxy.js</name>
  <files>server/index.js, server/routes/proxy.js</files>

  <read_first>
    - server/index.js — find the require/app.use block around configRouter (line ~134) to place the new mount; find the sendNotification import to note it is still used for disk alerts (will be replaced in Plan 04, leave for now)
    - server/routes/proxy.js — read the full PROXY_PREFIXES array to append '/api/notifications'
  </read_first>

  <action>
**In server/index.js:**

1. Add require for notificationsRouter alongside the other route requires (after configRouter line):
```js
const notificationsRouter = require("./routes/notifications");
```

2. Add mount after the config router mount (after `app.use("/api/config", configRouter);`):
```js
app.use("/api/notifications", notificationsRouter);
```

Do NOT change the sendNotification import or disk alert call sites — those are migrated in Plan 04.

**In server/routes/proxy.js:**

Append `'/api/notifications'` to the PROXY_PREFIXES array:
```js
const PROXY_PREFIXES = [
  '/api/sessions',
  '/api/agents',
  '/api/events',
  '/api/stats',
  '/api/analytics',
  '/api/pricing',
  '/api/config',
  '/api/services',
  '/api/app-settings',
  '/api/webhooks',
  '/api/projects',
  '/api/env',
  '/api/feed',
  '/api/notifications', // Phase 54B: notification policy CRUD + test delivery
];
```
  </action>

  <verify>
    <automated>npm run test:server</automated>
  </verify>

  <acceptance_criteria>
    - grep "notificationsRouter" /home/services/gsddashboard/server/index.js shows both require and app.use lines
    - grep "app.use.*api/notifications" /home/services/gsddashboard/server/index.js
    - grep "'/api/notifications'" /home/services/gsddashboard/server/routes/proxy.js
    - npm run test:server exits 0
    - node -e "require('./server/routes/notifications')" from /home/services/gsddashboard exits 0 (no require error)
  </acceptance_criteria>

  <done>notificationsRouter mounted at /api/notifications in server/index.js. /api/notifications present in PROXY_PREFIXES. npm test passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| HTTP client → PUT /api/notifications/policy | User-controlled JSON crosses here |
| notifications.js → telegram.js (POST /test) | Internal; no user input reaches Telegram payload |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-54B-02-A | Tampering | PUT /api/notifications/policy — event_toggles injection | mitigate | Validate every key against VALID_EVENT_KEYS set before writing; unknown keys → 400 |
| T-54B-02-B | Tampering | PUT /api/notifications/policy — rate_limit_per_hour overflow | mitigate | Integer check + 1–100 range validation → 400 on violation |
| T-54B-02-C | Tampering | POST /api/notifications/test | accept | Single-user dashboard; cookieAuth already covers all /api/* routes |
| T-54B-02-D | Information Disclosure | Telegram sendNotification in POST /test | accept | Test route sends fixed string to user's own Telegram; no user input echoed |
</threat_model>

<verification>
curl -s -X GET http://localhost:3001/api/notifications/policy returns JSON with a policy key.
curl -s -X PUT http://localhost:3001/api/notifications/policy -H 'Content-Type: application/json' -d '{"enabled":true}' returns { "ok": true }.
npm run test:server exits 0.
</verification>

<success_criteria>
- GET /api/notifications/policy returns policy shape
- PUT /api/notifications/policy with bad input returns 400
- /api/notifications in PROXY_PREFIXES
- notificationsRouter mounted in server/index.js
- npm run test:server passes
</success_criteria>

<output>
After completion, create `.planning/phases/54B-unified-notification-centre/54B-02-SUMMARY.md`
</output>
