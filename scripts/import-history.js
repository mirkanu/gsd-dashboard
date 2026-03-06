#!/usr/bin/env node

/**
 * Import legacy Claude Code sessions from ~/.claude/ into the Agent Dashboard.
 * Reads per-project JSONL session files to populate sessions, agents, and
 * token usage that existed before the dashboard was installed.
 *
 * Can be run standalone: node scripts/import-history.js [--dry-run] [--project <name>]
 * Also exported for auto-import on server startup.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const CLAUDE_DIR = path.join(process.env.HOME || process.env.USERPROFILE, ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

/**
 * Parse a single JSONL session file to extract session metadata.
 */
async function parseSessionFile(filePath) {
  const sessionId = path.basename(filePath, ".jsonl");

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let cwd = null;
  let model = null;
  let version = null;
  let slug = null;
  let gitBranch = null;
  let firstTimestamp = null;
  let lastTimestamp = null;
  const teams = new Set();
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (!cwd && entry.cwd) cwd = entry.cwd;
    if (!slug && entry.slug) slug = entry.slug;
    if (!gitBranch && entry.gitBranch) gitBranch = entry.gitBranch;
    if (!version && entry.version) version = entry.version;

    const ts = entry.timestamp;
    if (ts) {
      const isoTs = typeof ts === "number" ? new Date(ts).toISOString() : ts;
      if (!firstTimestamp || isoTs < firstTimestamp) firstTimestamp = isoTs;
      if (!lastTimestamp || isoTs > lastTimestamp) lastTimestamp = isoTs;
    }

    if (entry.teamName) teams.add(entry.teamName);

    if (entry.type === "user") userMessageCount++;
    if (entry.type === "assistant") {
      assistantMessageCount++;
      const msg = entry.message || {};
      if (!model && msg.model) model = msg.model;
      const usage = msg.usage || {};
      totalInputTokens += usage.input_tokens || 0;
      totalOutputTokens += usage.output_tokens || 0;
      totalCacheRead += usage.cache_read_input_tokens || 0;
      totalCacheWrite += usage.cache_creation_input_tokens || 0;
    }
  }

  if (!firstTimestamp) return null;

  const projectName = cwd ? path.basename(cwd) : slug || `Session ${sessionId.slice(0, 8)}`;
  const sessionName = slug
    ? `${projectName} (${slug})`
    : `${projectName} - ${sessionId.slice(0, 8)}`;

  return {
    sessionId,
    name: sessionName,
    cwd,
    model,
    version,
    slug,
    gitBranch,
    startedAt: firstTimestamp,
    endedAt: lastTimestamp,
    teams: [...teams],
    userMessages: userMessageCount,
    assistantMessages: assistantMessageCount,
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      cacheRead: totalCacheRead,
      cacheWrite: totalCacheWrite,
    },
  };
}

/**
 * Import a parsed session into the database.
 */
function importSession(dbModule, session) {
  const { db, stmts } = dbModule;
  const existing = stmts.getSession.get(session.sessionId);
  if (existing) {
    // Backfill events for previously imported sessions that have none
    const eventCount = db
      .prepare("SELECT COUNT(*) as c FROM events WHERE session_id = ? AND data LIKE '%imported%'")
      .get(session.sessionId);
    if (eventCount.c === 0) {
      const meta = existing.metadata ? JSON.parse(existing.metadata) : {};
      if (meta.imported) {
        const mainAgentId = `${session.sessionId}-main`;
        const insertEvent = db.prepare(
          "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
        );
        insertEvent.run(
          session.sessionId,
          mainAgentId,
          "Stop",
          null,
          `Session: ${session.name} (${session.userMessages} user / ${session.assistantMessages} assistant msgs)`,
          JSON.stringify({ imported: true }),
          session.startedAt
        );
        return { skipped: false, backfilled: true };
      }
    }
    return { skipped: true };
  }

  const metadata = JSON.stringify({
    version: session.version,
    slug: session.slug,
    git_branch: session.gitBranch,
    user_messages: session.userMessages,
    assistant_messages: session.assistantMessages,
    imported: true,
  });

  stmts.insertSession.run(
    session.sessionId,
    session.name,
    "completed",
    session.cwd,
    session.model,
    metadata
  );

  db.prepare("UPDATE sessions SET started_at = ?, ended_at = ? WHERE id = ?").run(
    session.startedAt,
    session.endedAt,
    session.sessionId
  );

  const mainAgentId = `${session.sessionId}-main`;
  stmts.insertAgent.run(
    mainAgentId,
    session.sessionId,
    "Main Agent",
    "main",
    null,
    "completed",
    null,
    null,
    null
  );
  db.prepare("UPDATE agents SET started_at = ?, ended_at = ? WHERE id = ?").run(
    session.startedAt,
    session.endedAt,
    mainAgentId
  );

  for (const teamName of session.teams) {
    const subId = `${session.sessionId}-team-${teamName}`;
    stmts.insertAgent.run(
      subId,
      session.sessionId,
      teamName,
      "subagent",
      "team",
      "completed",
      null,
      mainAgentId,
      null
    );
    db.prepare("UPDATE agents SET started_at = ?, ended_at = ? WHERE id = ?").run(
      session.startedAt,
      session.endedAt,
      subId
    );
  }

  // Create a synthetic event so the activity heatmap reflects historical data
  const insertEvent = db.prepare(
    "INSERT INTO events (session_id, agent_id, event_type, tool_name, summary, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  insertEvent.run(
    session.sessionId,
    mainAgentId,
    "Stop",
    null,
    `Session: ${session.name} (${session.userMessages} user / ${session.assistantMessages} assistant msgs)`,
    JSON.stringify({ imported: true }),
    session.startedAt
  );
  if (session.endedAt && session.endedAt !== session.startedAt) {
    insertEvent.run(
      session.sessionId,
      mainAgentId,
      "Stop",
      null,
      `Session ended: ${session.name}`,
      JSON.stringify({ imported: true }),
      session.endedAt
    );
  }

  if (session.tokens.input > 0 || session.tokens.output > 0) {
    stmts.upsertTokenUsage.run(
      session.sessionId,
      session.tokens.input,
      session.tokens.output,
      session.tokens.cacheRead,
      session.tokens.cacheWrite
    );
  }

  return { skipped: false };
}

/**
 * Auto-import all legacy sessions. Called from server startup.
 * Returns { imported, skipped, errors } counts.
 * Designed to be fast on repeat runs (skips existing sessions).
 */
async function importAllSessions(dbModule) {
  if (!fs.existsSync(PROJECTS_DIR)) return { imported: 0, skipped: 0, errors: 0 };

  const projectDirs = fs
    .readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  const importBatch = dbModule.db.transaction((sessions) => {
    for (const session of sessions) {
      const result = importSession(dbModule, session);
      if (result.skipped) skipped++;
      else imported++;
    }
  });

  for (const projDir of projectDirs) {
    const projPath = path.join(PROJECTS_DIR, projDir);
    const files = fs.readdirSync(projPath).filter((f) => f.endsWith(".jsonl"));
    if (files.length === 0) continue;

    const batch = [];
    for (const file of files) {
      try {
        const session = await parseSessionFile(path.join(projPath, file));
        if (session) batch.push(session);
        else skipped++;
      } catch {
        errors++;
      }
    }

    if (batch.length > 0) importBatch(batch);
  }

  return { imported, skipped, errors };
}

// CLI entrypoint
if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  const projectIdx = process.argv.indexOf("--project");
  const projectFilter = projectIdx !== -1 ? process.argv[projectIdx + 1] : null;

  (async () => {
    console.log("Claude Code Session Importer");
    console.log("============================");
    if (dryRun) console.log("DRY RUN - no data will be written\n");
    if (projectFilter) console.log(`Filtering to project: ${projectFilter}\n`);

    if (!fs.existsSync(PROJECTS_DIR)) {
      console.error(`Projects directory not found: ${PROJECTS_DIR}`);
      process.exit(1);
    }

    if (dryRun) {
      const projectDirs = fs
        .readdirSync(PROJECTS_DIR, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);

      let total = 0;
      for (const projDir of projectDirs) {
        if (projectFilter && !projDir.includes(projectFilter)) continue;
        const projPath = path.join(PROJECTS_DIR, projDir);
        const files = fs.readdirSync(projPath).filter((f) => f.endsWith(".jsonl"));
        if (files.length === 0) continue;

        const label = projDir.replace(/^C--/, "").replace(/-/g, "/");
        console.log(`\nProject: ${label} (${files.length} sessions)`);

        for (const file of files) {
          total++;
          try {
            const session = await parseSessionFile(path.join(projPath, file));
            if (!session) {
              console.log(`  SKIP ${file} (empty)`);
              continue;
            }
            console.log(
              `  ${session.sessionId.slice(0, 12)}... | ${session.name.slice(0, 40).padEnd(40)} | msgs: ${session.userMessages}/${session.assistantMessages} | teams: ${session.teams.length} | tokens: ${session.tokens.input + session.tokens.output}`
            );
          } catch (err) {
            console.error(`  ERROR ${file}: ${err.message}`);
          }
        }
      }
      console.log(`\nTotal: ${total} session files`);
    } else {
      const dbModule = require("../server/db");
      const result = await importAllSessions(dbModule);
      console.log(`Imported: ${result.imported}`);
      console.log(`Skipped: ${result.skipped}`);
      if (result.errors > 0) console.log(`Errors: ${result.errors}`);
    }
    console.log("Done.");
  })().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}

module.exports = { importAllSessions };
