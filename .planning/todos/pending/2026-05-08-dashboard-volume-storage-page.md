---
created: 2026-05-08T14:00:00.000Z
title: Add Volume Storage page to GSD Dashboard
area: ui
files: []
---

## Problem

No visibility into per-project disk/Docker usage until things break. Discovered this when VPS hit 94% full: runaway PM2 tunnel logs (5.2GB), reforma-db bloat (3.2GB), and orphaned node_modules spread across projects — all invisible until manually investigated.

## Solution

Add a "Storage" page to the GSD Dashboard, populated by a daily cron job that collects:

- `docker system df -v` output (images, volumes, build cache by container)
- `du -sh` per project directory under `/home/services/` and `/data/home/`
- PM2 log sizes (`~/.pm2/logs/`)

**UI:**
- Table of projects with total disk usage, sortable
- Each row expandable (dropdown/accordion) showing top categories: DB volume, images, node_modules, logs, build cache, source code
- Trend indicator (growing / stable / shrinking vs previous day)
- Alert threshold config — flag projects over N GB

**Backend:**
- Daily cron writes snapshot to SQLite (keep last 30 days)
- `/api/storage/summary` and `/api/storage/:project` routes
- Runs as root or with sudo access to read Docker volumes

**Context from discovery session (2026-05-08):**
- LibreChat image alone is 4.6GB (worth monitoring for pulls)
- reforma-db volume 3.4GB but actual data is tiny (bloat/vacuum candidate)
- Build cache rebuilds to ~2GB after each deployment cycle
