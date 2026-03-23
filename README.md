# GSD Dashboard

> **Note:** This project was written entirely using [Claude Code](https://claude.ai/claude-code) and the [GSD workflow](https://github.com/pablof7z/gsd). No code was written by hand.

A personal developer dashboard for tracking Claude Code projects. Built on top of [Claude Code Agent Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) with a GSD (Get Shit Done) layer added.

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=flat-square&logo=sqlite&logoColor=white)
![MIT License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

---

## What It Does

Two things in one dashboard:

**GSD Projects tab** — reads `.planning/` files from any number of project directories on your machine and shows, at a glance:
- Phase progress (current phase, plans done/total, overall % bar)
- Status badges (in-progress, blocked, complete)
- Blocked badge + blocker list when a project has active blockers
- Next action line (pulled from `STATE.md`)
- Velocity (plans completed in the last 7 days), streak (consecutive active days), and estimated completion
- Expandable roadmap panel and requirements coverage
- Blocked projects sorted to the top

**Agent Dashboard tabs** — the original Claude Code Agent Monitor: real-time session tracking, tool use, Kanban view, cost tracking, browser notifications. Data arrives via Claude Code hooks (PreToolUse / PostToolUse / Stop).

---

## Stack

- **Backend**: Express + SQLite + WebSocket (`server/`)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS (`client/`)
- **MCP server**: local MCP exposing dashboard operations as tools (`mcp/`)
- **Hook handler**: Node.js script wired into Claude Code hooks (`scripts/`)

---

## Quick Start

```bash
npm run setup    # installs deps, creates DB, installs Claude Code hooks
npm run dev      # starts server (4820) + Vite dev server concurrently
```

Open [http://localhost:4820](http://localhost:4820).

### Configure projects

Edit `gsd-projects.json` to point at your project roots:

```json
[
  { "name": "myproject", "root": "/path/to/myproject" }
]
```

Each project root must have a `.planning/` directory with at least `STATE.md` and `ROADMAP.md`.

### Production

```bash
npm run build   # builds client into server/public
npm start       # runs server only on port 4820
```

---

## Remote Access

If you want to access the dashboard from a remote host (e.g. Railway) while GSD data lives on your local machine:

1. Set `GSD_DATA_URL` env var to your local server's URL (e.g. via a cloudflared tunnel).
2. The server proxies `/api/gsd/*` requests through to that URL automatically.

A self-healing tunnel script is included at `scripts/tunnel.sh` for cloudflared + s6-supervise.

---

## GSD Planning Format

The GSD tab reads standard Markdown files from `.planning/`:

| File | Used for |
|---|---|
| `STATE.md` | Status, current phase, blockers, next action |
| `ROADMAP.md` | Phases list with plans_done / plans_total |
| `REQUIREMENTS.md` | REQ-IDs and coverage counts |
| `PROJECT.md` | Version and live URL (first `https://` in first 30 lines) |
| `phases/*/SUMMARY.md` | Completion dates for velocity/streak/TTL calculation |

---

## npm Scripts

| Command | What it does |
|---|---|
| `npm run setup` | Full install + DB init + hook install |
| `npm run dev` | Dev mode (server + Vite HMR) |
| `npm run build` | Production client build |
| `npm start` | Production server |
| `npm run test:server` | Server tests (Node test runner) |
| `npm run test:client` | Client tests (Vitest) |
| `npm run mcp:build` | Build MCP server |
| `npm run mcp:start` | Start MCP server |
| `npm run mcp:typecheck` | TypeScript check for MCP |

---

## Credits

Forked from [Claude Code Agent Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) by hoangsonww. The agent monitoring features (sessions, Kanban, cost, WebSocket) are from that project. The GSD layer (project tracking, planning file parsing, stats) is added on top.

---

## License

MIT
