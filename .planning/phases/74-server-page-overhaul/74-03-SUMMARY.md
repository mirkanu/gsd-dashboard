---
phase: 74
plan: "03"
subsystem: server-page
tags: [ui, maintenance, cron, schedule, disk, async]
dependency_graph:
  requires: [74-01, 74-02]
  provides: [SRV-04, SRV-05]
  affects: [client/src/pages/ServerPage.tsx, server/routes/system.js]
tech_stack:
  added: []
  patterns: [inline-monospace-text, async-du-cache]
key_files:
  created: []
  modified:
    - client/src/pages/ServerPage.tsx
    - server/routes/system.js
decisions:
  - "Schedule display changed from pill badge to inline monospace text per UI-SPEC"
  - "Disk attribution backend switched to async du with 60s cache and /home/services/* paths to avoid tmux freeze on page load"
metrics:
  duration: "~20min (task 1) + async disk fix (separate commit)"
  completed_date: "2026-05-31"
  tasks_completed: 2
  files_modified: 2
---

# Phase 74 Plan 03: Maintenance Schedule Inline Display + Disk Backend Fix Summary

Switched the Maintenance section schedule from a pill badge to inline monospace text (`Schedule: {cron_expression}`) per UI-SPEC, deployed to production, and ran Playwright visual regression. A blocking page-load issue caused by synchronous `du` execution was fixed via async background scan with 60s cache.

## What Was Built

### Task 1: Inline Schedule Display (commit 09cf2d2)

Updated `client/src/pages/ServerPage.tsx` — the per-job schedule span changed from:
```tsx
<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground shrink-0">
  {job.schedule}
</span>
```
to:
```tsx
<span className="text-xs text-muted-foreground font-mono shrink-0">
  Schedule: {job.schedule}
</span>
```

### Task 2: Checkpoint (human-verify — approved)

All Phase 74 visual changes deployed and approved:
- CPU card: Avg%/Max% per window
- RAM bar: bg-indigo-500 visible in dark mode
- Top Processes: CPU/RAM sort toggle
- Maintenance: 5 cron jobs (docker-prune, prune-old-data, memory-guard, tmux-save, claude-code-update) with inline schedule text

### Out-of-band Fix: Disk Attribution Backend (commit 3bf7f76)

The `/server` page was hanging on load because `server/routes/system.js` ran synchronous `du` on Docker overlay paths, which froze the event loop and tmux. Fixed by:
- Switching to `/home/services/*` project paths (correct data source)
- Making `du` async with background refresh and 60s cache
- Disk attribution now shows correct sizes (ynab ~577M, gsddashboard ~504M, debates ~458M)

## Key Files

| File | Change |
|------|--------|
| `client/src/pages/ServerPage.tsx` | Schedule badge → inline monospace text |
| `server/routes/system.js` | Async du, correct paths, 60s cache |

## Verification

- TypeScript check: passed (`npx tsc --project client/tsconfig.json --noEmit`)
- All 5 cron jobs visible in Maintenance section
- Schedule shows as "Schedule: 0 3 * * *" inline pattern
- Disk attribution: correct project sizes from /home/services paths
- Human checkpoint: APPROVED

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Disk attribution backend used wrong paths causing synchronous freeze**
- **Found during:** Task 2 checkpoint (separate commit 3bf7f76, applied by human reviewer)
- **Issue:** `du` was running synchronously on Docker overlay paths, blocking the event loop and causing page load to stall/freeze tmux
- **Fix:** Switched to `/home/services/*` paths, made `du` async with background scan and 60s cache
- **Files modified:** `server/routes/system.js`
- **Commit:** 3bf7f76

## Self-Check: PASSED

- `client/src/pages/ServerPage.tsx` modified in commit 09cf2d2 — FOUND
- `server/routes/system.js` modified in commit 3bf7f76 — FOUND
- Task 1 commit 09cf2d2 exists in git log — VERIFIED
