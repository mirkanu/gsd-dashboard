---
phase: 74
plan: "01"
subsystem: backend-api
tags: [system-api, typescript, zram, disk-attribution, cron]
dependency_graph:
  requires: []
  provides: [system-api-zram, system-api-disk-attribution, system-cpu-num-cpus, cron-whitelist-extended]
  affects: [server/routes/system.js, client/src/lib/types.ts, client/src/lib/api.ts]
tech_stack:
  added: []
  patterns: [execSync-with-timeout, graceful-fallback-try-catch, per-project-disk-heuristic]
key_files:
  created: []
  modified:
    - server/routes/system.js
    - client/src/lib/types.ts
    - client/src/lib/api.ts
decisions:
  - "docker system df -v --format '{{json .}}' outputs a single JSON object (not line-delimited); parsed accordingly"
  - "gsddashboard root in gsd-projects.json points to /data/home/gsddashboard which is a symlink; du returns 0 — expected"
  - "josie dir (/data/home/josie) unavailable via du — permission issue on VPS; dir_error set gracefully"
  - "WAL checkpoint not added to CRON_WHITELIST — it runs in-process via server/index.js maintenance loop, not as a cron job"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-05-31"
  tasks_completed: 2
  files_modified: 3
---

# Phase 74 Plan 01: Backend System API Extensions Summary

Extended GET /api/system, added /api/system/zram and /api/system/disk-attribution endpoints, extended CRON_WHITELIST with tmux-save and claude-code-update, and added matching TypeScript types + api.ts methods.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Enrich GET /system + add /zram + /disk-attribution + extend CRON_WHITELIST | 737be03 | server/routes/system.js |
| 2 | Add ZramStats + DiskAttribution types; extend SystemCpuStats; add api methods | 4a54bd9 | client/src/lib/types.ts, client/src/lib/api.ts |

## What Was Built

**server/routes/system.js:**
- `GET /` now includes `num_cpus: os.cpus().length` (= 2 on this VPS) in the cpu object
- New `readZram()` helper reads `/sys/block/zram0/mm_stat`, returns `{ available, compressed_bytes, original_bytes, savings_pct }`
- New `GET /zram` endpoint — live verified: `available: true, savings_pct: 76`
- New `readDiskAttribution()` reads `gsd-projects.json`, runs `du -sb` per project root, applies docker volume size heuristic via `docker system df -v`
- New `GET /disk-attribution` endpoint — live verified: returns rows array with per-project entries plus docker-data fallback
- CRON_WHITELIST extended with `tmux-save` (*/15 * * * *) and `claude-code-update` (0 3 * * 1)
- WAL checkpoint documented as in-process comment — not exposed as cron

**client/src/lib/types.ts:**
- `SystemCpuStats` extended with `num_cpus: number`
- New `ZramStats` interface: `{ available: boolean; compressed_bytes: number; original_bytes: number; savings_pct: number }`
- New `DiskAttributionRow` and `DiskAttribution` interfaces

**client/src/lib/api.ts:**
- `ZramStats` and `DiskAttribution` added to imports
- `api.system.zram()` added: `request<ZramStats>("/system/zram")`
- `api.system.diskAttribution()` added: `request<DiskAttribution>("/system/disk-attribution")`

## Live Verification Results

```
GET /api/system           → "num_cpus": 2  ✓
GET /api/system/zram      → available: true, savings_pct: 76  ✓
GET /api/system/disk-attribution → rows array with project entries  ✓
GET /api/system/cron-status     → tmux-save and claude-code-update present  ✓
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all endpoints return live data.

## Threat Flags

No new security surface beyond what the plan's threat model covers (T-74-01 path validation implemented; T-74-02 accepted; T-74-03 timeout mitigations in place).

## Self-Check: PASSED

- [x] server/routes/system.js modified with all 4 changes
- [x] client/src/lib/types.ts contains ZramStats, DiskAttributionRow, DiskAttribution, num_cpus
- [x] client/src/lib/api.ts contains zram() and diskAttribution() methods
- [x] Commits 737be03 and 4a54bd9 exist
- [x] Live server responds correctly to all new endpoints
