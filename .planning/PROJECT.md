# GSD Dashboard

## What This Is

A terminal-first web dashboard for managing multiple Claude Code GSD projects from a single interface. Forked from Claude Code Agent Monitor, it adds a GSD layer that reads `.planning/` files, shows phase progress and session states, provides live terminal access to tmux sessions via xterm.js, sends Telegram notifications when input is needed, and prevents OOM crashes on the shared container. Built for a single developer managing several concurrent AI-assisted projects.

## Core Value

At a glance, see where every GSD project stands and interact with any session — without opening separate terminals or checking files manually.

## Requirements

### Validated

- ✓ Foundation: fork, GSD tab, configurable projects, backend readers, frontend dashboard, Railway deploy — v1.0
- ✓ File viewer: version badge, live URL, file content endpoints, drawer with 4 tabs, full-screen markdown — v1.1
- ✓ Live data pipeline: agent data proxy through tunnel, stats (velocity/streak/TTL/blockers/next action) — v1.2
- ✓ Project control plane: tmux wiring, send-keys, smart send UI, live xterm.js terminal overlay — v2.0
- ✓ Session intelligence: state detection (working/waiting/paused/archived), colored indicators, archive/unarchive — v2.1
- ✓ Terminal UX: send box in overlay, mobile keyboard fix, touch scroll, special key bar, message log — v2.1
- ✓ Telegram integration: state transition notifications, scroll-to-select detection, reply polling — v2.1
- ✓ OOM prevention: heap caps, memory watchdog, orphan cleanup — v2.1
- ✓ Project tasks: per-project task list with title, description, archive, clipboard export, inline editing — v2.2
- ✓ Card UX simplification: kanban board, state-based filtering (default Waiting), streamlined cards — v2.3
- ✓ Mobile terminal polish: scroll sensitivity, iOS keyboard zoom fix, special key focus, text selection, paste button — v2.3
- ✓ Multi-line task description: auto-growing textarea for notes — v2.3
- ✓ Claude Desktop/Mobile GSD access: MCP server + remote Streamable HTTP transport — v2.3
- ✓ GSD Autopilot: AutopilotManager, REST API, UI controls, circuit breaker, process spawner — v3.0
- ✓ Waiting accuracy: session state detection, polling burst on terminal close — v3.0
- ✓ Pause card: pause button kills tmux session, reopen auto-launches Claude — v3.0
- ✓ Light/dark mode toggle — v3.0
- ✓ pm2 process management with health check watchdog — v3.0
- ✓ Project detail panel: controls, file tabs, metadata in 3-column desktop layout — v4.0
- ✓ Working indicator with live tmux status text — v4.0
- ✓ Terminal-first layout: always-on xterm terminal replaces chat window as primary view — v4.1
- ✓ Live tmux status in project list: shows current task (e.g. "planning Phase 31") — v4.1
- ✓ Performance: async tmux calls, 5s API cache, PTY output batching (API <500ms) — v4.1
- ✓ Mobile terminal UX: no auto-keyboard, info button opens drawer, send bar — v4.1

### Active

- [ ] External services dashboard: page showing Railway, Vercel, Resend, GitHub, etc. per project with status and costs
- [ ] Claude Max usage tracking: session and weekly token consumption with limits display
- [ ] Autopilot cost gate: configurable cost limits for autonomous execution
- [ ] Persistent auth: long-lived browser session replacing modal login on every reload
- [ ] Terminal timeout fix: prevent disconnect after ~3 minutes idle
- [ ] Terminal light mode colors: fix invisible selection highlight and white-on-white text
- [ ] Resizable 3-column layout: drag handles between columns in desktop view
- [ ] Status color changes: waiting=blue, paused=orange
- [ ] CLAUDE.md editor: view/edit global and per-project CLAUDE.md files from dashboard

### Future

- [ ] New project creation: one-click directory + tmux + Claude launch from dashboard (deferred)
- [ ] Email receipt parsing pipeline for automated cost tracking (deferred)
- [ ] GitHub issues link on project cards (deferred from v3.0)
- [ ] Task Archive All: suggest bulk archive after Copy (deferred from v3.0)

### Out of Scope

- Multi-user auth or per-user session isolation (single developer tool)
- Session recording / playback
- Offline mode — live data is the core value
- Mobile app — PWA-capable web dashboard is sufficient
- Chat-based message view — tried in v4.0-4.1, replaced by terminal-first approach (classifier unreliable, latency too high)
- Message classifier / feedback pipeline — removed in v4.1 pivot

## Context

Shipped v4.1 with terminal-first layout, async performance, and dead chat code cleanup.
Tech stack: React + Vite, Express, SQLite, WebSocket, xterm.js, node-pty.
Deployed on Railway with cloudflared tunnel to local machine.
6 tracked projects: josie, gsddashboard, debates, reforma + others.
GSD Autopilot fork (github.com/jamoeight/get-shit-done-autopilot) provides reference architecture for autonomous execution.
User is a non-coder using vibe coding — wants maximum automation and hands-off execution.
v4.1 lesson: raw terminal output is more reliable than any classifier/formatter layer on top of it.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork + add GSD tab (not standalone app) | Reuses React + Express boilerplate, preserves agent monitoring | ✅ Correct — built in one day |
| Configurable project list (gsd-projects.json) | Scales cleanly as projects are added | ✅ Correct |
| Railway + cloudflared tunnel | GSD readers need local filesystem; tunnel exposes to cloud UI | ✅ Working — self-healing tunnel |
| react-markdown for file rendering | GFM tables, checkboxes, prose styling work out of the box | ✅ Correct |
| node-pty + xterm.js for terminal | Industry standard; noServer WS avoids port conflicts | ✅ Correct |
| Session state via tmux capture-pane | No extra scripts; pattern matching on last 50 lines | ✅ Correct |
| Telegram bot merged into server process | No separate repo/process; env var config, no-op when unset | ✅ Correct |
| OOM: heap cap + watchdog + orphan cleanup | Three-layer defense for shared container with 4+ sessions | ✅ Correct |
| Terminal-first over chat view | Chat classifier was unreliable, slow, and required constant fixing | ✅ Correct — faster, simpler, always accurate |
| Async tmux + API cache | Sync execFileSync blocked event loop 5-15s per request | ✅ Correct — <500ms now |
| Remove classifier + feedback pipeline | Dead code after chat removal; 2.5s polling loop wasting CPU | ✅ Correct — cleaner codebase |

## Constraints

- **Tech stack**: Fork of Claude Code Agent Monitor — React frontend, Express backend, must stay compatible
- **Data source**: Read-only filesystem access to `.planning/` directories on the same machine
- **Deployment**: Railway (cloud) with cloudflared tunnel to local machine for GSD data
- **Memory**: Railway container shared by 4+ Claude Code sessions; 1GB heap cap per node process

## Current Milestone: v4.2 Cost Intelligence, Auth & UX Polish

**Goal:** Add cost/service tracking, fix auth and terminal reliability, and polish the desktop UX with resizable columns and configurable CLAUDE.md editing.

**Target features:**
- External services dashboard page (Railway, Vercel, Resend, GitHub per project)
- Claude Max token usage tracking with weekly limits
- Persistent auth (remember browser, stop re-entering on every reload)
- Terminal timeout fix (stays alive beyond 3 minutes idle)
- Terminal light mode color fixes (selection highlight, white-on-white text)
- Resizable 3-column desktop layout (drag handles)
- Status color changes (waiting=blue, paused=orange)
- CLAUDE.md editor (view/edit global + per-project files from dashboard)

---
*Last updated: 2026-04-07 after v4.2 milestone start*
