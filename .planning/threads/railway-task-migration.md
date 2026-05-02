---
slug: railway-task-migration
title: Migrate project_tasks from Railway SQLite to Hetzner VPS
status: open
created: 2026-05-02
updated: 2026-05-02
---

# Thread: Migrate project_tasks from Railway SQLite to Hetzner VPS

## Goal

Import all project_tasks (open + archived) from Railway's own SQLite into the VPS dashboard.db at `/data/home/gsddashboard/data/dashboard.db`.

## Context

- **Railway app:** https://gsd-dashboard-production.up.railway.app
- **VPS DB:** `/data/home/gsddashboard/data/dashboard.db` — `project_tasks` table
- VPS currently has 93 tasks (IDs 1–93, gap at ID 2) for projects: KidAI, debates, gsddashboard, reforma, ynab
- Projects with **zero tasks** on VPS: josie, prc, gsdTelegram (archived), zoho-todoist-sync
- Railway's GSD_DATA_URL proxies task API calls to VPS — so Railway's own SQLite has the ORIGINAL pre-migration tasks

### Cloudflare Tunnel fix (done 2026-05-01)
Named tunnel `gsdlabs-production` (ID `093489ad-5644-4b42-a6c6-32c45c244fed`) was restored:
- `scripts/named-tunnel.sh` reads `CF_TUNNEL_TOKEN` from `.env` and runs `cloudflared tunnel run --token`
- `ecosystem.config.cjs` updated to use new script
- `dashboard.gsdlabs.dev` is live again

## How to Extract Railway Tasks

Railway's SQLite is on the ephemeral container filesystem at `/app/data/dashboard.db`.
Use `railway run` to exec a Node snippet that dumps it:

```bash
cd /data/home/gsddashboard
railway run --service "GSD Dashboard" node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/dashboard.db');
const open = db.prepare('SELECT * FROM project_tasks WHERE archived=0 ORDER BY id').all();
const archived = db.prepare('SELECT * FROM project_tasks WHERE archived=1 ORDER BY id').all();
console.log(JSON.stringify({open, archived}));
"
```

If the Railway service path is different, try `/app/dashboard.db` or check with:
```bash
railway run --service "GSD Dashboard" node -e "const fs=require('fs'); console.log(fs.readdirSync('/app').join('\n'))"
```

## Insert Approach

Once tasks are extracted as JSON, insert into VPS DB — skip duplicates by matching on `(project_key, title)`:

```js
const Database = require('better-sqlite3');
const db = new Database('/data/home/gsddashboard/data/dashboard.db');
const insert = db.prepare(`
  INSERT INTO project_tasks (project_key, title, description, archived, created_at)
  SELECT ?, ?, ?, ?, ?
  WHERE NOT EXISTS (
    SELECT 1 FROM project_tasks WHERE project_key=? AND title=?
  )
`);
// loop tasks and call insert.run(...)
```

## Next Steps

1. Run `railway run` command to dump Railway's project_tasks to JSON
2. Review the dump — note any tasks not already in VPS
3. Insert missing tasks into VPS DB (dedup on project_key + title)
4. Verify counts on dashboard.gsdlabs.dev/gsd
