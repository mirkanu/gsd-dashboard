# Quick Task 15: Fix crashed services + add KidsAI card

**Date:** 2026-04-03
**Status:** Complete

## What happened
- Local dashboard server (port 4820) and ngrok tunnel were both down
- Railway was returning 502 on `/gsd` because `GSD_DATA_URL` proxy couldn't reach local machine
- Tunnel log file `/tmp/gsd-tunnel.log` was owned by root, causing ngrok to crash on startup

## What was done

### 1. Restored services
- Restarted local dashboard server
- Fixed tunnel log path from `/tmp/gsd-tunnel.log` (root-owned) to `/data/home/gsddashboard/logs/gsd-tunnel.log`
- Restarted ngrok tunnel

### 2. Added pm2 process management (prevents recurrence)
- Installed pm2 globally at `/data/home/.local/bin/pm2`
- Created `ecosystem.config.cjs` managing both `gsd-dashboard` and `gsd-tunnel`
- Both processes auto-restart on crash (max 50 restarts, with delay)
- `pm2 save` persists process list; `.profile` runs `pm2 resurrect` on login

### 3. Added KidsAI project card
- Added `KidAI` entry to `gsd-projects.json` with display name "KidsAI"

## Files changed
- `ecosystem.config.cjs` (new) — pm2 process config
- `scripts/tunnel.sh` — fixed log path
- `gsd-projects.json` — added KidAI project
- `~/.profile` — pm2 auto-resurrect on login
