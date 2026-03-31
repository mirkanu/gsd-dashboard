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

### Active

- [ ] GSD Autopilot: autonomous plan-all → execute-all loop per project, triggered from dashboard (v3.0)
- [ ] Usage & cost tracking: Claude Max session/weekly limits, external service costs across all projects (v3.0)
- [ ] External services page: status and cost of Railway, GitHub, Claude, OpenAI, etc. with receipt ingestion (v3.0)
- [ ] Waiting accuracy: refresh card status on terminal close, "Waiting" = waiting on human input only (v3.0)
- [ ] Message tab styling: distinguish Claude vs human messages with different background color and alignment (v3.0)
- [ ] Task Archive All: suggest bulk archive after Copy (v3.0)
- [ ] GitHub issues link on project cards (v3.0)
- [ ] Dynamic shortcuts: next GSD command suggestions on cards (v3.0)
- [ ] Pause card: define how to pause/resume a project from the dashboard (v3.0)

### Future

- [ ] New project creation: one-click directory + tmux + Claude launch from dashboard (deferred)
- [ ] Email receipt parsing pipeline for automated cost tracking (deferred — capability exists in YNAB project)

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

## Current Milestone: v3.0 Autopilot & Cost Intelligence

**Goal:** Transform the dashboard from a monitoring tool into an autonomous execution controller with full cost visibility across all projects and services.

**Target features:**
- GSD Autopilot: plan-all phases, autonomous execution loop, pause/resume from dashboard, failure learning
- Usage & cost intelligence: Claude Max limits tracking, external services status/cost page
- Card UX: Waiting accuracy, GitHub issues links, Archive All, dynamic GSD shortcuts, pause card
- Message tab: distinguish Claude vs human messages with visual differentiation

---
*Last updated: 2026-03-31 after v3.0 milestone start*
