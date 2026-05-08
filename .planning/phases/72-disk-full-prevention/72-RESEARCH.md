# Phase 72: Disk Full Prevention - Research

**Researched:** 2026-05-08
**Domain:** Log management, disk monitoring, SQLite WAL hygiene, PM2 log rotation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Remove `tee -a "$LOG_FILE"` from `scripts/named-tunnel.sh`. PM2 is the sole log sink for gsd-tunnel stdout.
- **D-02:** Add `--loglevel warn` to the `cloudflared tunnel run` invocation in `named-tunnel.sh`.
- **D-03:** Install `pm2 install pm2-logrotate` with: max_size=20M, retain=3, compress=true, dateFormat=YYYY-MM-DD_HH-mm-ss, rotateInterval=daily (0 0 * * *).
- **D-04:** Add disk usage check to the 2-minute maintenance sweep in `server/index.js`. Use `child_process.execSync('df -k /')` for disk %. Alert Telegram at 85%, log `[CRITICAL]` at 95%. Alert only once per threshold crossing.
- **D-05:** Add `db.pragma('wal_checkpoint(TRUNCATE)')` to maintenance sweep, running every 10 cycles (every 20 minutes). Do NOT run VACUUM.
- **D-06:** Prune `sessions`, `agents`, `events` rows older than 90 days. Retain `status = 'active'` regardless. Run as standalone weekly script (`scripts/prune-old-data.js`) via system cron (`0 3 * * 0`). Pattern from `server/gsd/busyMarkers-sweep.cjs`.
- **D-07:** On startup in `named-tunnel.sh`, truncate `logs/gsd-tunnel.log` if it exceeds 10MB (belt-and-suspenders safety net).
- **D-08:** Add `DISK-RUNBOOK.md` to `docs/`.

### Claude's Discretion

None specified — all decisions are locked.

### Deferred Ideas (OUT OF SCOPE)

- Hetzner volume resize (38GB → 80GB)
- Per-table retention policies
- Grafana/external monitoring
</user_constraints>

---

## Summary

Phase 72 addresses a confirmed disk-full incident on the 38GB Hetzner VPS where cloudflared's output was captured by both a `tee -a` in `named-tunnel.sh` and PM2's stdout capture, producing 2.4GB of log files from a single process. Combined with an ungated SQLite WAL file and no data pruning, the disk hit 100%, causing SQLite "database or disk is full" write failures. The UI showed a spinning wheel and 502 errors until emergency manual cleanup freed 2.6GB.

All eight decisions in CONTEXT.md are prescriptive and locked. This research documents the exact implementation details for each: the precise flag name and placement for cloudflared log level (`--loglevel warn` is a tunnel-level flag, not a global flag), the pm2-logrotate module configuration keys and install procedure, the exact Telegram send function to reuse (`sendNotification` in `server/gsd/telegram.js`), the correct DELETE ordering for the pruning script given the foreign key schema in `server/db.js`, and the WAL checkpoint pragma already available via the `db` object in `server/index.js`.

**Primary recommendation:** Implement D-01 and D-02 first (eliminates root cause), then D-03 (pm2-logrotate cap), then D-04/D-05 (monitoring + WAL checkpoint in maintenance sweep), then D-06 (prune script), then D-07/D-08. The ordering matters because D-01 and D-02 immediately halt disk growth while the other measures add depth.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Log routing (D-01, D-02, D-07) | Shell script (named-tunnel.sh) | PM2 | cloudflared is launched from a shell script; log routing is decided there |
| Log rotation (D-03) | PM2 module layer | — | pm2-logrotate is PM2-native; no cron or logrotate.conf needed |
| Disk monitoring (D-04) | Node.js server (maintenance sweep) | Telegram | Sweep runs every 2 min in server process; Telegram send is already wired |
| WAL checkpoint (D-05) | Node.js server (maintenance sweep) | — | Requires db object which exists in server/index.js scope |
| Data pruning (D-06) | Standalone CJS script + system cron | — | Follows busyMarkers-sweep.cjs pattern; runs outside server process for isolation |
| Runbook (D-08) | docs/ directory | — | Operator reference; lives beside other docs |

---

## Standard Stack

### Core (all already installed — no new npm dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | (existing) | SQLite WAL checkpoint pragma | Already used throughout server/db.js |
| child_process | Node.js built-in | `execSync('df -k /')` for disk % | No deps; synchronous and fast |
| pm2-logrotate | 3.0.0 | PM2 log rotation module | PM2-native; installed via `pm2 install`, not npm |
| cloudflared | 2026.3.0 | Tunnel process | Already running |

### Supporting (existing in codebase — reuse, don't rewrite)

| Component | Location | Purpose |
|-----------|---------|---------|
| `sendNotification()` | `server/gsd/telegram.js:114` | Sends Telegram messages; reuse for D-04 alerts |
| `ENABLED` (telegram) | `server/gsd/telegram.js:21` | Boolean gate — check before sending |
| `readDisk()` | `server/routes/system.js:24` | Returns disk info array — reference for df parsing pattern |
| `db.pragma()` | `server/db.js:35` (pattern) | WAL mode already set; same object for checkpoint |
| `busyMarkers-sweep.cjs` | `server/gsd/busyMarkers-sweep.cjs` | Pattern: try/catch wrapper, never exit non-zero |

**Installation (pm2-logrotate only):**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 3
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 save
```

**Version verification:** pm2-logrotate 3.0.0 is the current npm registry version. [VERIFIED: npm view pm2-logrotate version]

---

## Architecture Patterns

### System Architecture Diagram

```
cloudflared process
  → stdout (only) → PM2 stdout capture → /home/claude/.pm2/logs/gsd-tunnel-out.log
                                          ↓
                                    pm2-logrotate (rotates at 20MB, keeps 3)

named-tunnel.sh startup messages
  → log() helper → /home/services/gsddashboard/logs/gsd-tunnel.log (startup only, capped at 10MB on start)

server/index.js maintenance sweep (every 2 min)
  → cycle counter (mod 10) → WAL checkpoint every 20 min
  → df -k / → disk % → compare to lastAlertedThreshold
                      → 85%: sendNotification("disk", "warning") → Telegram
                      → 95%: console.error("[CRITICAL]") + sendNotification("disk", "critical")

scripts/prune-old-data.js (weekly, system cron 0 3 * * 0)
  → DELETE events older than 90d (excluding active sessions)
  → DELETE agents older than 90d (excluding active sessions)
  → DELETE sessions older than 90d (status != 'active')
  → Log row counts deleted → exit 0

pm2-logrotate module
  → polls every 30s
  → rotates any PM2 log file exceeding 20MB
  → keeps 3 rotated copies (gzip compressed)
  → runs daily forced rotation at midnight
```

### Recommended Project Structure (additions only)

```
scripts/
├── named-tunnel.sh     # Modified: remove tee, add --loglevel warn, add D-07 truncate
└── prune-old-data.js   # New: D-06 weekly prune script (CJS pattern)
docs/
└── DISK-RUNBOOK.md     # New: D-08 operational runbook
server/index.js         # Modified: D-04 disk check + D-05 WAL checkpoint in sweep
```

### Pattern 1: Disk % from df (for D-04)

**What:** Parse `df -k /` output to extract integer disk use percentage for threshold comparisons.

**When to use:** Inside the maintenance sweep (sync call is safe — it's a fast OS call, ~5ms).

```javascript
// Source: server/routes/system.js readDisk() pattern — adapted for single-mount integer result
const { execSync } = require('child_process');

function getDiskUsagePct() {
  try {
    const out = execSync('df -k /', { timeout: 3000 }).toString();
    // Output line 2: "Filesystem  1K-blocks  Used  Available  Use%  Mounted"
    // "Use%" column is like "93%"
    const line = out.trim().split('\n')[1];
    const pct = line && line.trim().split(/\s+/)[4];
    return pct ? parseInt(pct, 10) : null;
  } catch {
    return null;
  }
}
```

**Note:** `df -k /` is faster than `df -h` and returns integer kilobyte values — easier to parse the percentage column. The `system.js` `readDisk()` uses `df -h --output=...` which returns human-readable sizes; for threshold comparisons we need the integer percent, so parsing column 4 (0-indexed) of the raw `df -k` output is more reliable.

### Pattern 2: WAL Checkpoint in Maintenance Sweep (for D-05)

**What:** Run `TRUNCATE` mode WAL checkpoint every Nth maintenance cycle.

**When to use:** Inside the `setInterval` callback in `server/index.js`, gated by a cycle counter.

```javascript
// Source: better-sqlite3 pragma API — same pattern as db.pragma("journal_mode = WAL") in server/db.js
let maintenanceCycle = 0;
const WAL_CHECKPOINT_EVERY = 10; // every 10 cycles = every 20 minutes

setInterval(() => {
  maintenanceCycle++;

  // ... existing stale session cleanup ...

  // D-05: periodic WAL checkpoint (every 20 min)
  if (maintenanceCycle % WAL_CHECKPOINT_EVERY === 0) {
    try {
      cleanupDb.db.pragma('wal_checkpoint(TRUNCATE)');
      console.log('[maintenance] WAL checkpoint complete');
    } catch (e) {
      console.error('[maintenance] WAL checkpoint failed:', e.message);
    }
  }
}, 2 * 60 * 1000);
```

**Key:** The `db` export from `server/db.js` exports `{ db, stmts, ... }`. The maintenance sweep already requires `./db` as `cleanupDb`. Access the raw database object as `cleanupDb.db` to call `.pragma()`. [VERIFIED: server/db.js line 760 — `module.exports = { db, stmts, ... }`]

### Pattern 3: One-Time Alert State (for D-04 threshold crossing)

**What:** Track last-alerted threshold in a module-level variable so repeated disk checks don't spam Telegram.

**When to use:** Disk check inside maintenance sweep.

```javascript
// Module-level state in server/index.js (outside the setInterval)
let lastDiskAlertLevel = 0; // 0=none, 1=warning (85%), 2=critical (95%)

// Inside setInterval:
const diskPct = getDiskUsagePct();
if (diskPct !== null) {
  if (diskPct >= 95 && lastDiskAlertLevel < 2) {
    lastDiskAlertLevel = 2;
    console.error(`[CRITICAL] Disk usage at ${diskPct}% — write failures imminent`);
    sendNotification('dashboard', `[CRITICAL] Disk usage at ${diskPct}% on VPS — SQLite failures imminent. Run: pm2 flush && truncate -s 0 /home/services/gsddashboard/logs/gsd-tunnel.log`);
  } else if (diskPct >= 85 && lastDiskAlertLevel < 1) {
    lastDiskAlertLevel = 1;
    sendNotification('dashboard', `Warning: Disk usage at ${diskPct}% on VPS — approaching limit`);
  } else if (diskPct < 80) {
    lastDiskAlertLevel = 0; // reset when disk recovered
  }
}
```

**Note:** `sendNotification` from `server/gsd/telegram.js` is an async function but does not need to be awaited — fire-and-forget is fine for alerts. Import it at the top of `server/index.js` alongside the existing `require("./gsd/telegram")`.

### Pattern 4: Prune Script (for D-06)

**What:** Standalone CJS script matching `busyMarkers-sweep.cjs` pattern — try/catch wrapper, never exits non-zero, logs to stderr on failure.

**When to use:** Invoked by system cron `0 3 * * 0` (Sunday 3am).

**DELETE ordering is critical** due to foreign keys in `server/db.js`:
- `events` has FK on `session_id → sessions(id) ON DELETE CASCADE` and `agent_id → agents(id) ON DELETE SET NULL`
- `agents` has FK on `session_id → sessions(id) ON DELETE CASCADE`
- `sessions` is the parent table
- `foreign_keys = ON` is set at startup (db.js line 36)

**Correct order:** events first → agents second → sessions third. (With CASCADE, deleting a session would cascade to agents/events automatically, but explicit deletion is cleaner and avoids holding locks longer than needed.)

```javascript
#!/usr/bin/env node
'use strict';

// Phase 72: prune sessions/agents/events older than 90 days.
// Preserves status='active' sessions regardless of age.
// Run via cron: 0 3 * * 0 (Sunday 3am)
try {
  const { db } = require('../server/db');
  const CUTOFF = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Step 1: events older than 90d (only on sessions not status='active')
  const eventsDeleted = db.prepare(
    `DELETE FROM events WHERE created_at < ? AND session_id NOT IN (SELECT id FROM sessions WHERE status = 'active')`
  ).run(CUTOFF).changes;

  // Step 2: agents older than 90d (only on sessions not status='active')
  const agentsDeleted = db.prepare(
    `DELETE FROM agents WHERE started_at < ? AND session_id NOT IN (SELECT id FROM sessions WHERE status = 'active')`
  ).run(CUTOFF).changes;

  // Step 3: sessions older than 90d, not active
  const sessionsDeleted = db.prepare(
    `DELETE FROM sessions WHERE started_at < ? AND status != 'active'`
  ).run(CUTOFF).changes;

  process.stdout.write(
    `[prune-old-data] Deleted: ${eventsDeleted} events, ${agentsDeleted} agents, ${sessionsDeleted} sessions (cutoff: ${CUTOFF})\n`
  );
  process.exit(0);
} catch (e) {
  process.stderr.write(`prune-old-data: ${e && e.message ? e.message : e}\n`);
  process.exit(0); // Never exit non-zero — matches busyMarkers-sweep.cjs pattern
}
```

**Script path:** `scripts/prune-old-data.js` (not `.cjs`) — Node.js CJS `require()` works fine with `.js` extension when `package.json` has no `"type": "module"` (and this project doesn't use ESM in scripts).

### Pattern 5: named-tunnel.sh Fixes (D-01, D-02, D-07)

**Current state of `scripts/named-tunnel.sh` (line 21):**
```sh
exec cloudflared --config /home/claude/.cloudflare-tunnel/config.yml tunnel run 2>&1 | tee -a "$LOG_FILE"
```

**After D-01 + D-02 + D-07:**
```sh
#!/usr/bin/env sh
set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$ROOT/logs/gsd-tunnel.log"

mkdir -p "$ROOT/logs" 2>/dev/null || true

log() { echo "[$(date -u +%FT%TZ)] $*"; }  # stdout only — PM2 captures it

# D-07: truncate project log if it exceeds 10MB (safety net)
if [ -f "$LOG_FILE" ]; then
  size=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$size" -gt 10485760 ]; then  # 10MB in bytes
    : > "$LOG_FILE"
    log "Truncated oversized log file ($((size / 1024 / 1024))MB)"
  fi
fi

log "Starting named Cloudflare tunnel (gsd-dashboard)..."

# D-01: no tee — PM2 captures stdout as the sole log sink
# D-02: --loglevel warn suppresses heartbeat/metrics noise, preserves errors
exec cloudflared --config /home/claude/.cloudflare-tunnel/config.yml --loglevel warn tunnel run
```

**Critical flag placement:** `--loglevel warn` is a tunnel-level flag (part of `cloudflared tunnel [options]`), not a global flag. Place it after `cloudflared` but before `tunnel run`, not after `run`. Confirmed: `cloudflared tunnel --help` shows `--loglevel value` in the tunnel subcommand options. [VERIFIED: cloudflared 2026.3.0 --help output]

**Note on `2>&1`:** After removing `tee`, `2>&1` is still safe (redirects stderr to stdout so PM2 captures both channels). However, since cloudflared already writes all output to stdout by default, it can be omitted for clarity. Keeping it is harmless and ensures no stderr escapes to /dev/null.

### Anti-Patterns to Avoid

- **VACUUM in maintenance sweep:** VACUUM requires exclusive lock and can run for seconds on a 59MB DB. D-05 explicitly prohibits it. WAL checkpoint (TRUNCATE mode) is the correct tool — it resets the WAL file size without an exclusive lock on the main DB file.
- **`pm2 install pm2-logrotate` via npm:** pm2-logrotate is a PM2 module, installed via `pm2 install`, not `npm install`. The module writes config to `/home/claude/.pm2/module_conf.json`.
- **Global cloudflared --loglevel flag:** `--loglevel` is NOT a global cloudflared option. It lives under `cloudflared tunnel [options]`. Placing it after `tunnel run` (as a run-subcommand flag) is wrong — it must go before `run`.
- **Alert on every maintenance cycle:** Disk at 93% triggers the sweep every 2 minutes. Without threshold-crossing state, this sends 720+ Telegram messages per day. The `lastDiskAlertLevel` pattern prevents this.
- **Deleting sessions before events/agents:** With `foreign_keys = ON`, deleting a session cascades to events and agents. This is safe but precludes granular control. Always delete child tables first in explicit prune scripts.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Log rotation | Custom shell rotate script / logrotate.conf | pm2-logrotate | PM2-aware; rotates all PM2-managed logs; no external cron |
| Disk % parsing | Regex on `df -h` human-readable output | `df -k /` column 4 integer | Human-readable output (G/M suffixes) requires unit conversion; column 4 of `df -k` is already a plain integer percentage |
| Telegram alerts | New HTTP client / new bot | `sendNotification()` from `server/gsd/telegram.js` | Already implements ENABLED gate, truncation, error swallowing |
| WAL management | Custom WAL file scanner | `db.pragma('wal_checkpoint(TRUNCATE)')` | SQLite's built-in checkpoint; TRUNCATE mode resets WAL file to zero |
| Threshold dedup | Time-based cooldown | Simple `lastDiskAlertLevel` integer state | Cooldown still re-alerts every minute; level state only alerts on transition |

---

## Runtime State Inventory

> This is a config change phase (log routing + monitoring), not a rename/refactor phase.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no stored string references to log paths in DB | None |
| Live service config | PM2 ecosystem: gsd-tunnel currently pipes through `tee` | D-01 fix takes effect on next `pm2 restart gsd-tunnel --update-env` |
| OS-registered state | System cron (claude user) gets a new weekly entry for `prune-old-data.js` | Add via `crontab -e` in D-06 task |
| Secrets/env vars | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` already in `.env` | None — reused as-is |
| Build artifacts | None | None |

**Existing cron (claude user):** 4 entries already present — KidAI daily/monthly/notifications + tmux-save every 15min + memory-guard every 5min. The prune job adds a 5th entry.

---

## Common Pitfalls

### Pitfall 1: pm2-logrotate doesn't survive pm2 startup

**What goes wrong:** PM2 modules installed via `pm2 install` are saved in `/home/claude/.pm2/modules/`. If `pm2 save` is run without the module loaded, the dump.pm2 won't include it. On reboot, PM2 restores from dump.pm2 and the module is missing.

**Why it happens:** PM2 modules and apps are saved separately. `pm2 save` saves the app list; the module persists via `/home/claude/.pm2/module_conf.json` which is separate from `dump.pm2`.

**How to avoid:** After `pm2 install pm2-logrotate` and configuration, run `pm2 save`. The module is automatically re-loaded on `pm2 startup` restore because PM2 reads `module_conf.json` independently. [VERIFIED: /home/claude/.pm2/module_conf.json exists (currently `{}`); pm2 startup is configured via systemd for the claude user]

**Warning signs:** After VPS reboot, `pm2 list` doesn't show `pm2-logrotate` in the module list; log files grow unbounded again.

### Pitfall 2: cloudflared --loglevel flag position

**What goes wrong:** `exec cloudflared --config ... tunnel run --loglevel warn` silently ignores the flag (it's not a `run` subcommand option). The loglevel stays at `info`.

**Why it happens:** `--loglevel` belongs to the `tunnel` subcommand scope, not the `run` sub-subcommand. CLI flag parsing stops at the first unrecognized position.

**How to avoid:** Place `--loglevel warn` between `cloudflared` and `tunnel`: `exec cloudflared --config ... --loglevel warn tunnel run`. [VERIFIED: cloudflared 2026.3.0 `tunnel --help` output shows loglevel under tunnel-level flags, not run-level flags]

**Warning signs:** PM2 logs still show frequent connection heartbeat lines after restart.

### Pitfall 3: `cleanupDb.db` vs `cleanupDb` for pragma

**What goes wrong:** `cleanupDb.pragma(...)` throws `TypeError: cleanupDb.pragma is not a function` because `cleanupDb` is the full module export `{ db, stmts, ... }`, not the Database object.

**Why it happens:** `server/db.js` line 760: `module.exports = { db, stmts, DB_PATH, ... }`. The raw better-sqlite3 instance is at `cleanupDb.db`.

**How to avoid:** Use `cleanupDb.db.pragma('wal_checkpoint(TRUNCATE)')`. [VERIFIED: server/db.js line 760]

**Warning signs:** Server exits on the first WAL checkpoint cycle with an uncaughtException that propagates from the pragma call.

### Pitfall 4: Prune script path resolution

**What goes wrong:** `require('../server/db')` in `scripts/prune-old-data.js` fails because the cron runs with working directory `/` or `~`, not the project root.

**Why it happens:** System cron does not set the working directory to the script location. `__dirname` is correct; relative `require()` uses `__dirname` as base — so this is actually fine. But the cron `exec` path must be absolute.

**How to avoid:** Cron entry: `0 3 * * 0 node /home/services/gsddashboard/scripts/prune-old-data.js >> /home/claude/.pm2/logs/prune-old-data.log 2>&1`. Always use absolute paths in cron.

**Warning signs:** Cron sends email to claude user with "Cannot find module" error.

### Pitfall 5: Disk alert during normal operation (false positives)

**What goes wrong:** Disk is currently at 93% post-cleanup. The 85% alert fires on the first maintenance sweep and never clears because disk stays above 80%.

**Why it happens:** The reset threshold (80%) is below current usage (93%). Alert fires once on the first cycle and stays latched at level 1.

**How to avoid:** This is expected behavior — disk IS at 93%, the alert correctly fires once and stays latched. The alert message should include clear remediation steps. Consider phrasing: "Disk at 93% — already alerted; run prune-old-data.js or expand volume to resolve." The latch resets when usage drops below 80%.

---

## Code Examples

### Named-tunnel.sh full replacement

```sh
#!/usr/bin/env sh
# Named Cloudflare Tunnel launcher for GSD Dashboard.
# Runs the pre-configured named tunnel 'gsd-dashboard' via cloudflared.
# Supervised by PM2 (gsd-tunnel); PM2 handles restarts on crash.
# Phase 72: removed tee (D-01), added --loglevel warn (D-02), added safety truncate (D-07).

set -u
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$ROOT/logs/gsd-tunnel.log"

mkdir -p "$ROOT/logs" 2>/dev/null || true

# log() writes to stdout — PM2 captures stdout as the sole log sink (D-01: no tee)
log() { echo "[$(date -u +%FT%TZ)] $*"; }

# D-07: safety net — truncate project log file if it exceeds 10MB
if [ -f "$LOG_FILE" ]; then
  size=$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)
  if [ "$size" -gt 10485760 ]; then
    : > "$LOG_FILE"
    log "Safety truncated logs/gsd-tunnel.log (was $((size / 1024 / 1024))MB)"
  fi
fi

log "Starting named Cloudflare tunnel (gsd-dashboard)..."

# D-01: PM2 is the sole log sink — no tee pipe
# D-02: --loglevel warn suppresses heartbeat/metrics noise; flag is tunnel-level (before 'tunnel')
exec cloudflared --config /home/claude/.cloudflare-tunnel/config.yml --loglevel warn tunnel run
```

### Maintenance sweep additions (server/index.js)

```javascript
// At module level (outside setInterval, inside require.main block):
const { sendNotification, ENABLED: telegramEnabled } = require('./gsd/telegram');
// Note: telegramEnabled is already imported at line 55 as 'telegramEnabled'. Reuse that.
// sendNotification needs a new import — add to the existing destructure at line 55.

let maintenanceCycle = 0;
let lastDiskAlertLevel = 0; // 0=none, 1=warning (>=85%), 2=critical (>=95%)

// Inside setInterval callback, after existing stale session cleanup:

// D-05: WAL checkpoint every 10 cycles (every 20 minutes)
maintenanceCycle++;
if (maintenanceCycle % 10 === 0) {
  try {
    cleanupDb.db.pragma('wal_checkpoint(TRUNCATE)');
    console.log('[maintenance] WAL checkpoint complete');
  } catch (e) {
    console.error('[maintenance] WAL checkpoint failed:', e.message);
  }
}

// D-04: disk usage monitoring
try {
  const dfOut = execSync('df -k /', { timeout: 3000 }).toString();
  const dfLine = dfOut.trim().split('\n')[1];
  const diskPct = dfLine ? parseInt(dfLine.trim().split(/\s+/)[4], 10) : null;
  if (diskPct !== null) {
    if (diskPct >= 95 && lastDiskAlertLevel < 2) {
      lastDiskAlertLevel = 2;
      console.error(`[CRITICAL] Disk at ${diskPct}% — SQLite write failures imminent`);
      if (telegramEnabled) {
        sendNotification('dashboard',
          `[CRITICAL] Disk at ${diskPct}% on VPS. Immediate action: pm2 flush && truncate -s 0 /home/services/gsddashboard/logs/gsd-tunnel.log`
        );
      }
    } else if (diskPct >= 85 && lastDiskAlertLevel < 1) {
      lastDiskAlertLevel = 1;
      console.warn(`[maintenance] Disk at ${diskPct}% — warning threshold crossed`);
      if (telegramEnabled) {
        sendNotification('dashboard',
          `Warning: Disk at ${diskPct}% on VPS — approaching limit. Run prune-old-data.js if needed.`
        );
      }
    } else if (diskPct < 80 && lastDiskAlertLevel > 0) {
      lastDiskAlertLevel = 0; // reset when disk recovers
      console.log(`[maintenance] Disk at ${diskPct}% — alert cleared`);
    }
  }
} catch (e) {
  console.error('[maintenance] Disk check failed:', e.message);
}
```

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| cloudflared | D-02 loglevel flag | Yes | 2026.3.0 | — |
| PM2 | D-03 pm2-logrotate | Yes | 6.0.14 | — |
| pm2-logrotate module | D-03 | No (not installed) | 3.0.0 (npm) | None — install required |
| node (for prune script) | D-06 cron | Yes | v20.20.2 | — |
| better-sqlite3 | D-05, D-06 | Yes (in node_modules) | (existing) | — |
| TELEGRAM_BOT_TOKEN + CHAT_ID | D-04 alerts | Yes (in .env) | — | Alerts skip if ENABLED=false |
| system cron (crontab) | D-06 weekly prune | Yes | — | PM2 cron_restart (alternative) |

**Missing dependencies with no fallback:**
- pm2-logrotate: must be installed via `pm2 install pm2-logrotate`

**Missing dependencies with fallback:**
- If TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID not set: `ENABLED = false` in telegram.js, disk alerts degrade to console-only — acceptable, console logs go to PM2 and are visible in `pm2 logs`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test`) |
| Config file | none (scripts in package.json) |
| Quick run command | `npm run test:server` |
| Full suite command | `npm run test:server` |

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| D-01 | named-tunnel.sh has no `tee` pipe | manual grep | `grep -c 'tee' scripts/named-tunnel.sh` (expect 0) | N/A |
| D-02 | --loglevel warn present in tunnel invocation | manual grep | `grep 'loglevel warn' scripts/named-tunnel.sh` | N/A |
| D-03 | pm2-logrotate installed and configured | manual | `pm2 conf | grep pm2-logrotate` | N/A |
| D-04 | Disk check runs in maintenance sweep | unit | existing server test suite (maintenance sweep is in index.js) | integration only |
| D-05 | WAL checkpoint runs every 10 cycles | unit | manual or integration | N/A |
| D-06 | Prune script deletes rows older than 90d | unit | `node scripts/prune-old-data.js` (check stdout) | Wave 0 |
| D-07 | Safety truncate fires if log > 10MB | manual | create 11MB test file, run script, verify truncated | N/A |
| D-08 | DISK-RUNBOOK.md exists in docs/ | file check | `ls docs/DISK-RUNBOOK.md` | Wave 0 |

### Wave 0 Gaps

- [ ] `scripts/prune-old-data.js` — does not exist yet; D-06 creates it
- [ ] `docs/DISK-RUNBOOK.md` — does not exist yet; D-08 creates it

*(Existing server test suite at `server/__tests__/` covers existing routes; the D-04/D-05 additions to the maintenance sweep are not currently unit-tested and are verified by observation — `npm run test:server` should stay green after changes)*

---

## Security Domain

No new authentication surfaces, credentials, or user input paths are introduced. The disk monitoring reads OS-level disk stats (read-only) and fires Telegram alerts using credentials already present in `.env`. The pruning script deletes old rows from a local SQLite DB. No ASVS categories are newly applicable.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tee -a` to project log + PM2 capture | PM2-only capture | Phase 72 (D-01) | Eliminates 2x log duplication; single sink |
| cloudflared at `info` level (default) | `--loglevel warn` | Phase 72 (D-02) | Suppresses heartbeat/connection lines; errors still logged |
| No log rotation | pm2-logrotate (20MB cap, 3 kept) | Phase 72 (D-03) | Max 60MB across all PM2 logs per process |
| No disk monitoring | 2-min sweep + Telegram at 85%/95% | Phase 72 (D-04) | Early warning before SQLite failures |
| WAL grows unbounded | TRUNCATE checkpoint every 20min | Phase 72 (D-05) | WAL held near zero; ~4MB at time of incident |
| No data pruning | 90-day rolling prune, weekly | Phase 72 (D-06) | DB stabilizes at bounded size over time |

**Current disk state (post-incident):**
- Total disk: 38GB, 34GB used (93%)
- Main consumers: /data/home/psalter (2.4GB), /data/home/prc (1GB), /home/claude/.npm cache (1.1GB), /home/services/ynab (617MB), /home/services/gsddashboard (501MB)
- Log files: currently near-zero (post-flush cleanup); gsd-tunnel.log = 0 bytes; PM2 logs = 352KB total
- SQLite DB: 59MB data, 4.1MB WAL — WAL is within normal range [VERIFIED: ls output]

**Implication for D-04 alert state:** Disk is at 93% RIGHT NOW. On first deployment, the maintenance sweep will immediately fire the 85% alert (level 1) and the 95% alert (level 2). This is correct behavior — the disk IS at 93%. Alert messages should include remediation hints. The latch resets when disk drops below 80%, which won't happen until psalter/prc node_modules or npm cache are pruned (out of scope for this phase).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pm2-logrotate v3.0.0 works correctly with PM2 v6.0.14 | Standard Stack | Module may have compatibility issue; test after install and check `pm2 logs pm2-logrotate` |
| A2 | pm2-logrotate module persists across `pm2 startup` restore via `module_conf.json` | Pitfall 1 | Module missing after VPS reboot; logs grow unbounded again |
| A3 | `df -k /` column 4 (0-indexed) is the "Use%" field on this Ubuntu/Debian system | Pattern 1 | Could vary by distro/locale; add a validation assertion or use `--output=pcent` flag |

---

## Open Questions

1. **`df` output column reliability across locales**
   - What we know: `df -k /` on Ubuntu 22.04 reliably puts "Use%" in column 4 (0-indexed)
   - What's unclear: locale or mount path could shift columns
   - Recommendation: Use `df -k --output=pcent /` which outputs ONLY the percentage column (header + value) — more robust than column position parsing

2. **pm2-logrotate and memory-guard.log**
   - What we know: `memory-guard.log` is at `/home/claude/.pm2/logs/` and grows at ~133KB/hour (3.2MB/day). pm2-logrotate's `rotateModule` setting covers PM2 module logs — but memory-guard.sh is not a PM2-managed app, it's a system cron script that writes directly to `/home/claude/.pm2/logs/memory-guard.log`.
   - What's unclear: Does pm2-logrotate rotate files it doesn't "own"? Or only files from PM2-managed processes?
   - Recommendation: pm2-logrotate only rotates files created by PM2 apps (named `<appname>-out.log`, `<appname>-error.log`). `memory-guard.log` is written directly by a shell script — pm2-logrotate will NOT rotate it. At 3.2MB/day it reaches 20MB in ~6 days. Add `>> /home/claude/.pm2/logs/memory-guard.log 2>&1` with a truncation guard in `memory-guard.sh`, or redirect to a PM2-owned log. This is a MINOR issue (not P0 for this phase) but worth noting in the runbook.

3. **`df -k --output=pcent /` flag availability**
   - What we know: `--output` is a GNU coreutils extension supported on Ubuntu/Debian
   - Recommendation: Use `df -k --output=pcent /` and strip the header line — output is just `Use%\n93%`; parse `parseInt(lines[1], 10)`.

---

## Sources

### Primary (HIGH confidence)
- `server/gsd/telegram.js` — full file read; `sendNotification()` signature and ENABLED flag confirmed [VERIFIED: codebase]
- `server/db.js` — full file read; module exports `{ db, stmts, ... }`, WAL pragma at line 35, FK schema confirmed [VERIFIED: codebase]
- `server/index.js:230-260` — maintenance sweep structure; `cleanupDb` is the full `./db` module export [VERIFIED: codebase]
- `server/routes/system.js` — `readDisk()` pattern using `execSync('df -h ...')` [VERIFIED: codebase]
- `scripts/named-tunnel.sh` — current `tee -a` pattern confirmed; `exec cloudflared | tee -a "$LOG_FILE"` at line 21 [VERIFIED: codebase]
- `server/gsd/busyMarkers-sweep.cjs` — standalone script pattern; try/catch, never exit non-zero [VERIFIED: codebase]
- `cloudflared 2026.3.0 --help` — `--loglevel` is a tunnel-level flag (`cloudflared tunnel --help`), not global [VERIFIED: live binary]
- `/home/claude/.pm2/logs/` — current log file sizes confirmed (352KB total, post-cleanup) [VERIFIED: ls -lh]
- `/home/services/gsddashboard/data/dashboard.db` — 59MB DB, 4.1MB WAL [VERIFIED: ls -lh]
- Disk state: 38GB volume, 34GB used (93%), logs/gsd-tunnel.log = 0 bytes [VERIFIED: df -h, ls]
- Crontab (claude user): 4 existing entries confirmed [VERIFIED: crontab -l]

### Secondary (MEDIUM confidence)
- pm2-logrotate v3.0.0 configuration options (max_size, retain, compress, dateFormat, rotateInterval, workerInterval) [CITED: github.com/pm2-hive/pm2-logrotate README via WebFetch]
- pm2-logrotate install via `pm2 install` (not npm) [CITED: GitHub README]

### Tertiary (LOW confidence)
- pm2-logrotate persistence via `module_conf.json` across pm2 startup restores [ASSUMED — verify after install]

---

## Metadata

**Confidence breakdown:**
- Log routing fixes (D-01, D-02, D-07): HIGH — code verified in codebase, cloudflared flag verified against live binary
- pm2-logrotate (D-03): MEDIUM — configuration keys verified from GitHub README; PM2 v6 compatibility assumed
- Disk monitoring (D-04): HIGH — Telegram function verified, df parsing pattern from existing system.js
- WAL checkpoint (D-05): HIGH — db export structure verified, pragma syntax is standard better-sqlite3
- Data pruning (D-06): HIGH — FK schema verified from db.js, DELETE ordering confirmed
- Runbook (D-08): HIGH — just documentation, no technical risk

**Research date:** 2026-05-08
**Valid until:** 2026-06-08 (stable stack — cloudflared flag syntax is unlikely to change)
