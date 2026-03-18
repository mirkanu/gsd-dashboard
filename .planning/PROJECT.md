# GSD Dashboard

## What This Is

A web dashboard forked from Claude Code Agent Monitor that adds a GSD (Get Shit Done) layer — reading `.planning/` files from multiple project directories and displaying phase progress, roadmap status, state/blockers, and requirements coverage across all tracked projects. Built for a single developer managing several concurrent AI-assisted projects.

## Core Value

At a glance, see where every GSD project stands — which phase is active, what's done, what's blocked — without opening individual planning files.

## Current State

**Version: v1 — Shipped 2026-03-18**

Live at: https://gsd-dashboard-production.up.railway.app (admin / see DASHBOARD_PASS env var)

What's working:
- GSD Projects tab shows all 4 projects (josie, gsddashboard, debates, reforma) with phase progress, status badges, roadmap panels, and requirements coverage
- Backend reads `.planning/` files locally; Railway deployment proxies via cloudflared tunnel (`GSD_DATA_URL`)
- Self-healing tunnel script (`scripts/tunnel.sh`) runs under s6-supervise — auto-restarts, updates Railway env var on each restart
- Existing agent monitoring features (sessions, Kanban, cost tracking) fully preserved

## Next Milestone Goals

*Not yet defined. Run `/gsd:new-milestone` to plan v2.*

Candidate enhancements from v1 planning:
- Auto-refresh GSD data every N minutes (configurable interval)
- Click-through to view raw planning file content inline
- Phase timeline / Gantt-style view across projects
- Named Cloudflare Tunnel for stable permanent URL (no URL changes on restart)

## Context

- Source repo: https://github.com/hoangsonww/Claude-Code-Agent-Monitor (React + Express + SQLite + WebSocket)
- GSD planning files live under `{project_root}/.planning/` — key files: ROADMAP.md, STATE.md, REQUIREMENTS.md, phases/*/PLAN.md, phases/*/SUMMARY.md
- All 4 initial projects are under `/data/home/`: josie, gsddashboard, debates, reforma
- The existing agent monitoring features (session tracking, Kanban, cost tracking) are retained — GSD is an additive tab
- GSD file format is Markdown with consistent structure (phase numbers, checkboxes, REQ-IDs like AUTH-01)

## Constraints

- **Tech stack**: Fork of Claude Code Agent Monitor — React frontend, Express backend, must stay compatible
- **Data source**: Read-only filesystem access to `.planning/` directories on the same machine
- **Deployment**: Railway (cloud) with cloudflared tunnel to local machine for GSD data

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork + add GSD tab (not standalone app) | Reuses React + Express boilerplate, preserves existing agent monitoring, faster to build | ✅ Correct — built in one day |
| Manual refresh for GSD data | Sufficient for the use case, avoids complexity of file watchers | ✅ Correct — works well in practice |
| Configurable project list (not hardcoded) | User has 4 projects now but expects to add more — config file approach scales cleanly | ✅ Correct — edit gsd-projects.json only |
| Railway deployment + cloudflared proxy | Keep GSD readers local (filesystem access), expose via tunnel to Railway-hosted UI | ✅ Working — self-healing tunnel handles URL changes |

---
*Last updated: 2026-03-18 — v1 complete*
