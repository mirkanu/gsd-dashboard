# GSD Dashboard

## What This Is

A web dashboard forked from Claude Code Agent Monitor that adds a GSD (Get Shit Done) layer — reading `.planning/` files from multiple project directories and displaying phase progress, roadmap status, state/blockers, and requirements coverage across all tracked projects. Built for a single developer managing several concurrent AI-assisted projects.

## Core Value

At a glance, see where every GSD project stands — which phase is active, what's done, what's blocked — without opening individual planning files.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Fork Claude Code Agent Monitor and add a GSD tab alongside existing agent monitoring
- [ ] Backend endpoint scans configured project roots for `.planning/` directories and parses GSD files
- [ ] Display roadmap overview: all phases across all projects at a glance
- [ ] Display phase progress: current phase, which plans/tasks are done vs pending
- [ ] Display state/blockers: current STATUS.md content — last action, next step, blockers
- [ ] Display requirements coverage: how many REQ-IDs are checked off in REQUIREMENTS.md
- [ ] Initial projects configured: josie, gsddashboard, debates, reforma (all under /data/home)
- [ ] Project list is configurable — new projects can be added without code changes
- [ ] Dashboard loads current data on page load (manual refresh, no WebSocket needed for GSD data)

### Out of Scope

- Real-time GSD file watching / WebSocket push for planning updates — manual refresh is sufficient
- Authentication / multi-user support — single developer tool
- Editing planning files from the dashboard — read-only view
- Hosting outside this machine — local development server only (for now)

## Context

- Source repo: https://github.com/hoangsonww/Claude-Code-Agent-Monitor (React + Express + SQLite + WebSocket)
- GSD planning files live under `{project_root}/.planning/` — key files: ROADMAP.md, STATE.md, REQUIREMENTS.md, phases/*/PLAN.md, phases/*/SUMMARY.md
- All 4 initial projects are under `/data/home/`: josie, gsddashboard, debates, reforma
- The existing agent monitoring features (session tracking, Kanban, cost tracking) are retained — GSD is an additive tab
- GSD file format is Markdown with consistent structure (phase numbers, checkboxes, REQ-IDs like AUTH-01)

## Constraints

- **Tech stack**: Fork of Claude Code Agent Monitor — React frontend, Express backend, must stay compatible
- **Data source**: Read-only filesystem access to `.planning/` directories on the same machine
- **Deployment**: Local only — runs as a dev server, no production hosting required initially

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork + add GSD tab (not standalone app) | Reuses React + Express boilerplate, preserves existing agent monitoring, faster to build | — Pending |
| Manual refresh for GSD data | Sufficient for the use case, avoids complexity of file watchers + WebSocket for a second data stream | — Pending |
| Configurable project list (not hardcoded) | User has 4 projects now but expects to add more — config file approach scales cleanly | — Pending |

---
*Last updated: 2026-03-18 after initialization*
