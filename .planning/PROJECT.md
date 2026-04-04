# GSD Dashboard

## What This Is

A web dashboard for managing multiple Claude Code GSD projects from a single interface. Forked from Claude Code Agent Monitor, it adds a GSD layer that reads `.planning/` files, shows phase progress and session states, provides live terminal access to tmux sessions, sends Telegram notifications when input is needed, and prevents OOM crashes on the shared container. Built for a single developer managing several concurrent AI-assisted projects.

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
- ✓ Chat-first UI: WhatsApp-style chat list and per-project chat windows — v4.0
- ✓ Tmux output classifier: regex pipeline classifying terminal output into typed messages — v4.0
- ✓ Tappable actions: command chips and checkpoint buttons insert into reply box — v4.0
- ✓ Project detail panel: controls, file tabs, metadata in 3-column desktop layout — v4.0
- ✓ Unread indicators and real-time chat streaming via WebSocket — v4.0
- ✓ 3-column desktop layout: chat list / chat window / project details — v4.0
- ✓ Working indicator with live tmux status text — v4.0

### Active

- [ ] Classifier accuracy: user feedback loop with auto-fix, major pattern improvements (v4.1)
- [ ] Send confirmation: immediate visual feedback after sending a message (echo + status change to Working) (v4.1)
- [ ] Working status reliability: instant status updates, accurate state detection (v4.1)
- [ ] Message feedback UI: right-click/long-press on chat messages to flag classifier errors (v4.1)

### Future

- [ ] Usage & cost tracking: Claude Max session/weekly limits, external service costs (deferred from v3.0)
- [ ] External services page: Railway, GitHub, Claude, OpenAI status/cost with receipt ingestion (deferred from v3.0)
- [ ] New project creation: one-click directory + tmux + Claude launch from dashboard (deferred)
- [ ] Email receipt parsing pipeline for automated cost tracking (deferred)
- [ ] GitHub issues link on project cards (deferred from v3.0)
- [ ] Dynamic shortcuts: next GSD command suggestions (subsumed by chat tappable actions in v4.0)
- [ ] Message tab styling: subsumed by v4.0 chat redesign
- [ ] Task Archive All: suggest bulk archive after Copy (deferred from v3.0)

### Out of Scope

- Multi-user auth or per-user session isolation (single developer tool)
- Session recording / playback
- Offline mode — live data is the core value
- Mobile app — PWA-capable web dashboard is sufficient

## Context

Shipped v2.3 with kanban board, mobile terminal polish, MCP server, and 11 quick tasks.
Tech stack: React + Vite, Express, SQLite, WebSocket, xterm.js, node-pty.
Deployed on Railway with cloudflared tunnel to local machine.
6 tracked projects: josie, gsddashboard, debates, reforma + others.
GSD Autopilot fork (github.com/jamoeight/get-shit-done-autopilot) provides reference architecture for autonomous execution: plan-all → autopilot loop → progress watcher → failure learning → circuit breaker.
User is a non-coder using vibe coding — wants maximum automation and hands-off execution.

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

## Constraints

- **Tech stack**: Fork of Claude Code Agent Monitor — React frontend, Express backend, must stay compatible
- **Data source**: Read-only filesystem access to `.planning/` directories on the same machine
- **Deployment**: Railway (cloud) with cloudflared tunnel to local machine for GSD data
- **Memory**: Railway container shared by 4+ Claude Code sessions; 1GB heap cap per node process

## Current Milestone: v4.1 Chat Polish

**Goal:** Make the chat experience reliable enough that the terminal is rarely needed — fix classifier accuracy, add user feedback loop, ensure working status is instant and accurate.

**Target features:**
- Classifier feedback: right-click messages to flag errors, stored with original content, auto-reclassify
- Send confirmation: immediate echo + status change when sending commands
- Working status: reliable, instant updates with actual Claude status text
- Pattern improvements: overhaul classifier patterns based on real usage

---
*Last updated: 2026-04-04 after v4.1 milestone start*
