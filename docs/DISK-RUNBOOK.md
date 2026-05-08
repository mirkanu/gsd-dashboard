# Disk Management Runbook

VPS: Hetzner CAX21 (ARM, 38GB disk)
Last updated: 2026-05-08 (Phase 72)

---

## Monitoring Thresholds

| Level | Threshold | Action |
|-------|-----------|--------|
| Warning | 85% | Telegram alert fires once; latch resets below 80% |
| Critical | 95% | Telegram alert + `[CRITICAL]` in PM2 logs |
| Emergency | ~100% | SQLite write failures; UI spinning wheel / 502 errors |

Disk check runs every 2 minutes inside the GSD Dashboard maintenance sweep.
Alerts are sent to the configured Telegram chat (`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` in `/home/services/.env.production`).

---

## Emergency Free-Space Procedure

Run these commands **in order** when disk is at or near 100%:

```bash
# 1. Flush all PM2 log files to zero (fastest way to free space)
pm2 flush

# 2. Truncate the tunnel log file (safety net)
truncate -s 0 /home/services/gsddashboard/logs/gsd-tunnel.log

# 3. Check how much space was freed
df -h /

# 4. If still tight, prune old database rows manually
node /home/services/gsddashboard/scripts/prune-old-data.js

# 5. If npm cache is large, clear it
npm cache clean --force   # as claude user
du -sh /home/claude/.npm  # verify reduction

# 6. Restart the dashboard to restore normal operation
cd /home/services/gsddashboard && npm run build && pm2 restart gsd-dashboard
```

---

## Normal Log Rotation

### PM2 logs (managed by pm2-logrotate)

| Path | Who writes | Rotated? | Cap |
|------|-----------|---------|-----|
| `/home/claude/.pm2/logs/gsd-dashboard-out.log` | Node.js server stdout | Yes | 20MB / 3 copies |
| `/home/claude/.pm2/logs/gsd-dashboard-error.log` | Node.js server stderr | Yes | 20MB / 3 copies |
| `/home/claude/.pm2/logs/gsd-tunnel-out.log` | cloudflared stdout (PM2 capture) | Yes | 20MB / 3 copies |
| `/home/claude/.pm2/logs/gsd-tunnel-error.log` | cloudflared stderr (PM2 capture) | Yes | 20MB / 3 copies |

**pm2-logrotate configuration:** max_size=20M, retain=3, compress=true, daily forced rotation at midnight.
View config: `pm2 conf | grep pm2-logrotate`

### Project log file (NOT managed by pm2-logrotate)

| Path | Who writes | Rotated? | Notes |
|------|-----------|---------|-------|
| `/home/services/gsddashboard/logs/gsd-tunnel.log` | named-tunnel.sh startup messages only | No (manual) | Truncated automatically on startup if > 10MB (D-07). Should stay near-zero after Phase 72. |

### Memory guard log (NOT managed by pm2-logrotate)

| Path | Who writes | Rotated? | Notes |
|------|-----------|---------|-------|
| `/home/claude/.pm2/logs/memory-guard.log` | memory-guard.sh (system cron, every 5min) | **No** | ~133KB/hour = ~3.2MB/day. Reaches 20MB in ~6 days. **Truncate manually if disk is tight:** `truncate -s 0 /home/claude/.pm2/logs/memory-guard.log` |

**Why pm2-logrotate doesn't cover memory-guard.log:** pm2-logrotate only rotates files created by PM2-managed processes. memory-guard.sh is a system cron script that writes directly to that path — pm2-logrotate does not own it.

---

## Weekly Data Pruning

A weekly cron (Sunday 3am, claude user) runs:
```bash
node /home/services/gsddashboard/scripts/prune-old-data.js
```

This deletes `events`, `agents`, and `sessions` older than 90 days, excluding `status='active'` sessions.
Log output: `/home/claude/.pm2/logs/prune-old-data.log`

To run manually:
```bash
node /home/services/gsddashboard/scripts/prune-old-data.js
```

---

## SQLite WAL File

The SQLite WAL file is automatically checkpointed (TRUNCATE mode) every 20 minutes by the GSD Dashboard maintenance sweep. Under normal operation it should stay below 5MB.

Location: `/home/services/gsddashboard/data/dashboard.db-wal`

To manually checkpoint (if WAL is growing unexpectedly):
```bash
cd /home/services/gsddashboard
node -e "const { db } = require('./server/db'); db.pragma('wal_checkpoint(TRUNCATE)'); console.log('done');"
```

---

## Hetzner Volume Resize (Last Resort)

If sustained disk usage stays above 85% after all log cleanup and pruning:

1. Log into [Hetzner Cloud Console](https://console.hetzner.cloud/)
2. Select the VPS (CAX21)
3. **Power off** the server (required for volume resize on root disk)
4. Go to Volumes → select the root volume → Resize
5. Increase from 38GB to 80GB (or larger)
6. Power the server back on
7. SSH in and resize the filesystem:
   ```bash
   sudo resize2fs /dev/sda1   # or the appropriate device
   df -h /                    # confirm new size
   ```

Cost impact: 80GB CAX21 ≈ +$4/month vs 38GB CAX21 at current Hetzner pricing.

---

## Top Disk Consumers (as of Phase 72 incident)

```
/data/home/psalter        ~2.4GB  (node_modules + data)
/home/claude/.npm         ~1.1GB  (npm cache)
/data/home/prc            ~1.0GB
/home/services/ynab       ~617MB
/home/services/gsddashboard ~501MB
/home/services/gsddashboard/data/dashboard.db  ~59MB (SQLite data)
```

To find current large files:
```bash
du -sh /home/services/* /data/home/* /home/claude/.npm 2>/dev/null | sort -rh | head -20
```
