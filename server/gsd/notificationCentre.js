'use strict';

// Event types and their defaults per ROADMAP Phase 54B spec
const EVENT_DEFAULTS = {
  waiting_input:       { enabled: true,  highPriority: true,  rateLimited: false },
  plan_complete:       { enabled: true,  highPriority: true,  rateLimited: false },
  verify_failed:       { enabled: true,  highPriority: true,  rateLimited: false },
  verify_passed:       { enabled: false, highPriority: false, rateLimited: false },
  idle_session_closed: { enabled: true,  highPriority: false, rateLimited: true  },
  cost_anomaly:        { enabled: true,  highPriority: false, rateLimited: true  },
  github_issue_filed:  { enabled: false, highPriority: false, rateLimited: false },
  session_started:     { enabled: false, highPriority: false, rateLimited: false },
  tool_use:            { enabled: false, highPriority: false, rateLimited: false },
  turn_complete:       { enabled: false, highPriority: false, rateLimited: false },
  system_alert:        { enabled: true,  highPriority: true,  rateLimited: false },
};

// In-memory global rate limit window (resets on server restart — acceptable per spec)
const HOUR_MS = 60 * 60 * 1000;
let rateWindow = { count: 0, resetAt: Date.now() + HOUR_MS };

/**
 * DI-friendly core. Injectable for unit tests.
 * @param {string} eventType
 * @param {string} projectName
 * @param {string} text
 * @param {string[]} [options]
 * @param {object} fns - { sendFn, dbFn, nowFn }
 */
async function _testNotify(eventType, projectName, text, options = [], fns = {}) {
  // Lazy-require production defaults (avoids circular dep at module top)
  const defaultSendFn = async () => {
    const { sendNotification } = require('./telegram');
    return sendNotification(projectName, text, options);
  };
  const defaultDbFn = () => require('../db').stmts;
  const defaultNowFn = () => Date.now();

  const {
    sendFn = defaultSendFn,
    dbFn = defaultDbFn,
    nowFn = defaultNowFn,
  } = fns;

  const stmts = dbFn();
  const eventDef = EVENT_DEFAULTS[eventType] || { enabled: false, highPriority: false, rateLimited: false };

  // 1. Load global policy from DB
  let policy;
  try {
    const row = stmts.getNotificationPolicy.get();
    if (row) {
      policy = {
        enabled: row.enabled === 1,
        quiet_hours_from: row.quiet_hours_from || null,
        quiet_hours_to: row.quiet_hours_to || null,
        rate_limit_per_hour: row.rate_limit_per_hour || 5,
        event_toggles: (() => { try { return JSON.parse(row.event_toggles || '{}'); } catch { return {}; } })(),
      };
    }
  } catch { /* no policy row yet — use defaults */ }

  if (!policy) {
    policy = { enabled: true, quiet_hours_from: null, quiet_hours_to: null, rate_limit_per_hour: 5, event_toggles: {} };
  }

  // 2. Global enable check
  if (!policy.enabled) {
    stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'disabled');
    return;
  }

  // 3. Per-event toggle check (DB value overrides default; absent = use default)
  const eventEnabled = (eventType in policy.event_toggles)
    ? policy.event_toggles[eventType]
    : eventDef.enabled;
  if (!eventEnabled) {
    stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'disabled');
    return;
  }

  // 4. Quiet hours check (non-high-priority events only)
  if (!eventDef.highPriority && policy.quiet_hours_from && policy.quiet_hours_to) {
    const nowUtcHHMM = new Date(nowFn()).toISOString().slice(11, 16); // "HH:MM"
    const from = policy.quiet_hours_from;
    const to = policy.quiet_hours_to;
    const inQuiet = from <= to
      ? nowUtcHHMM >= from && nowUtcHHMM < to
      : nowUtcHHMM >= from || nowUtcHHMM < to; // crosses midnight
    if (inQuiet) {
      stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'quiet_hours');
      return;
    }
  }

  // 5. Rate limit check (global counter, rateLimited events only)
  if (eventDef.rateLimited) {
    const now = nowFn();
    if (now > rateWindow.resetAt) {
      rateWindow = { count: 0, resetAt: now + HOUR_MS };
    }
    if (rateWindow.count >= (policy.rate_limit_per_hour || 5)) {
      stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'rate_limit');
      return;
    }
    rateWindow.count++;
  }

  // 6. Deduplication: same event_type + project_name delivered in last 30s
  const cutoff = new Date(nowFn() - 30_000).toISOString();
  const dupe = stmts.getRecentNotificationLog.get(eventType, projectName, cutoff);
  if (dupe) {
    stmts.insertNotificationLog.run(eventType, projectName, text, 0, 'dedup');
    return;
  }

  // 7. Write log row BEFORE delivery (so dedup check is reliable on rapid calls)
  stmts.insertNotificationLog.run(eventType, projectName, text, 1, null);

  // 8. Deliver
  try {
    await sendFn();
  } catch {
    // Non-blocking: delivery failure is logged but not thrown
  }
}

/**
 * Public entry point. Fire-and-forget at call sites: notify(...).catch(() => {})
 */
async function notify(eventType, projectName, text, options = []) {
  return _testNotify(eventType, projectName, text, options);
}

module.exports = { notify, _testNotify, EVENT_DEFAULTS };
