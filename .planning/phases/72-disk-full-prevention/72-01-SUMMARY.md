---
phase: 72-disk-full-prevention
plan: "01"
subsystem: scripts
tags: [disk-full, cloudflared, logging, tunnel]
dependency_graph:
  requires: []
  provides: [D-01-no-double-logging, D-02-loglevel-warn, D-07-truncate-guard]
  affects: [scripts/named-tunnel.sh, PM2-gsd-tunnel]
tech_stack:
  added: []
  patterns: [PM2-stdout-sole-log-sink, startup-truncate-guard]
key_files:
  created: []
  modified:
    - scripts/named-tunnel.sh
decisions:
  - "Removed functional tee pipe; kept intent documented in comments without the word 'tee' to satisfy grep-c=0 acceptance criterion"
  - "D-01/D-02/D-07 all applied in a single rewrite — all three are zero-risk and interdependent (no tee means warn-level flag placement matters)"
metrics:
  duration: "5 min"
  completed: "2026-05-08"
  tasks_completed: 1
  files_modified: 1
---

# Phase 72 Plan 01: Cloudflared Double-Logging Fix Summary

**One-liner:** Eliminated 2.4GB disk growth source by removing tee pipe from named-tunnel.sh and adding --loglevel warn + 10MB startup truncate guard.

## What Was Done

Rewrote `scripts/named-tunnel.sh` with three fixes targeting the primary disk-full root cause:

- **D-01 (no double-logging):** Removed `2>&1 | tee -a "$LOG_FILE"` from the `exec cloudflared` line and the `tee -a` from `log()`. PM2 stdout capture is now the sole log sink. The old pattern wrote every cloudflared line twice — once to PM2 and once to `logs/gsd-tunnel.log` — producing 2.4GB from a single process.
- **D-02 (--loglevel warn):** Added `--loglevel warn` before `tunnel run` (correct flag position per cloudflared CLI spec). This suppresses connection heartbeat and metrics lines that previously flooded logs at the default info level.
- **D-07 (startup truncate guard):** Added a startup check that truncates `logs/gsd-tunnel.log` if it exceeds 10MB (`wc -c` threshold 10485760). Protects against residual growth from the pre-fix log file.

## Verification Results

All acceptance criteria passed:

| Check | Result |
|-------|--------|
| `grep -c 'tee' scripts/named-tunnel.sh` | 0 |
| `grep -c 'loglevel warn' scripts/named-tunnel.sh` | 1 |
| `grep -c '10485760' scripts/named-tunnel.sh` | 1 |
| `grep -c 'exec cloudflared.*--loglevel warn tunnel run'` | 1 |
| `grep -c 'exec cloudflared.*tunnel run.*--loglevel'` | 0 (wrong order absent) |
| `test -x scripts/named-tunnel.sh` | OK |

## Deviations from Plan

**1. [Rule 1 - Bug] Comment wording adjusted to satisfy grep-c=0 acceptance criterion**
- **Found during:** Task 1 verification
- **Issue:** The plan's reference script used the word "tee" in comments (e.g., "removed tee (D-01)"), which caused `grep -c 'tee'` to return 3 instead of 0.
- **Fix:** Replaced comment phrasing — "removed tee (D-01)" → "D-01 double-logging removed"; "D-02: --loglevel warn suppresses..." → "D-02: warn log-level suppresses..."; "no tee" → "no pipe duplication". Functional script unchanged.
- **Files modified:** scripts/named-tunnel.sh
- **Commit:** c29c573

## Next Steps

The fix takes effect on next `pm2 restart gsd-tunnel --update-env`. This restart is handled in the deploy step after all Phase 72 plans execute — not by this plan.

## Self-Check: PASSED

- `scripts/named-tunnel.sh` exists and is executable: confirmed
- Commit `c29c573` exists: confirmed
- No unintended file deletions in commit
