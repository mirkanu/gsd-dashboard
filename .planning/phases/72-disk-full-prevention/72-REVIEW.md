---
phase: 72-disk-full-prevention
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - scripts/named-tunnel.sh
  - server/index.js
  - scripts/prune-old-data.js
  - docs/DISK-RUNBOOK.md
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 72: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the four Phase 72 disk-full prevention artifacts: the tunnel launcher shell script, the server maintenance sweep (disk monitor + WAL checkpoint), the weekly prune script, and the operations runbook. The implementation is broadly sound — the disk alert hysteresis, WAL checkpoint, truncation guard, and prune logic all work correctly. No critical security or data-loss bugs were found.

Three warnings were identified: a missing transaction in `prune-old-data.js` that allows partial deletion state on crash, an inaccurate runbook claim about the prune script's log destination, and the `gsd-projects.json` reader inside `startServer` lacking a try/catch that could cause a PM2-level restart loop on config corruption. Two info-level items round out the findings.

---

## Warnings

### WR-01: prune-old-data.js runs three DELETE statements without a wrapping transaction

**File:** `scripts/prune-old-data.js:15-31`
**Issue:** Events, agents, and sessions are deleted in three separate statements with no enclosing `BEGIN`/`COMMIT`. If the Node process is killed between statement 1 and statement 3 (e.g., OOM, SIGKILL), the database is left in a partially pruned state: events deleted, sessions still present with no events, or agents deleted with sessions intact. While not a corruption risk for SQLite (WAL guarantees each statement is atomic), repeated partial runs could leave the session table large while events and agents shrink, defeating the pruning intent.
**Fix:**
```js
// Wrap all three DELETEs in a single transaction
const pruneAll = db.transaction((cutoff) => {
  const eventsDeleted = db.prepare(
    `DELETE FROM events
     WHERE created_at < ?
       AND session_id NOT IN (SELECT id FROM sessions WHERE status = 'active')`
  ).run(cutoff).changes;

  const agentsDeleted = db.prepare(
    `DELETE FROM agents
     WHERE started_at < ?
       AND session_id NOT IN (SELECT id FROM sessions WHERE status = 'active')`
  ).run(cutoff).changes;

  const sessionsDeleted = db.prepare(
    `DELETE FROM sessions WHERE started_at < ? AND status != 'active'`
  ).run(cutoff).changes;

  return { eventsDeleted, agentsDeleted, sessionsDeleted };
});

const { eventsDeleted, agentsDeleted, sessionsDeleted } = pruneAll(CUTOFF);
```

---

### WR-02: Runbook states prune output goes to prune-old-data.log but cron command has no redirection

**File:** `docs/DISK-RUNBOOK.md:86`
**Issue:** Line 86 states "Log output: `/home/claude/.pm2/logs/prune-old-data.log`". However, the cron entry as documented runs `node /home/services/gsddashboard/scripts/prune-old-data.js` with no stdout redirection. Without `>> /home/claude/.pm2/logs/prune-old-data.log 2>&1`, output goes to the cron daemon's mail queue (or is silently dropped). The runbook describes a log file that will not exist unless the cron entry was installed with explicit redirection.

**Fix:** Either update the runbook to show the actual cron entry with redirection, or confirm the installed crontab includes it. The cron line should read:
```
0 3 * * 0 node /home/services/gsddashboard/scripts/prune-old-data.js >> /home/claude/.pm2/logs/prune-old-data.log 2>&1
```
Then update the runbook to display this exact line so operators can verify it matches the installed crontab.

---

### WR-03: loadProjectsLocal in startServer has no try/catch — corrupt config causes restart loop

**File:** `server/index.js:161-165`
**Issue:** The `loadProjectsLocal` closure calls `JSON.parse(fs.readFileSync(configPath, "utf8"))` without a try/catch. If `gsd-projects.json` is missing, empty, or malformed, this throws synchronously inside the `startStateBroadcaster` polling callback. The uncaught exception handler (line 20-23) calls `process.exit(1)`, and PM2 immediately restarts — then crashes again on the next poll cycle. This creates a rapid restart loop that fills PM2 error logs and contributes to disk pressure, which is counterproductive for Phase 72's disk-safety goals.
**Fix:**
```js
const loadProjectsLocal = () => {
  const configPath = process.env.GSD_PROJECTS_PATH || path.resolve(__dirname, "../gsd-projects.json");
  const fs = require("fs");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (e) {
    console.error(`[stateBroadcaster] Failed to load projects config: ${e.message}`);
    return []; // return empty list — broadcaster skips this cycle gracefully
  }
};
```

---

## Info

### IN-01: Disk alert hysteresis resets to 0 from level 2 (critical) without a Telegram "resolved" notification

**File:** `server/index.js:297-299`
**Issue:** When disk usage drops below 80% after a critical (level 2) alert, `lastDiskAlertLevel` resets to 0 and only a `console.log` is written. No Telegram notification is sent on recovery. If the operator acted on the critical alert via Telegram and resolved it, they receive no confirmation. This is not a bug, but a gap in the alerting flow.
**Fix:** Add a Telegram notification on reset:
```js
} else if (diskPct < 80 && lastDiskAlertLevel > 0) {
  const wasLevel = lastDiskAlertLevel;
  lastDiskAlertLevel = 0;
  console.log(`[maintenance] Disk at ${diskPct}% — disk alert cleared`);
  if (telegramEnabled && wasLevel > 0) {
    sendNotification('dashboard', `Disk usage recovered to ${diskPct}% — alert cleared.`);
  }
}
```

---

### IN-02: named-tunnel.sh does not set set -e — subcommand failures continue silently

**File:** `scripts/named-tunnel.sh:7`
**Issue:** Only `set -u` is set. If `cloudflared` is not installed or the config path is wrong, `exec cloudflared ...` fails with a non-zero exit but the shell script has no explicit error handling before the `exec`. This is partially mitigated by PM2 detecting the exit and restarting, but there is no logged diagnostic at the shell level (the `log()` function on line 15 would not fire after `exec` fails, since `exec` replaces the process). This means failed tunnel starts produce no startup message in the project log file.

This is low risk given PM2 supervision, but adding `set -e` before the non-critical early commands (and removing the `|| true` on `mkdir -p`) or adding an explicit check before `exec` would improve diagnosability.

**Fix (minimal):**
```sh
# Before exec on line 30, add a guard:
if ! command -v cloudflared >/dev/null 2>&1; then
  log "ERROR: cloudflared not found in PATH — cannot start tunnel"
  exit 1
fi
exec cloudflared ...
```

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
