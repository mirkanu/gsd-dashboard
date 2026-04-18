const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { db, stmts, DB_PATH } = require("../db");
const { getConnectionCount } = require("../websocket");

const router = Router();

const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

function getDbSize() {
  try {
    const stat = fs.statSync(DB_PATH);
    return stat.size;
  } catch {
    return 0;
  }
}

function getTableCounts() {
  const tables = ["sessions", "agents", "events", "model_pricing"];
  const counts = {};
  for (const t of tables) {
    counts[t] = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c;
  }
  counts.token_usage = db
    .prepare("SELECT COUNT(DISTINCT session_id) as c FROM token_usage")
    .get().c;
  return counts;
}

function getHookStatus() {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) {
      return { installed: false, path: CLAUDE_SETTINGS_PATH, hooks: {} };
    }
    const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf8");
    const settings = JSON.parse(raw);
    const hookTypes = [
      "PreToolUse",
      "PostToolUse",
      "Stop",
      "SubagentStop",
      "Notification",
      "SessionStart",
      "SessionEnd",
    ];
    const hooks = {};
    for (const ht of hookTypes) {
      const entries = settings.hooks?.[ht] || [];
      hooks[ht] = entries.some(
        (e) =>
          (e.command && e.command.includes("hook-handler.js")) ||
          (Array.isArray(e.hooks) &&
            e.hooks.some((h) => h.command && h.command.includes("hook-handler.js")))
      );
    }
    const installed = Object.values(hooks).every(Boolean);
    return { installed, path: CLAUDE_SETTINGS_PATH, hooks };
  } catch {
    return { installed: false, path: CLAUDE_SETTINGS_PATH, hooks: {} };
  }
}

// GET /api/settings/info — system info, db stats, hook status
router.get("/info", (_req, res) => {
  const dbSize = getDbSize();
  const counts = getTableCounts();
  const hookStatus = getHookStatus();

  res.json({
    db: {
      path: DB_PATH,
      size: dbSize,
      counts,
    },
    hooks: hookStatus,
    server: {
      uptime: process.uptime(),
      node_version: process.version,
      platform: process.platform,
      ws_connections: getConnectionCount(),
    },
  });
});

// POST /api/settings/clear-data — delete all sessions, agents, events, tokens
router.post("/clear-data", (_req, res) => {
  const counts = getTableCounts();
  db.pragma("foreign_keys = OFF");
  db.prepare("DELETE FROM token_usage").run();
  db.prepare("DELETE FROM events").run();
  db.prepare("DELETE FROM agents").run();
  db.prepare("DELETE FROM sessions").run();
  db.pragma("foreign_keys = ON");
  res.json({ ok: true, cleared: counts });
});

// POST /api/settings/reimport — re-import legacy sessions from ~/.claude/
router.post("/reimport", async (_req, res) => {
  try {
    const { importAllSessions } = require("../../scripts/import-history");
    const dbModule = require("../db");
    const result = await importAllSessions(dbModule);
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({
      error: { code: "IMPORT_FAILED", message: err.message },
    });
  }
});

// POST /api/settings/reinstall-hooks — reinstall Claude Code hooks
router.post("/reinstall-hooks", (_req, res) => {
  try {
    const { installHooks } = require("../../scripts/install-hooks");
    const success = installHooks(true);
    const hookStatus = getHookStatus();
    res.json({ ok: success, hooks: hookStatus });
  } catch (err) {
    res.status(500).json({
      error: { code: "HOOK_INSTALL_FAILED", message: err.message },
    });
  }
});

// POST /api/settings/reset-pricing — reset pricing to defaults
router.post("/reset-pricing", (_req, res) => {
  db.prepare("DELETE FROM model_pricing").run();

  const seedPricing = db.prepare(
    "INSERT OR IGNORE INTO model_pricing (model_pattern, display_name, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const defaults = [
    ["claude-opus-4-5%", "Claude Opus 4.5", 5, 25, 0.5, 6.25],
    ["claude-opus-4-6%", "Claude Opus 4.6", 5, 25, 0.5, 6.25],
    ["claude-opus-4-1%", "Claude Opus 4.1", 15, 75, 1.5, 18.75],
    ["claude-opus-4-2%", "Claude Opus 4", 15, 75, 1.5, 18.75],
    ["claude-sonnet-4-6%", "Claude Sonnet 4.6", 3, 15, 0.3, 3.75],
    ["claude-sonnet-4-5%", "Claude Sonnet 4.5", 3, 15, 0.3, 3.75],
    ["claude-sonnet-4-2%", "Claude Sonnet 4", 3, 15, 0.3, 3.75],
    ["claude-3-7-sonnet%", "Claude Sonnet 3.7", 3, 15, 0.3, 3.75],
    ["claude-3-5-sonnet%", "Claude Sonnet 3.5", 3, 15, 0.3, 3.75],
    ["claude-haiku-4-5%", "Claude Haiku 4.5", 1, 5, 0.1, 1.25],
    ["claude-3-5-haiku%", "Claude Haiku 3.5", 0.8, 4, 0.08, 1],
    ["claude-3-haiku%", "Claude Haiku 3", 0.25, 1.25, 0.03, 0.3],
    ["claude-3-opus%", "Claude Opus 3", 15, 75, 1.5, 18.75],
  ];
  for (const [pattern, name, inp, out, cr, cw] of defaults) {
    seedPricing.run(pattern, name, inp, out, cr, cw);
  }

  const pricing = stmts.listPricing.all();
  res.json({ ok: true, pricing });
});

/**
 * GET /api/settings/export
 *
 * Export all user data as a single JSON document for portability
 * (Phase 58 Retired-stage transitions and manual backups).
 *
 * Response shape:
 *   {
 *     "schema_version": 1,
 *     "exported_at": "<ISO-8601 timestamp>",
 *     "tables": {
 *       "projects":                [...],
 *       "project_tasks":           [...],
 *       "app_settings":            [...],
 *       "external_service_costs":  [...],
 *       "service_mapping_rules":   [...],
 *       "manual_cost_entries":     [...],
 *       "model_pricing":           [...],
 *       "claude_api_usage":        [...],
 *       "processed_emails":        [...],
 *       "project_settings":        [...]
 *     }
 *   }
 *
 * Content-Disposition is attachment with filename
 * "gsd-dashboard-export-YYYY-MM-DD.json".
 *
 * Sensitive fields (encrypted ciphertexts from Phase 45 app_settings)
 * are returned verbatim — decrypting requires the runtime AES-GCM key,
 * which is not included in the export. Do not include any `*_plaintext`
 * column even if present.
 */
router.get("/export", (_req, res) => {
  const tables = {};
  const tableNames = [
    "projects",
    "project_tasks",
    "app_settings",
    "external_service_costs",
    "service_mapping_rules",
    "manual_cost_entries",
    "model_pricing",
    "claude_api_usage",
    "processed_emails",
    "project_settings",
  ];

  // Read each table; guard with try/catch to handle missing tables gracefully (forward compat with schema drops)
  for (const tableName of tableNames) {
    try {
      tables[tableName] = db.prepare(`SELECT * FROM ${tableName}`).all();
    } catch {
      // Table doesn't exist yet or was dropped — return empty array
      tables[tableName] = [];
    }
  }

  res.setHeader("Content-Type", "application/json");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="gsd-dashboard-export-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.json({
    schema_version: 1,
    exported_at: new Date().toISOString(),
    tables,
  });
});

module.exports = router;
