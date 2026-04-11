const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { db } = require("../db");

const GSD_PROJECTS_PATH = path.join(__dirname, "..", "..", "gsd-projects.json");

/**
 * Normalize an Atlassian Statuspage indicator to our 4-value status.
 * indicator: "none" | "minor" | "major" | "critical"
 */
function normalizeAtlassian(indicator) {
  if (indicator === "none") return "operational";
  if (indicator === "minor") return "degraded";
  if (indicator === "major" || indicator === "critical") return "outage";
  return "unknown";
}

/**
 * Normalize a plain status string (Railway instatus format).
 * @param {string} status
 */
function normalizePlain(status) {
  if (typeof status !== "string") return "unknown";
  if (status === "operational") return "operational";
  return "degraded";
}

/**
 * Fetch a single status URL and return a normalized result.
 * Always resolves — never rejects.
 */
async function fetchStatus(name, statusUrl) {
  try {
    const res = await fetch(statusUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { "Accept": "application/json" },
    });
    if (!res.ok) {
      return { name, statusUrl, status: "unknown", description: "HTTP " + res.status };
    }
    const json = await res.json();

    // Atlassian Statuspage format: { status: { indicator, description } }
    if (json.status && typeof json.status === "object" && json.status.indicator !== undefined) {
      return {
        name,
        statusUrl,
        status: normalizeAtlassian(json.status.indicator),
        description: json.status.description || "",
      };
    }

    // Plain string status format (Railway instatus / others)
    if (typeof json.status === "string") {
      return {
        name,
        statusUrl,
        status: normalizePlain(json.status),
        description: json.status,
      };
    }

    return { name, statusUrl, status: "unknown", description: "Unrecognized response format" };
  } catch (err) {
    return { name, statusUrl, status: "unknown", description: err.message || "Fetch error" };
  }
}

/**
 * GET /api/services/status
 * Returns live status for all configured external services grouped by project.
 */
router.get("/status", async (_req, res) => {
  let config;
  try {
    const raw = fs.readFileSync(GSD_PROJECTS_PATH, "utf8");
    config = JSON.parse(raw);
  } catch (err) {
    return res.status(500).json({ error: "Failed to read gsd-projects.json", detail: err.message });
  }

  const projects = (config.projects || []).filter(
    (p) => Array.isArray(p.services) && p.services.length > 0
  );

  // Build a deduplicated map of statusUrl -> fetch promise
  const urlMap = new Map();
  for (const project of projects) {
    for (const svc of project.services) {
      if (!urlMap.has(svc.statusUrl)) {
        urlMap.set(svc.statusUrl, fetchStatus(svc.name, svc.statusUrl));
      }
    }
  }

  // Fetch all unique URLs in parallel
  const entries = Array.from(urlMap.entries());
  const results = await Promise.allSettled(entries.map(([, promise]) => promise));

  // Build result lookup by statusUrl
  const statusByUrl = new Map();
  for (let i = 0; i < entries.length; i++) {
    const [url] = entries[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      statusByUrl.set(url, result.value);
    } else {
      // Rejected should never happen since fetchStatus always resolves, but be safe
      statusByUrl.set(url, { status: "unknown", description: "Unexpected error" });
    }
  }

  // Assemble response grouped by project
  const responseProjects = projects.map((project) => ({
    name: project.name,
    services: project.services.map((svc) => {
      const fetched = statusByUrl.get(svc.statusUrl);
      return {
        name: svc.name,
        status: fetched ? fetched.status : "unknown",
        description: fetched ? fetched.description : "Unknown",
      };
    }),
  }));

  res.json({ projects: responseProjects });
});

// ---------------------------------------------------------------------------
// Phase 45 Plan 02: /api/services/costs CRUD + monthly rollup
//
// All rows the UI sees live in `external_service_costs`. The `notes` column
// encodes a linking convention so edits/deletes can cascade correctly:
//   manual:<muid>    → linked to a one-time manual_cost_entries row
//   recurring:<muid> → materialized this month from a recurring template
//   email:<msgid>    → parsed from a forwarded billing email (no cascade)
//   (empty)          → unparsed row awaiting review
//
// Materialization of recurring templates is ON-READ and GUARDED to the
// current calendar month only. Past months surface whatever is stored —
// no backfill. See 45-CONTEXT.md "Cost rollup semantics".
// ---------------------------------------------------------------------------

const listCostsForMonth = db.prepare(`
  SELECT id, service, cost_usd, currency, project_key, source, description, checked_at, message_id, raw_body, notes
  FROM external_service_costs
  WHERE checked_at >= ? AND checked_at < ?
  ORDER BY checked_at DESC
`);
const getCostById = db.prepare(`SELECT * FROM external_service_costs WHERE id = ?`);
const insertCost = db.prepare(`
  INSERT INTO external_service_costs (id, service, cost_period, cost_usd, currency, checked_at, source, project_key, notes, description)
  VALUES (?, ?, 'monthly', ?, ?, ?, ?, ?, ?, ?)
`);
const updateCost = db.prepare(`
  UPDATE external_service_costs SET
    service = COALESCE(?, service),
    cost_usd = COALESCE(?, cost_usd),
    currency = COALESCE(?, currency),
    project_key = ?,
    description = COALESCE(?, description),
    source = COALESCE(?, source)
  WHERE id = ?
`);
const deleteCostById = db.prepare(`DELETE FROM external_service_costs WHERE id = ?`);

const listRecurring = db.prepare(`SELECT * FROM manual_cost_entries WHERE recurring_monthly = 1 AND start_date <= ?`);
const insertRecurringMaterialized = db.prepare(`
  INSERT INTO external_service_costs (id, service, cost_period, cost_usd, currency, checked_at, source, project_key, notes, description)
  VALUES (?, ?, 'monthly', ?, ?, ?, 'recurring', ?, ?, ?)
`);
const hasMaterializedForMonth = db.prepare(`
  SELECT 1 FROM external_service_costs
  WHERE source='recurring' AND notes = ? AND checked_at >= ? AND checked_at < ?
`);

const insertManualEntry = db.prepare(`
  INSERT INTO manual_cost_entries (id, service, project_key, cost_usd, currency, start_date, recurring_monthly, notes, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'))
`);
const updateManualEntry = db.prepare(`
  UPDATE manual_cost_entries SET
    service = COALESCE(?, service),
    project_key = ?,
    cost_usd = COALESCE(?, cost_usd),
    currency = COALESCE(?, currency),
    notes = COALESCE(?, notes),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
  WHERE id = ?
`);
const deleteManualEntry = db.prepare(`DELETE FROM manual_cost_entries WHERE id = ?`);

function monthBounds(monthStr) {
  const [y, m] = monthStr.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const end = new Date(Date.UTC(y, m, 1)).toISOString();
  return { start, end, label: monthStr };
}

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const materialize = db.transaction((bounds) => {
  const recurringRows = listRecurring.all(bounds.end);
  for (const r of recurringRows) {
    const tag = `recurring:${r.id}`;
    if (!hasMaterializedForMonth.get(tag, bounds.start, bounds.end)) {
      insertRecurringMaterialized.run(
        uuidv4(),
        r.service,
        r.cost_usd,
        r.currency,
        bounds.start,
        r.project_key,
        tag,
        r.notes
      );
    }
  }
});

// GET /api/services/costs?month=YYYY-MM
router.get("/costs", (req, res) => {
  try {
    const monthStr = req.query.month && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : currentMonth();
    const bounds = monthBounds(monthStr);

    // Materialize recurring templates ONLY when viewing the current calendar
    // month. Historical months are frozen — never backfill.
    if (bounds.label === currentMonth()) {
      materialize(bounds);
    }

    const rows = listCostsForMonth.all(bounds.start, bounds.end);

    const byService = new Map();
    for (const row of rows) {
      const s = byService.get(row.service) || {
        service: row.service,
        total_usd: 0,
        source_breakdown: { manual: 0, email: 0, recurring: 0, unparsed: 0, api: 0 },
      };
      s.total_usd += row.cost_usd;
      s.source_breakdown[row.source] = (s.source_breakdown[row.source] || 0) + row.cost_usd;
      byService.set(row.service, s);
    }

    const byProject = new Map();
    for (const row of rows) {
      const pk = row.project_key; // null = Unassigned bucket
      const p = byProject.get(pk) || { project_key: pk, total_usd: 0, services: new Map() };
      p.total_usd += row.cost_usd;
      p.services.set(row.service, (p.services.get(row.service) || 0) + row.cost_usd);
      byProject.set(pk, p);
    }

    const needs_review = rows
      .filter((r) => r.source === "unparsed")
      .map((r) => ({
        id: r.id,
        service: r.service,
        cost_usd: r.cost_usd,
        raw_body: r.raw_body,
        checked_at: r.checked_at,
      }));

    res.json({
      month: bounds.label,
      services: Array.from(byService.values()).sort((a, b) => b.total_usd - a.total_usd),
      projects: Array.from(byProject.values()).map((p) => ({
        project_key: p.project_key,
        total_usd: p.total_usd,
        services: Array.from(p.services.entries()).map(([service, total_usd]) => ({ service, total_usd })),
      })),
      needs_review,
      entries: rows.map((r) => ({
        id: r.id,
        service: r.service,
        cost_usd: r.cost_usd,
        currency: r.currency,
        project_key: r.project_key,
        source: r.source,
        description: r.description,
        checked_at: r.checked_at,
        message_id: r.message_id,
        notes: r.notes,
      })),
    });
  } catch (e) {
    console.error("[services/costs GET]", e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/services/costs — create a manual cost entry.
// One-time entries create BOTH a manual_cost_entries row AND an
// external_service_costs row linked via notes='manual:<muid>'.
// Recurring entries create ONLY a manual_cost_entries template row;
// per-month external_service_costs rows are materialized on read.
router.post("/costs", express.json(), (req, res) => {
  const {
    service,
    project_key = null,
    cost_usd,
    currency = "USD",
    start_date,
    recurring_monthly = false,
    notes = null,
    description = "",
  } = req.body || {};

  if (!service || typeof service !== "string") {
    return res.status(400).json({ error: "service required" });
  }
  if (!Number.isFinite(cost_usd) || cost_usd <= 0) {
    return res.status(400).json({ error: "cost_usd must be a positive number" });
  }

  const sd = start_date || new Date().toISOString();
  const recurFlag = recurring_monthly ? 1 : 0;

  const tx = db.transaction(() => {
    const muid = uuidv4();
    insertManualEntry.run(muid, service, project_key, cost_usd, currency, sd, recurFlag, notes);
    if (recurFlag === 0) {
      const ecid = uuidv4();
      insertCost.run(ecid, service, cost_usd, currency, sd, "manual", project_key, `manual:${muid}`, description);
      return { id: ecid, manual_id: muid };
    }
    return { id: null, manual_id: muid };
  });

  try {
    const result = tx();
    res.status(201).json({ ok: true, ...result });
  } catch (e) {
    console.error("[services/costs POST]", e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/services/costs/:id — update an external_service_costs row.
// Cascades to manual_cost_entries when notes starts with 'manual:'.
// Recurring materialized rows (`recurring:<muid>`) are updated in place only —
// the underlying template stays frozen; to change it, delete + recreate.
router.patch("/costs/:id", express.json(), (req, res) => {
  const row = getCostById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "cost row not found" });

  const { service, cost_usd, currency, project_key, description, source } = req.body || {};
  const pk = project_key === undefined ? row.project_key : project_key;

  const tx = db.transaction(() => {
    updateCost.run(
      service ?? null,
      cost_usd ?? null,
      currency ?? null,
      pk,
      description ?? null,
      source ?? null,
      row.id
    );

    if (row.notes && row.notes.startsWith("manual:")) {
      const muid = row.notes.slice("manual:".length);
      updateManualEntry.run(
        service ?? null,
        pk,
        cost_usd ?? null,
        currency ?? null,
        null,
        muid
      );
    }
    // 'recurring:<muid>' rows: do NOT cascade — preserve the template.
  });

  try {
    tx();
    res.json({ ok: true });
  } catch (e) {
    console.error("[services/costs PATCH]", e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/services/costs/:id — uniform delete by external_service_costs.id.
// Cascades to manual_cost_entries for 'manual:' and 'recurring:' notes prefixes.
// email: and unparsed rows delete only the external_service_costs row.
router.delete("/costs/:id", (req, res) => {
  const row = getCostById.get(req.params.id);
  if (!row) return res.status(404).json({ error: "cost row not found" });

  const tx = db.transaction(() => {
    deleteCostById.run(row.id);
    if (row.notes && row.notes.startsWith("manual:")) {
      const muid = row.notes.slice("manual:".length);
      deleteManualEntry.run(muid);
    } else if (row.notes && row.notes.startsWith("recurring:")) {
      const muid = row.notes.slice("recurring:".length);
      // Stop future materializations by deleting the template; other months'
      // materialized rows remain.
      deleteManualEntry.run(muid);
    }
  });

  try {
    tx();
    res.json({ ok: true, deleted: 1 });
  } catch (e) {
    console.error("[services/costs DELETE]", e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
