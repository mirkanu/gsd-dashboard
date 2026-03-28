# Summary 16-01: Node.js Memory Cap + Memory Watchdog

## Completed: 2026-03-28

## What was done

All 4 tasks executed as planned:

1. **NODE_OPTIONS cap** — Appended `export NODE_OPTIONS="--max-old-space-size=1024"` to `/etc/profile.d/claude-code.sh`. Every node process now starts with a 1GB heap cap (verified: V8 reports ~1216MB due to page alignment rounding).

2. **Memory watchdog script** — Created `/data/home/.local/bin/memory-watchdog.sh`. Runs every 5 minutes, reads `/proc/meminfo`, kills orphaned node processes (ppid=1) at 80% usage, force-kills the largest node process at 90%. Logs all actions to `/tmp/memory-watchdog.log`.

3. **Auto-start via .bashrc** — Appended guard block to `~/.bashrc` that starts the watchdog on SSH login if not already running, using `nohup` + `disown` to survive session disconnect.

4. **Server memory logging** — Added `process.memoryUsage()` log at the top of the existing 2-minute maintenance sweep in `server/index.js`. Shows heap used/total, RSS, and external memory in Railway logs.

## Verification

- `source /etc/profile.d/claude-code.sh && echo $NODE_OPTIONS` → `--max-old-space-size=1024`
- `node -e "console.log(require('v8').getHeapStatistics().heap_size_limit/1024/1024)"` → `1216` (correct — V8 rounds up)
- Watchdog script syntax check: `bash -n` passes
- Watchdog running and logging: `2026-03-28 10:13:31 [watchdog] Memory usage: 71%`
- Server module loads without errors
- Server tests: 98/100 pass (2 pre-existing failures in plan file resolution, unrelated)

## Files modified

- `/etc/profile.d/claude-code.sh` — added NODE_OPTIONS export
- `/data/home/.local/bin/memory-watchdog.sh` — new file (watchdog script)
- `/data/home/.bashrc` — added auto-start guard block
- `/data/home/gsddashboard/server/index.js` — added memory logging to maintenance sweep
