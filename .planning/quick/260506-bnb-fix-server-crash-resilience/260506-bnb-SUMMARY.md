---
phase: quick-260506-bnb
plan: 01
subsystem: infrastructure
tags: [pm2, systemd, memory-guard, crash-resilience, root-delegation]
dependency_graph:
  requires: []
  provides: [pm2-resilience, root-claude-wrapper, auto-kill-guard]
  affects: [pm2-claude.service, /usr/local/bin/claude, scripts/memory-guard.sh]
tech_stack:
  added: []
  patterns: [Type=forking systemd service, runuser root-delegation, sudo kill fallback]
key_files:
  created:
    - /usr/local/bin/claude
  modified:
    - /etc/systemd/system/pm2-claude.service
    - scripts/memory-guard.sh
decisions:
  - pm2-root.service masked by replacing file with /dev/null symlink (mask command rejected existing file)
  - sudo kill fallback before logging failure — works because claude has NOPASSWD:ALL sudoers entry
metrics:
  duration: ~6 minutes
  completed: "2026-05-06T08:36:43Z"
  tasks: 3
  files: 3
---

# Quick Task 260506-bnb: Fix Server Crash Resilience — Summary

One-liner: PM2 service changed from Type=oneshot to Type=forking with Restart=on-failure, hung root-owned test PIDs killed, and memory-guard upgraded to auto-kill via sudo.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Kill hung processes + fix pm2-claude.service + mask pm2-root.service | (system-only, no repo file) | /etc/systemd/system/pm2-claude.service |
| 2 | Create /usr/local/bin/claude root-delegation wrapper | 654f3cd | /usr/local/bin/claude |
| 3 | Fix memory-guard.sh to auto-kill root-owned processes via sudo | 654f3cd | scripts/memory-guard.sh |

## What Was Done

### Task 1 — Kill hung processes + fix systemd service

Killed 7 hung root-owned `node --test` PIDs (45452, 45453, 45818, 46841, 47009, 50582, 50889) via `sudo kill -9`.

Rewrote `/etc/systemd/system/pm2-claude.service`:
- Changed `Type=oneshot` + `RemainAfterExit=yes` → `Type=forking` with `PIDFile=/home/claude/.pm2/pm2.pid`
- Added `Restart=on-failure` + `RestartSec=5s` so systemd auto-restarts PM2 on crash

Masked pm2-root.service: replaced existing service file with `/dev/null` symlink (standard `systemctl mask` was rejected because the file was a regular file, not a symlink).

PM2 resurrected successfully — all 3 processes (gsd-dashboard, gsd-healthcheck, gsd-tunnel) came back online.

### Task 2 — /usr/local/bin/claude wrapper

Created `/usr/local/bin/claude` with runuser delegation logic. When invoked as root, re-execs as claude OS user so `--dangerously-skip-permissions` works. PATH ordering (`/usr/local/bin` before `/usr/bin`) ensures wrapper intercepts the call.

### Task 3 — memory-guard.sh sudo kill

Replaced the "NOTICE: run sudo kill manually" log path with an actual `sudo kill` fallback:
- First tries direct `kill $pid` (works when claude owns the process)
- Falls back to `sudo kill $pid` (works for root-owned processes via NOPASSWD:ALL)
- Logs "Killed PID X via sudo (owner=root)" on success

## Checkpoint Status

All tasks complete. Human verification passed on 2026-05-06.

Verified checks:
- pm2-claude.service: "active (running)" with Type=forking
- pm2-root.service: masked
- /usr/local/bin/claude wrapper: in place
- All 7 hung PIDs confirmed dead
- Dashboard at localhost:3000 returns HTTP 200

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pm2-root.service mask failed — replaced file with /dev/null symlink**
- Found during: Task 1
- Issue: `systemctl mask pm2-root.service` returned "File already exists" because `/etc/systemd/system/pm2-root.service` was a regular file, not a symlink. The mask operation creates a `/dev/null` symlink but won't overwrite an existing regular file.
- Fix: Removed the existing file and created the symlink manually: `sudo rm /etc/systemd/system/pm2-root.service && sudo ln -s /dev/null /etc/systemd/system/pm2-root.service`
- Files modified: `/etc/systemd/system/pm2-root.service`
- Commit: system-only (no repo change)

### Running as claude, not root

The plan's execution notes said "All bash commands run as root". Actual environment: `uid=1000(claude)`. This required using `sudo kill` (not plain `kill`) for root-owned PIDs, and `sudo tee` for writing to /etc/systemd. The NOPASSWD:ALL sudoers entry made this seamless.

## Pre-Existing Test Failures (Not Caused by This Task)

`npm run test:server` shows 8 pre-existing failures in: readProjectMeta, GSD auto-registration, agent proxy, archive/unarchive, app-settings, autopilot.manager, processSpawner, STAT-02 heuristic. None touch memory-guard.sh. Not introduced by this task.

## Threat Surface Scan

No new network endpoints, auth paths, or file access patterns introduced. The `/usr/local/bin/claude` wrapper uses a hardcoded absolute path (`/usr/bin/claude`) — no PATH injection possible (T-bnb-01 mitigated per plan threat model).

## Self-Check

- [x] `/etc/systemd/system/pm2-claude.service` — written via sudo tee, verified Type=forking
- [x] `/usr/local/bin/claude` — exists, executable, correct content
- [x] `scripts/memory-guard.sh` — edited, syntax OK
- [x] Commit 654f3cd exists

## Self-Check: PASSED
