---
phase: 69
name: vps-system-stats-dashboard
status: planned
created: 2026-05-07
---

# Phase 69 Context: VPS System Stats Dashboard

## Phase Boundary

Add a "Server" page to the GSD Dashboard showing live VPS metrics:
- CPU load average (1m, 5m, 15m)
- RAM used / free / total (+ swap if available)
- Disk usage per mount point
- Top 10 processes by memory usage

Expose via `/api/system` on the existing Express server. No new services.

## Implementation Decisions

### Claude's Discretion

Discuss phase skipped — goal is explicit. Implementation notes:

**Backend (`server/routes/system.js`):**
- `os.loadavg()` for CPU load averages
- `os.totalmem()` / `os.freemem()` for RAM
- Read `/proc/meminfo` for swap (VmSwapTotal, VmSwapFree) — Linux only, graceful fallback
- Run `df -h --output=target,size,used,avail,pcent` for disk usage (parse stdout)
- Run `ps aux --sort=-%mem --no-header` for top processes (parse stdout, take first 10)
- Route pattern: `server/routes/stats.js` (simple get, no DB)

**Frontend (`client/src/pages/ServerPage.tsx`):**
- Follow pattern of `UsagePage.tsx` (polling, loading state, data display)
- Auto-refresh every 30s
- 3 sections: CPU/RAM cards at top, Disk table, Processes table
- Icons: `Cpu`, `MemoryStick`, `HardDrive`, `Activity` from lucide-react
- Add "Server" nav item to `Sidebar.tsx` PRIMARY_ITEMS with `Monitor` icon
- Add `/server` route to `App.tsx`

**API shape:**
```json
{
  "cpu": {"load1": 0.5, "load5": 0.3, "load15": 0.2},
  "memory": {"total_mb": 8192, "used_mb": 4096, "free_mb": 4096, "swap_total_mb": 0, "swap_used_mb": 0},
  "disk": [{"mount": "/", "size": "40G", "used": "20G", "avail": "18G", "pct": "52%"}],
  "processes": [{"pid": "1234", "user": "claude", "cpu": "0.5", "mem": "2.1", "command": "node"}]
}
```
