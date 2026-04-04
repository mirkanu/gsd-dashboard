let Database;
try {
  Database = require("better-sqlite3");
} catch {
  try {
    Database = require("./compat-sqlite");
  } catch {
    console.error(
      "\n" +
        "╔══════════════════════════════════════════════════════════════╗\n" +
        "║  SQLite backend not available                               ║\n" +
        "║                                                             ║\n" +
        "║  better-sqlite3 could not be loaded (native module) and     ║\n" +
        "║  node:sqlite is not available (requires Node.js >= 22).     ║\n" +
        "║                                                             ║\n" +
        "║  Fix options (pick one):                                    ║\n" +
        "║    1. Upgrade to Node.js 22+ (recommended)                  ║\n" +
        "║    2. Install Python 3 + C++ build tools, then              ║\n" +
        "║       run: npm rebuild better-sqlite3                       ║\n" +
        "╚══════════════════════════════════════════════════════════════╝\n"
    );
    process.exit(1);
  }
}
const path = require("path");
const fs = require("fs");

const DB_PATH = process.env.DASHBOARD_DB_PATH || path.join(__dirname, "..", "data", "dashboard.db");
const DB_DIR = path.dirname(DB_PATH);

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','error','abandoned')),
    cwd TEXT,
    model TEXT,
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ended_at TEXT,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'main' CHECK(type IN ('main','subagent')),
    subagent_type TEXT,
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','connected','working','completed','error')),
    task TEXT,
    current_tool TEXT,
    started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ended_at TEXT,
    parent_agent_id TEXT,
    metadata TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_agent_id) REFERENCES agents(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    agent_id TEXT,
    event_type TEXT NOT NULL,
    tool_name TEXT,
    summary TEXT,
    data TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS token_usage (
    session_id TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'unknown',
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (session_id, model),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS model_pricing (
    model_pattern TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    input_per_mtok REAL NOT NULL DEFAULT 0,
    output_per_mtok REAL NOT NULL DEFAULT 0,
    cache_read_per_mtok REAL NOT NULL DEFAULT 0,
    cache_write_per_mtok REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id);
  CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
  CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
  CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
  CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);

  CREATE TABLE IF NOT EXISTS gsd_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_gsd_messages_project ON gsd_messages(project, created_at DESC);

  CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_key TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_project_tasks_key ON project_tasks(project_key, archived);
`);

// Migration: add autopilot/cost tables (Phase 24)
try {
  db.prepare("SELECT 1 FROM autopilot_runs LIMIT 1").get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS autopilot_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','completed','failed')),
      failure_count INTEGER NOT NULL DEFAULT 0,
      last_failed_phase_num INTEGER,
      pause_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS process_registry (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      command TEXT NOT NULL,
      args TEXT,
      pid INTEGER,
      exit_code INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      stdout TEXT,
      stderr TEXT,
      FOREIGN KEY (run_id) REFERENCES autopilot_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS claude_api_usage (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES autopilot_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS external_service_costs (
      id TEXT PRIMARY KEY,
      service TEXT NOT NULL,
      cost_period TEXT NOT NULL DEFAULT 'monthly',
      cost_usd REAL NOT NULL DEFAULT 0,
      checked_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_autopilot_runs_project ON autopilot_runs(project_id);
    CREATE INDEX IF NOT EXISTS idx_autopilot_runs_status ON autopilot_runs(status);
    CREATE INDEX IF NOT EXISTS idx_process_registry_run ON process_registry(run_id);
    CREATE INDEX IF NOT EXISTS idx_process_registry_pid ON process_registry(pid);
    CREATE INDEX IF NOT EXISTS idx_claude_api_usage_run ON claude_api_usage(run_id);
    CREATE INDEX IF NOT EXISTS idx_service_costs_service ON external_service_costs(service);
  `);
}

// Seed default model pricing if table is empty
const pricingCount = db.prepare("SELECT COUNT(*) as c FROM model_pricing").get();
if (pricingCount.c === 0) {
  const seedPricing = db.prepare(
    "INSERT OR IGNORE INTO model_pricing (model_pattern, display_name, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok) VALUES (?, ?, ?, ?, ?, ?)"
  );
  // Columns: pattern, display_name, input, output, cache_read (hits & refreshes), cache_write (5m ephemeral)
  // Each model gets its own explicit row — no catch-all grouping
  const defaults = [
    // Opus family
    ["claude-opus-4-6%", "Claude Opus 4.6", 5, 25, 0.5, 6.25],
    ["claude-opus-4-5%", "Claude Opus 4.5", 5, 25, 0.5, 6.25],
    ["claude-opus-4-1%", "Claude Opus 4.1", 15, 75, 1.5, 18.75],
    ["claude-opus-4-2%", "Claude Opus 4", 15, 75, 1.5, 18.75],
    // Sonnet family
    ["claude-sonnet-4-6%", "Claude Sonnet 4.6", 3, 15, 0.3, 3.75],
    ["claude-sonnet-4-5%", "Claude Sonnet 4.5", 3, 15, 0.3, 3.75],
    ["claude-sonnet-4-2%", "Claude Sonnet 4", 3, 15, 0.3, 3.75],
    ["claude-3-7-sonnet%", "Claude Sonnet 3.7", 3, 15, 0.3, 3.75],
    ["claude-3-5-sonnet%", "Claude Sonnet 3.5", 3, 15, 0.3, 3.75],
    // Haiku family
    ["claude-haiku-4-5%", "Claude Haiku 4.5", 1, 5, 0.1, 1.25],
    ["claude-3-5-haiku%", "Claude Haiku 3.5", 0.8, 4, 0.08, 1],
    ["claude-3-haiku%", "Claude Haiku 3", 0.25, 1.25, 0.03, 0.3],
    // Legacy
    ["claude-3-opus%", "Claude Opus 3", 15, 75, 1.5, 18.75],
  ];
  for (const [pattern, name, inp, out, cr, cw] of defaults) {
    seedPricing.run(pattern, name, inp, out, cr, cw);
  }
}

// Migrate: if token_usage has rows without model column (old schema), add it
try {
  db.prepare("SELECT model FROM token_usage LIMIT 1").get();
} catch {
  // Old schema — recreate table with model column
  db.pragma("foreign_keys = OFF");
  db.prepare("ALTER TABLE token_usage RENAME TO token_usage_old").run();
  db.prepare(
    `
    CREATE TABLE token_usage (
      session_id TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT 'unknown',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (session_id, model),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `
  ).run();
  db.prepare(
    `
    INSERT INTO token_usage (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
      SELECT tu.session_id, COALESCE(s.model, 'unknown'), tu.input_tokens, tu.output_tokens, tu.cache_read_tokens, tu.cache_write_tokens
      FROM token_usage_old tu LEFT JOIN sessions s ON s.id = tu.session_id
  `
  ).run();
  db.prepare("DROP TABLE token_usage_old").run();
  db.pragma("foreign_keys = ON");
}

// Migrate: add updated_at columns to sessions and agents
try {
  db.prepare("SELECT updated_at FROM sessions LIMIT 1").get();
} catch {
  db.prepare("ALTER TABLE sessions ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''").run();
  db.prepare("UPDATE sessions SET updated_at = COALESCE(ended_at, started_at)").run();
}
try {
  db.prepare("SELECT updated_at FROM agents LIMIT 1").get();
} catch {
  db.prepare("ALTER TABLE agents ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''").run();
  db.prepare("UPDATE agents SET updated_at = COALESCE(ended_at, started_at)").run();
}

// Migrate: add compaction baseline columns to token_usage.
// When conversation compaction rewrites the JSONL, pre-compaction token counts
// are lost from the transcript. Baselines preserve those counts so the effective
// total = current + baseline.
try {
  db.prepare("SELECT baseline_input FROM token_usage LIMIT 1").get();
} catch {
  db.prepare("ALTER TABLE token_usage ADD COLUMN baseline_input INTEGER NOT NULL DEFAULT 0").run();
  db.prepare("ALTER TABLE token_usage ADD COLUMN baseline_output INTEGER NOT NULL DEFAULT 0").run();
  db.prepare(
    "ALTER TABLE token_usage ADD COLUMN baseline_cache_read INTEGER NOT NULL DEFAULT 0"
  ).run();
  db.prepare(
    "ALTER TABLE token_usage ADD COLUMN baseline_cache_write INTEGER NOT NULL DEFAULT 0"
  ).run();
}

// Migrate: add last_input_tokens to token_usage.
// input_tokens is the cumulative sum across all turns in the transcript — not the
// current context window size. last_input_tokens stores only the most recent turn's
// input_tokens, which is the actual current prompt size.
try {
  db.prepare("SELECT last_input_tokens FROM token_usage LIMIT 1").get();
} catch {
  db.prepare(
    "ALTER TABLE token_usage ADD COLUMN last_input_tokens INTEGER NOT NULL DEFAULT 0"
  ).run();
}

// Migrate: add message_type + metadata columns to gsd_messages (Phase 28)
try {
  db.prepare("SELECT message_type FROM gsd_messages LIMIT 1").get();
} catch {
  db.exec(`ALTER TABLE gsd_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'`);
  db.exec(`ALTER TABLE gsd_messages ADD COLUMN metadata TEXT`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_gsd_messages_type ON gsd_messages(project, message_type)`);
}

// Migrate: add classifier feedback + overrides tables (Phase 34)
try {
  db.prepare("SELECT 1 FROM classifier_feedback LIMIT 1").get();
} catch {
  db.exec(`
    CREATE TABLE IF NOT EXISTS classifier_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER NOT NULL,
      original_type TEXT NOT NULL,
      corrected_type TEXT NOT NULL,
      content_snapshot TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (message_id) REFERENCES gsd_messages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_message ON classifier_feedback(message_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON classifier_feedback(created_at DESC);

    CREATE TABLE IF NOT EXISTS classifier_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK(target_type IN ('text','stage_banner','checkpoint','completion','error','hidden')),
      priority INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'feedback' CHECK(source IN ('feedback','manual')),
      enabled INTEGER NOT NULL DEFAULT 1,
      hit_count INTEGER NOT NULL DEFAULT 0,
      feedback_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      FOREIGN KEY (feedback_id) REFERENCES classifier_feedback(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_overrides_enabled ON classifier_overrides(enabled, priority DESC);
  `);
}

// Startup cleanup: mark stale active sessions as completed.
// Legacy sessions (created before SessionEnd hook) will never receive a SessionEnd event,
// so they stay "active" forever. Complete any active session whose last event is older than
// 1 hour — the CLI process is certainly gone by then.
db.prepare(
  `
  UPDATE sessions SET
    status = 'completed',
    ended_at = COALESCE(ended_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE status = 'active'
    AND started_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
    AND NOT EXISTS (
      SELECT 1 FROM events e
      WHERE e.session_id = sessions.id
        AND e.created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
    )
`
).run();

// Startup cleanup: complete orphaned agents on finished sessions
db.prepare(
  `
  UPDATE agents SET
    status = 'completed',
    ended_at = COALESCE(ended_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  WHERE status IN ('working', 'connected', 'idle')
    AND session_id IN (SELECT id FROM sessions WHERE status IN ('completed', 'error', 'abandoned'))
`
).run();

// Startup cleanup: mark orphaned process_registry entries as exited (exit_code -1)
// Protects against processes that started but never updated their exit code (crash/restart)
try {
  db.prepare(`
    UPDATE process_registry
    SET exit_code = -1, ended_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE exit_code IS NULL
      AND started_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')
  `).run();
} catch { /* autopilot tables may not exist on very first boot */ }

const stmts = {
  getSession: db.prepare("SELECT * FROM sessions WHERE id = ?"),
  listSessions: db.prepare(
    `SELECT s.*, COUNT(a.id) as agent_count, s.updated_at as last_activity
     FROM sessions s LEFT JOIN agents a ON a.session_id = s.id
     GROUP BY s.id ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`
  ),
  listSessionsByStatus: db.prepare(
    `SELECT s.*, COUNT(a.id) as agent_count, s.updated_at as last_activity
     FROM sessions s LEFT JOIN agents a ON a.session_id = s.id
     WHERE s.status = ? GROUP BY s.id ORDER BY s.updated_at DESC LIMIT ? OFFSET ?`
  ),
  insertSession: db.prepare(
    "INSERT INTO sessions (id, name, status, cwd, model, started_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)"
  ),
  updateSession: db.prepare(
    "UPDATE sessions SET name = COALESCE(?, name), status = COALESCE(?, status), ended_at = COALESCE(?, ended_at), metadata = COALESCE(?, metadata), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  ),
  reactivateSession: db.prepare(
    "UPDATE sessions SET status = 'active', ended_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  ),

  getAgent: db.prepare("SELECT * FROM agents WHERE id = ?"),
  listAgents: db.prepare("SELECT * FROM agents ORDER BY started_at DESC LIMIT ? OFFSET ?"),
  listAgentsBySession: db.prepare(
    "SELECT * FROM agents WHERE session_id = ? ORDER BY started_at ASC"
  ),
  listAgentsByStatus: db.prepare(
    "SELECT * FROM agents WHERE status = ? ORDER BY started_at DESC LIMIT ? OFFSET ?"
  ),
  insertAgent: db.prepare(
    "INSERT INTO agents (id, session_id, name, type, subagent_type, status, task, started_at, updated_at, parent_agent_id, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?)"
  ),
  updateAgent: db.prepare(
    "UPDATE agents SET name = COALESCE(?, name), status = COALESCE(?, status), task = COALESCE(?, task), current_tool = ?, ended_at = COALESCE(?, ended_at), metadata = COALESCE(?, metadata), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  ),
  reactivateAgent: db.prepare(
    "UPDATE agents SET status = 'connected', ended_at = NULL, current_tool = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  ),

  touchSession: db.prepare(
    "UPDATE sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
  ),
  findStaleSessions: db.prepare(
    `SELECT id FROM sessions
     WHERE status = 'active' AND id != ?
       AND updated_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-' || ? || ' minutes')`
  ),

  insertEvent: db.prepare(
    "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, data, created_at) VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"
  ),
  listEvents: db.prepare("SELECT * FROM events ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"),
  listEventsBySession: db.prepare(
    "SELECT * FROM events WHERE session_id = ? ORDER BY created_at DESC, id DESC"
  ),
  countEvents: db.prepare("SELECT COUNT(*) as count FROM events"),
  countEventsSince: db.prepare("SELECT COUNT(*) as count FROM events WHERE created_at >= ?"),
  countEventsToday: db.prepare(
    "SELECT COUNT(*) as count FROM events WHERE created_at >= strftime('%Y-%m-%dT00:00:00.000Z', 'now', 'start of day')"
  ),

  stats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sessions) as total_sessions,
      (SELECT COUNT(*) FROM sessions WHERE status = 'active') as active_sessions,
      (SELECT COUNT(*) FROM agents WHERE status IN ('working', 'connected', 'idle')) as active_agents,
      (SELECT COUNT(*) FROM agents) as total_agents,
      (SELECT COUNT(*) FROM events) as total_events
  `),
  agentStatusCounts: db.prepare("SELECT status, COUNT(*) as count FROM agents GROUP BY status"),
  sessionStatusCounts: db.prepare("SELECT status, COUNT(*) as count FROM sessions GROUP BY status"),

  upsertTokenUsage: db.prepare(`
    INSERT INTO token_usage (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id, model) DO UPDATE SET
      input_tokens = input_tokens + excluded.input_tokens,
      output_tokens = output_tokens + excluded.output_tokens,
      cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
      cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens
  `),
  replaceTokenUsage: db.prepare(`
    INSERT INTO token_usage (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                             baseline_input, baseline_output, baseline_cache_read, baseline_cache_write,
                             last_input_tokens)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?)
    ON CONFLICT(session_id, model) DO UPDATE SET
      baseline_input = CASE WHEN excluded.input_tokens < input_tokens
        THEN baseline_input + input_tokens ELSE baseline_input END,
      baseline_output = CASE WHEN excluded.output_tokens < output_tokens
        THEN baseline_output + output_tokens ELSE baseline_output END,
      baseline_cache_read = CASE WHEN excluded.cache_read_tokens < cache_read_tokens
        THEN baseline_cache_read + cache_read_tokens ELSE baseline_cache_read END,
      baseline_cache_write = CASE WHEN excluded.cache_write_tokens < cache_write_tokens
        THEN baseline_cache_write + cache_write_tokens ELSE baseline_cache_write END,
      input_tokens = excluded.input_tokens,
      output_tokens = excluded.output_tokens,
      cache_read_tokens = excluded.cache_read_tokens,
      cache_write_tokens = excluded.cache_write_tokens,
      last_input_tokens = excluded.last_input_tokens
  `),
  getTokenTotals: db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens + baseline_input), 0) as total_input,
      COALESCE(SUM(output_tokens + baseline_output), 0) as total_output,
      COALESCE(SUM(cache_read_tokens + baseline_cache_read), 0) as total_cache_read,
      COALESCE(SUM(cache_write_tokens + baseline_cache_write), 0) as total_cache_write
    FROM token_usage
  `),
  getTokensBySession: db.prepare(
    `SELECT model,
      input_tokens + baseline_input as input_tokens,
      output_tokens + baseline_output as output_tokens,
      cache_read_tokens + baseline_cache_read as cache_read_tokens,
      cache_write_tokens + baseline_cache_write as cache_write_tokens
    FROM token_usage WHERE session_id = ?`
  ),

  // Model pricing
  listPricing: db.prepare("SELECT * FROM model_pricing ORDER BY display_name ASC"),
  getPricing: db.prepare("SELECT * FROM model_pricing WHERE model_pattern = ?"),
  upsertPricing: db.prepare(`
    INSERT INTO model_pricing (model_pattern, display_name, input_per_mtok, output_per_mtok, cache_read_per_mtok, cache_write_per_mtok, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    ON CONFLICT(model_pattern) DO UPDATE SET
      display_name = excluded.display_name,
      input_per_mtok = excluded.input_per_mtok,
      output_per_mtok = excluded.output_per_mtok,
      cache_read_per_mtok = excluded.cache_read_per_mtok,
      cache_write_per_mtok = excluded.cache_write_per_mtok,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `),
  deletePricing: db.prepare("DELETE FROM model_pricing WHERE model_pattern = ?"),
  matchPricing: db.prepare(
    "SELECT * FROM model_pricing WHERE ? LIKE REPLACE(model_pattern, '%', '%') LIMIT 1"
  ),
  toolUsageCounts: db.prepare(`
    SELECT tool_name, COUNT(*) as count
    FROM events
    WHERE tool_name IS NOT NULL
    GROUP BY tool_name
    ORDER BY count DESC
    LIMIT 20
  `),
  dailyEventCounts: db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM events
    WHERE created_at >= DATE('now', '-365 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `),
  dailySessionCounts: db.prepare(`
    SELECT DATE(started_at) as date, COUNT(*) as count
    FROM sessions
    WHERE started_at >= DATE('now', '-365 days')
    GROUP BY DATE(started_at)
    ORDER BY date ASC
  `),
  agentTypeDistribution: db.prepare(`
    SELECT subagent_type, COUNT(*) as count
    FROM agents
    WHERE type = 'subagent' AND subagent_type IS NOT NULL
    GROUP BY subagent_type
    ORDER BY count DESC
  `),
  totalSubagentCount: db.prepare("SELECT COUNT(*) as count FROM agents WHERE type = 'subagent'"),

  // GSD message log
  insertGsdMessage: db.prepare(
    `INSERT INTO gsd_messages (project, direction, content) VALUES (?, ?, ?)`
  ),
  listGsdMessages: db.prepare(
    `SELECT id, project, direction, content, created_at FROM gsd_messages WHERE project = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ),
  insertClassifiedMessage: db.prepare(
    `INSERT INTO gsd_messages (project, direction, content, message_type, metadata) VALUES (?, ?, ?, ?, ?)`
  ),
  listVisibleGsdMessages: db.prepare(
    `SELECT id, project, direction, content, message_type, metadata, created_at FROM gsd_messages WHERE project = ? AND message_type != 'hidden' ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ),
  countGsdMessages: db.prepare(
    `SELECT COUNT(*) as count FROM gsd_messages WHERE project = ?`
  ),
  eventTypeCounts: db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM events
    GROUP BY event_type
    ORDER BY count DESC
  `),
  avgEventsPerSession: db.prepare(`
    SELECT ROUND(CAST(COUNT(*) AS REAL) / MAX(1, (SELECT COUNT(*) FROM sessions)), 1) as avg
    FROM events
  `),

  // Classifier feedback + overrides (Phase 34)
  getGsdMessage: db.prepare('SELECT * FROM gsd_messages WHERE id = ?'),
  updateMessageType: db.prepare('UPDATE gsd_messages SET message_type = ? WHERE id = ?'),
  insertFeedback: db.prepare(
    `INSERT INTO classifier_feedback (message_id, original_type, corrected_type, content_snapshot)
     VALUES (?, ?, ?, ?)`
  ),
  listFeedback: db.prepare(
    'SELECT * FROM classifier_feedback ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ),
  listOverrides: db.prepare(
    'SELECT * FROM classifier_overrides WHERE enabled = 1 ORDER BY priority DESC, id DESC'
  ),
  insertOverride: db.prepare(
    `INSERT INTO classifier_overrides (pattern, target_type, feedback_id) VALUES (?, ?, ?)`
  ),
  disableOverride: db.prepare(
    'UPDATE classifier_overrides SET enabled = 0 WHERE id = ?'
  ),
  bumpOverrideHitCount: db.prepare(
    'UPDATE classifier_overrides SET hit_count = hit_count + 1 WHERE id = ?'
  ),

  // Project tasks
  insertTask: db.prepare(
    `INSERT INTO project_tasks (project_key, title, description) VALUES (?, ?, ?) RETURNING *`
  ),
  getTask: db.prepare(
    `SELECT * FROM project_tasks WHERE id = ?`
  ),
  listTasks: db.prepare(
    `SELECT * FROM project_tasks WHERE project_key = ? AND archived = ? ORDER BY created_at ASC`
  ),
  updateTask: db.prepare(
    `UPDATE project_tasks SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       archived = COALESCE(?, archived)
     WHERE id = ?
     RETURNING *`
  ),
};

// Autopilot prepared statements (Phase 24)
// Wrapped in try/catch: tables are created by migration above, but guard against
// edge cases where migration may not have run (e.g. first boot on very old schema)
try {
  stmts.insertAutopilotRun = db.prepare(
    'INSERT INTO autopilot_runs (id, project_id, started_at, status) VALUES (?, ?, ?, ?)'
  );
  stmts.getAutopilotRun = db.prepare('SELECT * FROM autopilot_runs WHERE id = ?');
  stmts.updateAutopilotRunFailure = db.prepare(
    'UPDATE autopilot_runs SET failure_count = ?, last_failed_phase_num = ? WHERE id = ?'
  );
  stmts.resetAutopilotRunFailure = db.prepare(
    'UPDATE autopilot_runs SET failure_count = 0, pause_reason = NULL WHERE id = ?'
  );
  stmts.insertProcessRegistry = db.prepare(
    'INSERT INTO process_registry (id, run_id, command, args, started_at) VALUES (?, ?, ?, ?, ?)'
  );
  stmts.updateProcessRegistryPid = db.prepare(
    'UPDATE process_registry SET pid = ? WHERE id = ?'
  );
  stmts.updateProcessRegistryExit = db.prepare(
    'UPDATE process_registry SET exit_code = ?, ended_at = ? WHERE id = ?'
  );
} catch (e) {
  console.error('[db] Failed to prepare autopilot statements:', e.message);
}

module.exports = { db, stmts, DB_PATH };
