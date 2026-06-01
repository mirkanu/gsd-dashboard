# GSD Dashboard

> **Personal project:** This was built to solve a specific problem for the author. It works for that purpose. It has not been tested for general deployment and is not actively maintained — use it as inspiration or a starting point, not a supported tool.

> **100% AI-generated:** No code was written by hand. Every file was produced by [Claude Code](https://claude.ai/claude-code) via the [GSD workflow](https://github.com/pablof7z/gsd). The author is a non-programmer building personal tools with AI. PRs are welcome — if one arrives, Claude Code will review and merge it. Issues are unlikely to receive a response.

A personal developer dashboard for tracking Claude Code projects and agent sessions in real time. It combines a GSD project tracker (phase progress, blockers, velocity, completion estimates from `.planning/` files) with live Claude Code session monitoring (tool use, cost, Kanban view, browser notifications) — all in one browser tab.

## Features

- **GSD project overview** — reads `.planning/STATE.md`, `ROADMAP.md`, and `REQUIREMENTS.md` from any number of local projects; shows phase progress bars, status badges, blockers, next action, velocity, and estimated completion
- **Live agent monitoring** — real-time session tracking via Claude Code hooks (PreToolUse / PostToolUse / Stop); cost tracking, tool-use breakdown, Kanban view
- **Terminal overlay** — embedded xterm.js terminal attached to live tmux sessions per project
- **MCP server** — local MCP exposing dashboard operations as tools so Claude Code can query project state directly
- **Global env editor** — browse and edit the shared `.env.production` file from the browser without touching the terminal

## Quick setup

> **Tip:** Not sure where to start? Paste the link to this page into [Claude](https://claude.ai), [ChatGPT](https://chat.openai.com), or any AI assistant and ask it to walk you through the setup. These tools can read GitHub pages and guide you step by step.

1. **Clone and install**
   ```bash
   git clone https://github.com/mirkanu/gsddashboard.git
   cd gsddashboard
   npm run setup   # installs deps, creates SQLite DB, installs Claude Code hooks
   ```

2. **Configure your projects** — copy the example config and point it at your project roots:
   ```bash
   cp gsd-projects.json.example gsd-projects.json
   ```
   Edit `gsd-projects.json`:
   ```json
   {
     "projects": [
       { "name": "myproject", "root": "/path/to/myproject" }
     ]
   }
   ```
   Each project root must contain a `.planning/` directory with at least `STATE.md` and `ROADMAP.md`.

3. **Start in dev mode**
   ```bash
   npm run dev    # server on :4820 + Vite HMR
   ```
   Open [http://localhost:4820](http://localhost:4820).

4. **Production**
   ```bash
   npm run build   # builds React client into server/public
   npm start       # serves everything on port 4820
   ```

## Stack

- **Backend**: Node.js + Express + SQLite + WebSocket
- **Frontend**: React 18 + Vite + TypeScript + Tailwind CSS
- **MCP server**: local MCP server (`mcp/`) exposing project state as tools
- **Hook handler**: Node.js script wired into Claude Code lifecycle hooks (`scripts/`)

## Credits

Forked from [Claude Code Agent Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor) by hoangsonww. Agent monitoring features (sessions, Kanban, cost, WebSocket) are from that project. The GSD layer (project tracking, planning file parsing, stats, terminal overlay) is added on top.

## License

MIT
