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
const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

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
