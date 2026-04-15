'use strict';

/**
 * costMeasurement.js — tmux RSS-based cost estimation module.
 *
 * Provides:
 *  - estimateTmuxCostPerDay(rssBytes, rateGbMonth) — pure cost math (test-injectable)
 *  - logTmuxCostEstimate(sessionName, rssBytes, opts) — log to external_service_costs
 *  - getTmuxRssKb(sessionName) — read RSS from running tmux session via ps
 *  - computeDailyCost / _testComputeDailyCost(rssKb, rateGbMonth) — KB-based alias
 *  - getTmuxCostForSession(sessionName) — combined read + compute for route
 *  - logDailyTmuxCosts(sessions, dbOverride) — aggregate log (called by idle detector)
 *  - _testLogDailyCost(sessions, dbOverride) — test alias for logDailyTmuxCosts
 */

const { execFileSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const DEFAULT_RATE_GB_MONTH = 10.0; // $10/GB-month Railway RAM rate

// ---------------------------------------------------------------------------
// Pure cost math
// ---------------------------------------------------------------------------

/**
 * Estimate daily cost in USD from RSS in bytes.
 * @param {number} rssBytes - RSS in bytes (as reported by ps rss × 1024)
 * @param {number} [rateGbMonth] - $/GB/month rate (default $10)
 * @returns {number} estimated $/day
 */
function estimateTmuxCostPerDay(rssBytes, rateGbMonth = DEFAULT_RATE_GB_MONTH) {
  if (!rssBytes || rssBytes <= 0) return 0;
  const rssGb = rssBytes / (1024 * 1024 * 1024);
  return rssGb * rateGbMonth / 30;
}

/**
 * KB-based variant (used by getTmuxCostForSession and the route).
 * Exported as computeDailyCost and _testComputeDailyCost for plan spec compliance.
 * @param {number} rssKb - RSS in kilobytes (direct output of ps -o rss=)
 * @param {number} [rateGbMonth]
 * @returns {number} estimated $/day
 */
function _testComputeDailyCost(rssKb, rateGbMonth = DEFAULT_RATE_GB_MONTH) {
  if (!rssKb || rssKb <= 0) return 0;
  // Convert KB → bytes → GB
  const rssGb = rssKb / 1024 / 1024;
  return rssGb * rateGbMonth / 30;
}

// ---------------------------------------------------------------------------
// tmux RSS reader
// ---------------------------------------------------------------------------

/**
 * Get total RSS (kilobytes) for every process rooted at a tmux session's pane PIDs.
 * Walks the full descendant tree (shell + claude + any child processes) because
 * the pane PID alone is typically just the shell; the Claude Code process is a child.
 * Returns 0 on any error. Uses synchronous ps.
 */
function getTmuxRssKb(sessionName) {
  if (!sessionName) return 0;
  try {
    const paneOutput = execFileSync('tmux', ['list-panes', '-t', sessionName, '-F', '#{pane_pid}'], {
      encoding: 'utf8', timeout: 2000,
    });
    const panePids = paneOutput.split('\n').map((s) => s.trim()).filter((s) => s && !isNaN(Number(s)));
    if (panePids.length === 0) return 0;

    const psOutput = execFileSync('ps', ['-eo', 'pid=,ppid=,rss='], {
      encoding: 'utf8', timeout: 2000,
    });
    const childrenByPpid = new Map();
    const rssByPid = new Map();
    for (const line of psOutput.split('\n')) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;
      const pid = parts[0];
      const ppid = parts[1];
      const rss = parseInt(parts[2], 10);
      rssByPid.set(pid, isNaN(rss) ? 0 : rss);
      if (!childrenByPpid.has(ppid)) childrenByPpid.set(ppid, []);
      childrenByPpid.get(ppid).push(pid);
    }

    let totalRss = 0;
    const visited = new Set();
    const queue = [...panePids];
    while (queue.length) {
      const pid = queue.shift();
      if (visited.has(pid)) continue;
      visited.add(pid);
      totalRss += rssByPid.get(pid) || 0;
      const kids = childrenByPpid.get(pid) || [];
      for (const kid of kids) queue.push(kid);
    }
    return totalRss;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Rate lookup from app_settings
// ---------------------------------------------------------------------------

/**
 * Get Railway RAM rate from app_settings (encrypted), falling back to default.
 * Deferred require avoids circular deps at module load.
 */
function getRailwayRate() {
  try {
    const { getSecret } = require('../crypto');
    const stored = getSecret('railway_ram_rate_monthly');
    const parsed = parseFloat(stored);
    return isNaN(parsed) ? DEFAULT_RATE_GB_MONTH : parsed;
  } catch {
    return DEFAULT_RATE_GB_MONTH;
  }
}

// ---------------------------------------------------------------------------
// Per-session cost (used by the tmux-cost route)
// ---------------------------------------------------------------------------

/**
 * Compute per-session $/day for a named tmux session.
 * @param {string} sessionName
 * @returns {{ sessionName, rssKb, rssGb, dailyCostUsd, rateGbMonth }}
 */
function getTmuxCostForSession(sessionName) {
  const rate = getRailwayRate();
  const rssKb = getTmuxRssKb(sessionName);
  const dailyCostUsd = _testComputeDailyCost(rssKb, rate);
  return {
    sessionName,
    rssKb,
    rssGb: rssKb / 1024 / 1024,
    dailyCostUsd,
    rateGbMonth: rate,
  };
}

// ---------------------------------------------------------------------------
// Daily cost log (single-session variant for idle detector / test)
// ---------------------------------------------------------------------------

/**
 * Log a single session's daily tmux cost to external_service_costs.
 * Performs a simple INSERT (the idle detector calls this after each kill;
 * same-day dedup is handled by the aggregate variant logDailyTmuxCosts).
 *
 * @param {string} sessionName
 * @param {number} rssBytes - RSS in bytes (for consistent API with estimateTmuxCostPerDay)
 * @param {{ db?: object, rateGbMonth?: number }} [opts]
 */
function logTmuxCostEstimate(sessionName, rssBytes, opts = {}) {
  const dbInstance = (opts && opts.db) ? opts.db : require('../db').db;
  const rate = (opts && opts.rateGbMonth) ? opts.rateGbMonth : getRailwayRate();
  const dailyCostUsd = estimateTmuxCostPerDay(rssBytes, rate);
  const rssGb = rssBytes > 0 ? rssBytes / (1024 * 1024 * 1024) : 0;

  const now = new Date().toISOString();
  const notes = `tmux_cost_estimate:${sessionName}:${rssGb.toFixed(2)}GB`;

  dbInstance.prepare(
    `INSERT INTO external_service_costs (id, service, cost_usd, checked_at, source, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uuidv4(), 'tmux-idle-estimate', dailyCostUsd, now, 'api', notes);
}

// ---------------------------------------------------------------------------
// Aggregate daily cost log (called by idle detector with all active sessions)
// ---------------------------------------------------------------------------

/**
 * Log aggregate daily tmux cost to external_service_costs.
 * Upserts: if a row with today's date prefix exists, update it.
 *
 * @param {Array<{sessionName: string, dailyCostUsd: number, rssGb: number}>} sessions
 * @param {object} [dbOverride] - injectable DB for tests
 */
function logDailyTmuxCosts(sessions, dbOverride) {
  if (!sessions || sessions.length === 0) return;
  const db = dbOverride || require('../db').db;

  const totalCost = sessions.reduce((sum, s) => sum + (s.dailyCostUsd || 0), 0);
  const detailString = sessions.map(s => `${s.sessionName}:${(s.rssGb || 0).toFixed(2)}GB`).join(',');
  const now = new Date().toISOString();
  const todayPrefix = now.slice(0, 10); // YYYY-MM-DD

  // Same-day dedup: update if today's estimate already exists
  const existing = db.prepare(
    `SELECT id FROM external_service_costs
     WHERE service = 'tmux-idle-estimate'
       AND notes LIKE 'tmux_cost_estimate:%'
       AND substr(checked_at, 1, 10) = ?`
  ).get(todayPrefix);

  if (existing) {
    db.prepare(
      `UPDATE external_service_costs SET cost_usd = ?, checked_at = ?, notes = ? WHERE id = ?`
    ).run(totalCost, now, `tmux_cost_estimate:${detailString}`, existing.id);
  } else {
    db.prepare(
      `INSERT INTO external_service_costs (id, service, cost_usd, checked_at, source, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), 'tmux-idle-estimate', totalCost, now, 'api', `tmux_cost_estimate:${detailString}`);
  }
}

/**
 * Test alias for logDailyTmuxCosts.
 */
function _testLogDailyCost(sessions, dbOverride) {
  return logDailyTmuxCosts(sessions, dbOverride);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Primary test-callable API (matches tmux-cost.test.js)
  estimateTmuxCostPerDay,
  logTmuxCostEstimate,
  // KB-based variants (used by route + plan spec)
  getTmuxRssKb,
  computeDailyCost: _testComputeDailyCost,
  _testComputeDailyCost,
  // Route integration
  getTmuxCostForSession,
  // Aggregate log (used by idle detector in Plan 03)
  logDailyTmuxCosts,
  _testLogDailyCost,
};
