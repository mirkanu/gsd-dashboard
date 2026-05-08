---
phase: 72-disk-full-prevention
plan: "05"
subsystem: docs
tags: [disk-full, runbook, documentation, operations]
dependency_graph:
  requires:
    - 72-01-PLAN.md
    - 72-02-PLAN.md
    - 72-03-PLAN.md
    - 72-04-PLAN.md
  provides:
    - "D-08: docs/DISK-RUNBOOK.md — operational disk management playbook"
  affects: []
tech_stack:
  added: []
  patterns: ["docs-only plan — no code changes"]
key_files:
  created:
    - docs/DISK-RUNBOOK.md
  modified: []
decisions:
  - "Documented memory-guard.log as a known gap in pm2-logrotate coverage — written by cron script not PM2 process"
  - "Emergency procedure starts with pm2 flush (fastest) before pruning (slower) — correct operator priority"
  - "Hetzner resize documented as last resort with power-off requirement noted"
metrics:
  duration: "1 min"
  completed: "2026-05-08"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
requirements_completed:
  - DISK-RUNBOOK
---

# Phase 72 Plan 05: Disk Management Runbook Summary

**One-liner:** Created docs/DISK-RUNBOOK.md covering emergency free-space procedure, PM2 log rotation table (including memory-guard.log gap), monitoring thresholds, WAL checkpoint steps, weekly prune schedule, and Hetzner volume resize as last resort.

## What Was Done

### Task 1: Write docs/DISK-RUNBOOK.md

Created `docs/DISK-RUNBOOK.md` implementing D-08 (disk management runbook):

- **Monitoring thresholds table:** 85% warning, 95% critical, ~100% emergency — with Telegram alert behavior and latch reset at 80%
- **Emergency free-space procedure:** 6 ordered steps starting with `pm2 flush` (fastest), then truncate tunnel log, `df -h /` check, manual prune, npm cache clear, dashboard restart
- **Log rotation table:** Covers all PM2-managed logs (gsd-dashboard, gsd-tunnel, 20MB/3 copies each) plus two unmanaged files
- **memory-guard.log gap documented:** Explicitly explains why pm2-logrotate does not cover this cron-written file (~3.2MB/day growth) and provides truncate command
- **Weekly data pruning section:** Documents Sunday 3am cron, log path, and manual run command
- **SQLite WAL checkpoint:** Manual checkpoint command included with context on 20-minute automatic cadence
- **Hetzner volume resize:** Step-by-step with power-off requirement and cost impact estimate
- **Top disk consumers:** Phase 72 incident snapshot for forensic reference + `du` command to find current large files

## Verification Results

All acceptance criteria passed:

| Check | Result |
|-------|--------|
| `ls docs/DISK-RUNBOOK.md` | exists |
| `grep -c 'Emergency'` | 2 (≥1 required) |
| `grep -c 'pm2 flush'` | 1 |
| `grep -c 'memory-guard'` | 2 (≥1 required) |
| `grep -c 'pm2-logrotate'` | 6 (≥2 required) |
| `grep -c 'prune-old-data'` | 4 (≥1 required) |
| `grep -c 'Hetzner'` | 4 (≥2 required) |
| `grep -c 'wal_checkpoint'` | 1 |
| `grep -c '85%'` | 2 (≥1 required) |

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write docs/DISK-RUNBOOK.md | e51385b | docs/DISK-RUNBOOK.md (created) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The runbook documents real paths, real commands, and real thresholds from the Phase 72 implementation.

## Threat Flags

None — documentation only. No new network endpoints, auth paths, or executable code introduced. T-72-10 (path disclosure in runbook) was accepted in the plan threat model — paths are already visible in PM2 config and codebase.

## Self-Check: PASSED

- `docs/DISK-RUNBOOK.md` exists: confirmed
- Commit `e51385b` exists: confirmed
- All grep acceptance criteria pass (verified above)
- No unintended file deletions in commit
