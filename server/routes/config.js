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

function loadConfig() {
  const configPath =
    process.env.GSD_PROJECTS_PATH ||
    path.resolve(__dirname, "../../gsd-projects.json");
  const raw = fs.readFileSync(configPath, "utf8");
  return JSON.parse(raw);
}

function resolveClaudeMdPath(projectName) {
  if (!projectName || projectName === "global") {
    return "/data/home/CLAUDE.md";
  }
  const { projects } = loadConfig();
  const project = projects.find((p) => p.name === projectName);
  if (!project) return null;
  return path.join(project.root, "CLAUDE.md");
}

// GET /api/config/claude-md?project=:name — Read a CLAUDE.md file
router.get("/claude-md", async (req, res) => {
  const project = req.query.project || "global";

  if (GSD_DATA_URL) {
    try {
      const upstream = await fetch(
        `${GSD_DATA_URL}/api/config/claude-md?project=${encodeURIComponent(project)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
  }

  const filePath = resolveClaudeMdPath(project);
  if (!filePath) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    res.json({ content, path: filePath });
  } catch (err) {
    if (err.code === "ENOENT") {
      return res.status(404).json({ error: "CLAUDE.md not found", path: filePath });
    }
    res.status(500).json({ error: "Failed to read CLAUDE.md", detail: err.message });
  }
});

// PUT /api/config/claude-md — Write a CLAUDE.md file
router.put("/claude-md", async (req, res) => {
  const { project, content } = req.body || {};

  if (GSD_DATA_URL) {
    try {
      const upstream = await upstreamFetch(`${GSD_DATA_URL}/api/config/claude-md`, {
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

  if (typeof content !== "string" || content.trim() === "") {
    return res.status(400).json({ error: "content is required and must be a non-empty string" });
  }

  const filePath = resolveClaudeMdPath(project || "global");
  if (!filePath) {
    return res.status(404).json({ error: "Project not found" });
  }

  try {
    fs.writeFileSync(filePath, content, "utf8");
    res.json({ ok: true, path: filePath });
  } catch (err) {
    res.status(500).json({ error: "Failed to write CLAUDE.md", detail: err.message });
  }
});

// GET /api/config/project-settings — List all project settings
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
    const settings = rows.map((row) => ({
      ...row,
      telegram_alerts: JSON.parse(row.telegram_alerts || "{}"),
    }));
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: "Failed to list project settings", detail: err.message });
  }
});

// GET /api/config/project-settings/:project — Read project settings
router.get("/project-settings/:project", async (req, res) => {
  const { project } = req.params;

  if (GSD_DATA_URL) {
    try {
      const upstream = await fetch(
        `${GSD_DATA_URL}/api/config/project-settings/${encodeURIComponent(project)}`,
        { signal: AbortSignal.timeout(10000) }
      );
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
  }

  try {
    const row = stmts.getProjectSettings.get(project);
    if (!row) {
      // Fall back to global defaults for non-global projects with no row.
      // Do NOT auto-create a row on read.
      if (project !== GLOBAL_SETTINGS_KEY) {
        const global = getGlobalSettings();
        return res.json({
          project_key: project,
          verbosity: global.verbosity,
          telegram_alerts: global.telegram_alerts,
          updated_at: global.updated_at,
        });
      }
      // The __global__ row itself is missing — return hardcoded defaults.
      const global = getGlobalSettings();
      return res.json({
        project_key: GLOBAL_SETTINGS_KEY,
        verbosity: global.verbosity,
        telegram_alerts: global.telegram_alerts,
        updated_at: global.updated_at,
      });
    }
    res.json({
      ...row,
      telegram_alerts: JSON.parse(row.telegram_alerts || "{}"),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get project settings", detail: err.message });
  }
});

// POST /api/config/project-settings/apply-global — Bulk apply __global__ to all non-global rows
router.post("/project-settings/apply-global", async (req, res) => {
  if (GSD_DATA_URL) {
    try {
      const upstream = await upstreamFetch(`${GSD_DATA_URL}/api/config/project-settings/apply-global`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body || {}),
        signal: AbortSignal.timeout(10000),
      });
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
  }

  try {
    const globalRow = stmts.getProjectSettings.get(GLOBAL_SETTINGS_KEY);
    if (!globalRow) {
      return res.status(400).json({ error: "No global settings to apply" });
    }
    const result = stmts.applyGlobalSettings.run(
      globalRow.verbosity,
      globalRow.telegram_alerts || "{}",
      new Date().toISOString()
    );
    res.json({ ok: true, updated: result.changes });
  } catch (err) {
    res.status(500).json({ error: "Failed to apply global settings", detail: err.message });
  }
});

// PUT /api/config/project-settings/:project — Upsert project settings
router.put("/project-settings/:project", async (req, res) => {
  const { project } = req.params;

  if (GSD_DATA_URL) {
    try {
      const upstream = await fetch(
        `${GSD_DATA_URL}/api/config/project-settings/${encodeURIComponent(project)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req.body),
          signal: AbortSignal.timeout(10000),
        }
      );
      const data = await upstream.json();
      return res.status(upstream.status).json(data);
    } catch (err) {
      return res.status(502).json({ error: "Failed to reach GSD data source", detail: err.message });
    }
  }

  const { verbosity, telegram_alerts, suppress_context_reask, suppress_plan_ceremony } = req.body || {};

  // Validate verbosity
  const validVerbosity = ["verbose", "normal", "quiet"];
  const finalVerbosity = verbosity || "normal";
  if (!validVerbosity.includes(finalVerbosity)) {
    return res.status(400).json({
      error: `verbosity must be one of: ${validVerbosity.join(", ")}`,
    });
  }

  // Validate and serialize telegram_alerts
  const finalAlerts = telegram_alerts || {};
  if (typeof finalAlerts !== "object" || Array.isArray(finalAlerts)) {
    return res.status(400).json({ error: "telegram_alerts must be an object" });
  }

  try {
    stmts.upsertProjectSettings.run(
      project,
      finalVerbosity,
      JSON.stringify(finalAlerts),
      suppress_context_reask != null ? (suppress_context_reask ? 1 : 0) : null,
      suppress_plan_ceremony != null ? (suppress_plan_ceremony ? 1 : 0) : null,
    );
    const saved = stmts.getProjectSettings.get(project);
    res.json({
      ok: true,
      settings: {
        ...saved,
        telegram_alerts: JSON.parse(saved.telegram_alerts || "{}"),
        suppress_context_reask: saved.suppress_context_reask === 1,
        suppress_plan_ceremony: saved.suppress_plan_ceremony === 1,
      },
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to save project settings", detail: err.message });
  }
});

module.exports = router;
