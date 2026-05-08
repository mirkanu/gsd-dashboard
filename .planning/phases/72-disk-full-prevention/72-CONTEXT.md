# Phase 72 Context: Disk Full Prevention

**Phase:** 72
**Name:** Disk Full Prevention
**Date:** 2026-05-08
**Status:** Ready for planning

---

## Domain

Permanently eliminate the recurring disk-full → SQLite write failure → UI spinning wheel / 502 outage. This phase owns all log routing, disk monitoring, SQLite hygiene, and operational runbook for the VPS deployment.

---

## Decisions

### D-01: Fix named-tunnel.sh double-logging (CRITICAL — primary root cause)

**Decision:** Remove `tee -a "$LOG_FILE"` from `scripts/named-tunnel.sh`. Let PM2 be the sole log sink for gsd-tunnel stdout.

**Why:** cloudflared output currently flows to TWO places:
- `/home/services/gsddashboard/logs/gsd-tunnel.log` (via tee) — 1.2GB at incident
- `/home/claude/.pm2/logs/gsd-tunnel-out.log` (PM2 captures stdout) — another 1.2GB

Total: 2.4GB from one process. The project-local `logs/` file is the second copy and serves no purpose since PM2 already captures everything. Remove the tee, keep the log() helper for startup messages only (no piping of cloudflared stdout through it).

### D-02: Drop cloudflared to warn log level

**Decision:** Add `--loglevel warn` to the `cloudflared tunnel run` invocation in `named-tunnel.sh`.

**Why:** At `info` level, cloudflared emits continuous connection heartbeat and metrics lines. `warn` level suppresses these while preserving actionable errors. Confirmed via `cloudflared --help`: `--loglevel value` accepts `{debug, info, warn, error, fatal}`, env var `TUNNEL_LOGLEVEL`.

### D-03: Install pm2-logrotate with aggressive size cap

**Decision:** Install `pm2 install pm2-logrotate` and configure:
- `max_size`: 20M (rotate when any log file exceeds 20MB)
- `retain`: 3 (keep last 3 rotated files)
- `compress`: true (gzip rotated files)
- `dateFormat`: YYYY-MM-DD_HH-mm-ss
- `rotateInterval`: daily (cron: `0 0 * * *`)

**Why:** Even with D-01 and D-02 in place, PM2 log files will eventually grow. A 20MB cap + 3 rotations = max 60MB per process in logs. pm2-logrotate is the PM2-native solution — no separate cron or logrotate.conf needed.

### D-04: Add disk monitoring to maintenance sweep

**Decision:** Add disk usage check to the existing 2-minute maintenance sweep in `server/index.js`. Use Node.js `child_process.execSync('df -k /')` to get disk usage percentage. If usage exceeds 85%, send a Telegram alert (reuse existing Telegram alert channel). If usage exceeds 95%, log `[CRITICAL]` to console.

**Why:** The outage was silent — no warning before SQLite started failing. The maintenance sweep already runs every 2 minutes. Adding a disk check there gives early warning without a new process. Telegram is already wired for state-change alerts (Phase 42).

**Thresholds:**
- 85% → Telegram warning: "⚠️ Disk usage at X% on dashboard server"
- 95% → Telegram critical + console `[CRITICAL]`
- Check only triggers an alert once per threshold crossing (not every 2 minutes if sustained)

### D-05: SQLite WAL checkpoint in maintenance sweep

**Decision:** Add `db.pragma('wal_checkpoint(TRUNCATE)')` to the maintenance sweep, running every 10 cycles (every 20 minutes). Do NOT run VACUUM automatically — it requires exclusive lock and can be slow.

**Why:** WAL file was 4.1MB at incident (manageable). Without periodic checkpointing, WAL can grow unboundedly on a busy write workload. TRUNCATE mode checkpoints and resets the WAL file. Running every 20 minutes (not every 2 minutes) avoids I/O overhead on every cycle.

### D-06: SQLite data pruning

**Decision:** Prune `sessions`, `agents`, and `events` rows older than 90 days. Run as a separate weekly cron (not in the maintenance sweep) using the existing `server/gsd/busyMarkers-sweep.cjs` pattern (standalone CJS script called via PM2 cron or system cron). Retain all rows with `status = 'active'` regardless of age.

**Why:** DB is 59MB and growing with no upper bound. Hook events accumulate for every Claude Code session on the VPS indefinitely. 90 days retains more than enough history for usage analytics.

**Implementation:** Add `scripts/prune-old-data.js`. Add a weekly PM2 ecosystem cron entry OR a system cron in claude's crontab (`0 3 * * 0`).

### D-07: Auto-truncate project logs dir on restart

**Decision:** In `named-tunnel.sh`, on startup, truncate `logs/gsd-tunnel.log` if it exceeds 10MB (safety net in case D-01 is somehow bypassed). Keep the file for backward compatibility with anything that might tail it, but cap it.

**Why:** Belt-and-suspenders. If tee is accidentally re-added or another script writes to that path, this prevents unbounded growth.

### D-08: Disk management runbook

**Decision:** Add a `DISK-RUNBOOK.md` to `docs/` (or `.planning/`) covering: emergency free-space procedure (pm2 flush + truncate logs/), normal log rotation expectations, monitoring thresholds, and how to expand the Hetzner volume if needed.

**Why:** This outage happened because there was no documented recovery procedure. Next time (before the phase fix lands, or for future operators), there should be a clear playbook.

---

## Canonical Refs

- `scripts/named-tunnel.sh` — primary fix target (D-01, D-02, D-07)
- `server/index.js:230` — maintenance sweep where disk check and WAL checkpoint land (D-04, D-05)
- `server/db.js:35` — existing WAL/pragma setup (D-05 context)
- `server/routes/system.js` — existing disk stats endpoint (D-04 pattern reference)
- `server/gsd/busyMarkers-sweep.cjs` — pattern for standalone prune script (D-06)
- `/home/claude/.pm2/logs/` — PM2 log sink (D-03 target)
- `.planning/ROADMAP.md` — Phase 72 entry

---

## Code Context

**Existing patterns to reuse:**
- Telegram alerts: already wired in server (Phase 42) — find the send function and reuse it
- `server/routes/system.js` has `readDisk()` helper returning disk stats — reference or import it for the maintenance sweep check
- Maintenance sweep at `server/index.js:230` — add disk check and WAL checkpoint there
- `busyMarkers-sweep.cjs` — standalone script pattern for the prune job

**Constraints:**
- Do not break hook ingestion or WebSocket broadcast
- Do not run VACUUM in the maintenance sweep (exclusive lock risk)
- pm2-logrotate must survive `pm2 save` and VPS reboot — verify with `pm2 startup` is already set up (it is, per Phase 62/70)
- named-tunnel.sh change is live immediately on next PM2 restart of gsd-tunnel

---

## Deferred Ideas

- Hetzner volume resize (38GB → 80GB): valid buffer but not a fix — defer unless the above doesn't bring sustained usage below 70%
- Per-table retention policies (keep more sessions, fewer events): complexity not worth it — flat 90-day prune is sufficient
- Grafana/external monitoring: out of scope for this phase

---

## Phase Boundary

**In scope:** log routing fix, log rotation, disk alerting, WAL checkpoint, data prune script, runbook doc.
**Out of scope:** Hetzner volume resize, external monitoring systems, changing PM2 ecosystem structure.
