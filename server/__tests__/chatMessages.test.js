const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");

let db;
let stmts;

/**
 * Recreate the gsd_messages schema + migration in an in-memory database,
 * matching the production db.js logic.
 */
function setupDatabase() {
  db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  // Original gsd_messages table (pre-migration)
  db.exec(`
    CREATE TABLE IF NOT EXISTS gsd_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('outbound','inbound')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_gsd_messages_project ON gsd_messages(project, created_at DESC);
  `);

  // Migration: add message_type + metadata columns
  try {
    db.prepare("SELECT message_type FROM gsd_messages LIMIT 1").get();
  } catch {
    db.exec(`ALTER TABLE gsd_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text'`);
    db.exec(`ALTER TABLE gsd_messages ADD COLUMN metadata TEXT`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_gsd_messages_type ON gsd_messages(project, message_type)`);
  }

  // Prepared statements
  stmts = {
    insertGsdMessage: db.prepare(
      `INSERT INTO gsd_messages (project, direction, content) VALUES (?, ?, ?)`
    ),
    insertClassifiedMessage: db.prepare(
      `INSERT INTO gsd_messages (project, direction, content, message_type, metadata) VALUES (?, ?, ?, ?, ?)`
    ),
    listVisibleGsdMessages: db.prepare(
      `SELECT id, project, direction, content, message_type, metadata, created_at FROM gsd_messages WHERE project = ? AND message_type != 'hidden' ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ),
    listGsdMessages: db.prepare(
      `SELECT id, project, direction, content, created_at FROM gsd_messages WHERE project = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ),
  };
}

describe("gsd_messages schema migration", () => {
  before(() => setupDatabase());

  it("Test 1: message_type and metadata columns exist after migration", () => {
    const row = db.prepare("SELECT message_type, metadata FROM gsd_messages LIMIT 1").get();
    // No rows yet, but the query succeeds (columns exist)
    assert.equal(row, undefined);
  });

  it("Test 2: insertClassifiedMessage persists stage_banner with metadata", () => {
    const meta = JSON.stringify({ phase: 1 });
    stmts.insertClassifiedMessage.run("test-project", "inbound", "Phase 1 started", "stage_banner", meta);

    const row = db.prepare(
      "SELECT message_type, metadata FROM gsd_messages WHERE project = 'test-project' ORDER BY id DESC LIMIT 1"
    ).get();

    assert.equal(row.message_type, "stage_banner");
    assert.deepEqual(JSON.parse(row.metadata), { phase: 1 });
  });

  it("Test 3: listVisibleGsdMessages excludes hidden messages", () => {
    // Insert a hidden message
    stmts.insertClassifiedMessage.run("test-project", "inbound", "Hidden msg", "hidden", null);

    const rows = stmts.listVisibleGsdMessages.all("test-project", 100, 0);
    const hiddenRows = rows.filter((r) => r.message_type === "hidden");
    assert.equal(hiddenRows.length, 0, "No hidden rows should be returned");
  });

  it("Test 4: listVisibleGsdMessages returns text, stage_banner, error types", () => {
    stmts.insertClassifiedMessage.run("test-project", "inbound", "An error", "error", null);
    stmts.insertClassifiedMessage.run("test-project", "outbound", "Regular text", "text", null);

    const rows = stmts.listVisibleGsdMessages.all("test-project", 100, 0);
    const types = new Set(rows.map((r) => r.message_type));

    assert.ok(types.has("stage_banner"), "Should include stage_banner");
    assert.ok(types.has("error"), "Should include error");
    assert.ok(types.has("text"), "Should include text");
    assert.ok(!types.has("hidden"), "Should not include hidden");
  });

  it("Test 5: existing insertGsdMessage still works (backward compatible, defaults to text)", () => {
    stmts.insertGsdMessage.run("compat-project", "outbound", "Hello world");

    const row = db.prepare(
      "SELECT message_type FROM gsd_messages WHERE project = 'compat-project' ORDER BY id DESC LIMIT 1"
    ).get();

    assert.equal(row.message_type, "text", "Default message_type should be 'text'");
  });
});
