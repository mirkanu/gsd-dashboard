const { Router } = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { db, stmts, DB_PATH } = require("../db");
const { getConnectionCount, broadcast } = require("../websocket");

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
 * GET /api/settings/llm-provider
 *
 * Get current LLM provider from Claude settings.json
 *
 * Response shape:
 *   {
 *     "provider": "claude" | "zai" | "ollama",
 *     "config": { "base_url": string, "auth_token": string }
 *   }
 */
router.get("/llm-provider", (_req, res) => {
  try {
    if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) {
      return res.json({ provider: "claude", config: null });
    }
    const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf8");
    const settings = JSON.parse(raw);
    const baseUrl = settings.env?.ANTHROPIC_BASE_URL;
    const authToken = settings.env?.ANTHROPIC_AUTH_TOKEN;

    let provider = "claude";
    if (baseUrl && authToken) {
      if (baseUrl.includes("openrouter-bridge") || baseUrl.includes("openrouter.ai")) {
        provider = "openrouter";
      } else if (baseUrl.includes("z.ai")) {
        provider = "zai";
      } else if (baseUrl.includes("ollama-bridge") || baseUrl.includes("100.99.199.83") || authToken === "ollama") {
        provider = "ollama";
      }
    }

    const response = {
      provider,
      config: { base_url: baseUrl, auth_token: authToken },
    };
    if (provider === "openrouter") {
      response.model = settings._openrouterModel || "openrouter/owl-alpha";
    }
    res.json(response);
  } catch (err) {
    res.status(500).json({
      error: { code: "READ_SETTINGS_FAILED", message: err.message },
    });
  }
});

/**
 * PUT /api/settings/llm-provider
 *
 * Update LLM provider in Claude settings.json
 * Request body: { "provider": "claude" | "zai" | "ollama" }
 *
 * Returns: { "ok": true, "previous": string, "current": string }
 */
router.put("/llm-provider", (req, res) => {
  try {
    const { provider, model: requestedModel } = req.body;
    if (!["claude", "zai", "ollama", "openrouter", "minimax"].includes(provider)) {
      return res.status(400).json({
        error: { code: "INVALID_PROVIDER", message: "Invalid provider" },
      });
    }

    if (provider === "openrouter" && !process.env.OPENROUTER_API_KEY) {
      return res.status(400).json({
        error: { code: "MISSING_API_KEY", message: "OPENROUTER_API_KEY is not set in .env.production" },
      });
    }

    if (provider === "minimax" && !process.env.MINIMAX_API_KEY) {
      return res.status(400).json({
        error: { code: "MISSING_API_KEY", message: "MINIMAX_API_KEY is not set in .env.production" },
      });
    }

    let settings = {};
    if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
      const raw = fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf8");
      settings = JSON.parse(raw);
    }

    const prevUrl = settings.env?.ANTHROPIC_BASE_URL || "";
    const prevProvider = prevUrl
      ? prevUrl.includes("openrouter-bridge") || prevUrl.includes("openrouter.ai")
        ? "openrouter"
        : prevUrl.includes("minimax-bridge") || prevUrl.includes("minimax.chat")
        ? "minimax"
        : prevUrl.includes("z.ai")
        ? "zai"
        : prevUrl.includes("ollama-bridge") ||
          prevUrl.includes("100.99.199.83") ||
          settings.env?.ANTHROPIC_AUTH_TOKEN === "ollama"
        ? "ollama"
        : "claude"
      : "claude";

    const openrouterModel = provider === "openrouter"
      ? (requestedModel || "openrouter/owl-alpha")
      : null;

    const providerConfigs = {
      claude: { base_url: null, auth_token: null, model: null },
      openrouter: {
        base_url: "http://localhost:4820/openrouter-bridge",
        auth_token: "openrouter",
        model: null,
      },
      minimax: {
        base_url: "http://localhost:4820/minimax-bridge",
        auth_token: "minimax",
        model: null,
      },
      zai: {
        base_url: "https://api.z.ai/api/anthropic",
        auth_token: "91390354889a4c329e7e1df5855c12cb.HHBacM9NnnDt9TiB",
        model: null,
      },
      ollama: {
        base_url: "http://localhost:4820/ollama-bridge",
        auth_token: "ollama",
        model: "qwen2.5-coder:14b",
      },
    };

    const config = providerConfigs[provider];
    if (!settings.env) settings.env = {};

    // Save/restore model when switching to/from Ollama
    if (config.model) {
      if (settings.model && settings.model !== config.model) {
        settings._savedModel = settings.model;
      }
      settings.model = config.model;
    } else if (settings._savedModel) {
      settings.model = settings._savedModel;
      delete settings._savedModel;
    }

    // Store/clear the selected OpenRouter model (read by the openrouter-bridge at request time)
    if (openrouterModel) {
      settings._openrouterModel = openrouterModel;
    } else {
      delete settings._openrouterModel;
    }

    if (config.base_url) {
      settings.env.ANTHROPIC_BASE_URL = config.base_url;
    } else {
      delete settings.env.ANTHROPIC_BASE_URL;
    }
    if (config.auth_token) {
      settings.env.ANTHROPIC_AUTH_TOKEN = config.auth_token;
    } else {
      delete settings.env.ANTHROPIC_AUTH_TOKEN;
    }

    fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2));

    // Broadcast provider change so running CLI sessions can detect it
    broadcast("llm_provider_changed", {
      provider,
      previous: prevProvider,
      requiresRestart: provider === "claude", // Anthropic requires CLI restart to clear env vars
    });

    res.json({
      ok: true,
      previous: prevProvider,
      current: provider,
    });
  } catch (err) {
    res.status(500).json({
      error: { code: "WRITE_SETTINGS_FAILED", message: err.message },
    });
  }
});

/**
 * POST /api/settings/llm-provider/test
 *
 * Test connectivity to a provider before switching.
 * Request body: { "provider": "claude" | "zai" | "ollama" }
 * Returns: { "ok": true, "latency_ms": number, "model": string }
 *       or { "ok": false, "error": string }
 */
router.post("/llm-provider/test", async (req, res) => {
  const { provider } = req.body;
  if (!["claude", "zai", "ollama", "openrouter", "minimax"].includes(provider)) {
    return res.status(400).json({ ok: false, error: "Invalid provider" });
  }

  if (provider === "claude") {
    return res.json({ ok: true, latency_ms: 0, model: "claude-sonnet-4-6", detail: "Default Anthropic API" });
  }

  if (provider === "zai") {
    return res.json({ ok: true, latency_ms: 0, model: "claude-sonnet-4-6", detail: "z.AI proxy" });
  }

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.json({ ok: false, error: "OPENROUTER_API_KEY is not set in .env.production — add it and restart the dashboard" });
    }
    const https = require("https");
    const testModel = req.body.model || "openrouter/owl-alpha";
    const start = Date.now();
    try {
      const testResp = await new Promise((resolve, reject) => {
        const payload = JSON.stringify({
          model: testModel,
          max_tokens: 10,
          messages: [{ role: "user", content: "hi" }],
        });
        const r = https.request("https://openrouter.ai/api/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          timeout: 15000,
        }, (resp) => {
          let data = "";
          resp.on("data", (c) => { data += c; });
          resp.on("end", () => {
            try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
            catch { reject(new Error("Invalid response from OpenRouter")); }
          });
        });
        r.on("error", (e) => reject(new Error(`OpenRouter not reachable: ${e.message}`)));
        r.on("timeout", () => { r.destroy(); reject(new Error("OpenRouter timed out")); });
        r.write(payload);
        r.end();
      });

      const latency = Date.now() - start;
      if (testResp.status === 401) {
        return res.json({ ok: false, error: "API key rejected — check OPENROUTER_API_KEY" });
      }
      if (testResp.status !== 200) {
        return res.json({ ok: false, error: `OpenRouter returned HTTP ${testResp.status}: ${testResp.body?.error?.message || "unknown error"}` });
      }
      const hasContent = testResp.body.content?.some(c => c.text);
      if (!hasContent) {
        return res.json({ ok: false, error: "OpenRouter returned empty response" });
      }
      return res.json({ ok: true, latency_ms: latency, model: testResp.body.model || "anthropic/claude-haiku-4-5", detail: `Responded in ${(latency / 1000).toFixed(1)}s` });
    } catch (err) {
      return res.json({ ok: false, error: err.message });
    }
  }

  // MiniMax: test connectivity with a simple completion
  if (provider === "minimax") {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return res.json({ ok: false, error: "MINIMAX_API_KEY is not set in .env.production — add it and restart the dashboard" });
    }
    const https = require("https");
    const start = Date.now();
    try {
      const testResp = await new Promise((resolve, reject) => {
        const payload = JSON.stringify({
          model: "MiniMax-M3",
          messages: [{ role: "user", content: "hi" }],
          max_completion_tokens: 10,
        });
        const r = https.request("https://api.minimax.io/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          timeout: 15000,
        }, (resp) => {
          let data = "";
          resp.on("data", (c) => { data += c; });
          resp.on("end", () => {
            try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
            catch { reject(new Error("Invalid response from MiniMax")); }
          });
        });
        r.on("error", (e) => reject(new Error(`MiniMax not reachable: ${e.message}`)));
        r.on("timeout", () => { r.destroy(); reject(new Error("MiniMax timed out")); });
        r.write(payload);
        r.end();
      });

      const latency = Date.now() - start;
      if (testResp.status === 401) {
        return res.json({ ok: false, error: "API key rejected — check MINIMAX_API_KEY" });
      }
      if (testResp.status !== 200) {
        return res.json({ ok: false, error: `MiniMax returned HTTP ${testResp.status}: ${JSON.stringify(testResp.body)}` });
      }

      // MiniMax returns: { choices: [{ message: { role, content } }] }
      const hasContent = testResp.body?.choices?.[0]?.message?.content;
      if (!hasContent) {
        console.error("[minimax-test] Unexpected response format:", JSON.stringify(testResp.body, null, 2));
        return res.json({ ok: false, error: `MiniMax returned unexpected format: ${JSON.stringify(testResp.body).slice(0, 200)}` });
      }
      return res.json({ ok: true, latency_ms: latency, model: "abab6.5s-chat", detail: `Responded in ${(latency / 1000).toFixed(1)}s` });
    } catch (err) {
      return res.json({ ok: false, error: err.message });
    }
  }

  // Ollama: check reachability, list models, test a simple completion
  const ollamaHost = "http://100.99.199.83:11434";
  const http = require("http");

  try {
    // Step 1: Check if Ollama is reachable and list models
    const tagsResp = await new Promise((resolve, reject) => {
      const r = http.get(`${ollamaHost}/api/tags`, { timeout: 5000 }, (resp) => {
        let data = "";
        resp.on("data", (c) => { data += c; });
        resp.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error("Invalid response from Ollama")); }
        });
      });
      r.on("error", () => reject(new Error("Ollama server not reachable")));
      r.on("timeout", () => { r.destroy(); reject(new Error("Ollama server not reachable (timeout)")); });
    });

    const models = (tagsResp.models || []).map(m => m.name);
    if (models.length === 0) {
      return res.json({ ok: false, error: "Ollama is running but no models are installed. Run: ollama pull qwen2.5-coder:14b" });
    }

    // Step 2: Test a quick completion via native Anthropic endpoint
    const testModel = models[0];
    const start = Date.now();
    const testResp = await new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        model: testModel,
        max_tokens: 10,
        messages: [{ role: "user", content: "hi" }],
      });
      const r = http.request(`${ollamaHost}/v1/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": "ollama", "anthropic-version": "2023-06-01" },
        timeout: 120000,
      }, (resp) => {
        let data = "";
        resp.on("data", (c) => { data += c; });
        resp.on("end", () => {
          try { resolve(JSON.parse(data)); }
          catch { reject(new Error("Invalid completion response")); }
        });
      });
      r.on("error", (e) => reject(new Error(`Completion failed: ${e.message}`)));
      r.on("timeout", () => { r.destroy(); reject(new Error("Model response timed out (may need to load into memory first)")); });
      r.write(payload);
      r.end();
    });

    const latency = Date.now() - start;
    const hasContent = testResp.content?.some(c => c.text || c.thinking);

    if (hasContent) {
      return res.json({ ok: true, latency_ms: latency, model: testModel, models, detail: `Responded in ${(latency / 1000).toFixed(1)}s` });
    } else {
      return res.json({ ok: false, error: `Model ${testModel} returned empty response`, models });
    }
  } catch (err) {
    return res.json({ ok: false, error: err.message });
  }
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
