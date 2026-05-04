---
phase: quick
plan: 260504-u1i
subsystem: server-stability
tags: [testing, tmux, memory, cron, devops]
one_liner: "Fix hanging test suite via manager cleanup hooks, add tmux session persistence, and add memory/hung-process guard cron"
dependency_graph:
  requires: []
  provides: [stable-test-suite, tmux-session-persistence, memory-guard]
  affects: [package.json, server/__tests__/autopilotManager.test.js, scripts/]
tech_stack:
  added: []
  patterns: [after()-cleanup-hook, crontab-registration, bash-guard-block]
key_files:
  created:
    - scripts/tmux-save.sh
    - scripts/tmux-restore.sh
    - scripts/memory-guard.sh
  modified:
    - server/__tests__/autopilotManager.test.js
    - package.json
decisions:
  - "after() cleanup hook over per-test teardown: module-level managers[] array catches any test that forgets explicit stop()"
  - "crontab over PM2 for memory-guard: shell script has no runtime dependency on PM2 plugin; identical log path"
  - "tmux-restore appended to ~/.bashrc not /etc/profile.d: user-space, reversible, no root required"
metrics:
  duration: "~18 min"
  completed_date: "2026-05-04"
  tasks_completed: 3
  files_changed: 5
---

# Quick Task 260504-u1i: Dashboard Stability Hardening Summary

## Objective

Fix three concrete VPS stability issues: hanging test suite, lost tmux sessions on reboot, and no early-warning memory guard against OOM crashes.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | Fix autopilotManager test open-handle hang + timeout safety net | e4cb428 | autopilotManager.test.js, package.json |
| 2 | tmux session save/restore scripts + auto-save cron | 4ef52f0 | scripts/tmux-save.sh, scripts/tmux-restore.sh |
| 3 | Memory guard script + cron registration | ca747d0 | scripts/memory-guard.sh |

## What Was Done

### Task 1: Test hang fix

Root cause: `AutopilotManager` creates a `setInterval` poll loop. Any test that exits before calling `manager.stop()` leaks the handle, keeping Node alive indefinitely. Test 5 relied on internal `_halt()` for cleanup with no explicit stop.

Fixes applied:
- Added module-level `managers = []` array to `autopilotManager.test.js`
- Added `managers.push(manager)` immediately after every `new AutopilotManager(...)` (all 7 tests)
- Added `after()` hook at end of file that calls `m.stop()` on all tracked managers (idempotent)
- Added explicit `manager.stop()` at end of test 5 (belt-and-suspenders for the circuit-breaker halt test)
- Changed `package.json` `test:server` from `node --test` to `node --test --test-timeout 30000` — caps any future hung test at 30s

### Task 2: tmux session persistence

- `scripts/tmux-save.sh`: saves `sessions.list` and per-session `.windows` files to `~/.tmux-sessions/`; logs timestamp to `last-save`
- `scripts/tmux-restore.sh`: reads `sessions.list`, recreates missing sessions (idempotent — skips existing), uses first window path as start directory
- Crontab entry added: `*/15 * * * * /home/services/gsddashboard/scripts/tmux-save.sh >> /home/claude/.tmux-sessions-cron.log 2>&1`
- `~/.bashrc` guard block added: runs tmux-restore on login only when outside an existing tmux session

### Task 3: Memory guard

- `scripts/memory-guard.sh`: reads `/proc/meminfo` `MemAvailable`, logs WARNING if below 400MB, logs INFO otherwise
- Finds `node --test` processes running >10 minutes via `ps -eo pid,etimes,user,args` and kills them
- Root-owned PIDs are logged with a `sudo kill` notice rather than silently failing (T-u1i-01 compliance)
- Logs to `/home/claude/.pm2/logs/memory-guard.log` with ISO timestamps
- Crontab entry added: `*/5 * * * * /home/services/gsddashboard/scripts/memory-guard.sh 2>&1`
- Manual execution confirmed: log shows RAM status and any hung process notices

## Verification Results

1. `node --check server/__tests__/autopilotManager.test.js` — exits 0
2. `npm run test:server` — completes in ~10s (no hang), 333 pass / 8 fail (all 8 failures are pre-existing and unrelated to this task)
3. All 3 scripts pass `bash -n` syntax validation
4. `crontab -l` shows both `*/15 * * * * tmux-save.sh` and `*/5 * * * * memory-guard.sh`
5. `~/.bashrc` contains `tmux-restore` guard block
6. Manual `bash scripts/memory-guard.sh` produced timestamped log entries

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary changes introduced.

## Self-Check: PASSED

- `scripts/tmux-save.sh` — FOUND
- `scripts/tmux-restore.sh` — FOUND
- `scripts/memory-guard.sh` — FOUND
- commit e4cb428 — FOUND
- commit 4ef52f0 — FOUND
- commit ca747d0 — FOUND
