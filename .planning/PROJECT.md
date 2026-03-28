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

### Active

- [ ] New project creation: one-click directory + tmux + Claude launch from dashboard (Phase 15)

### Out of Scope

- Multi-user auth or per-user session isolation (single developer tool)
- Session recording / playback
- Offline mode — live data is the core value
- Mobile app — PWA-capable web dashboard is sufficient

## Context

Shipped v2.1 with ~16,900 LOC (JS/JSX/TS/TSX/CSS).
Tech stack: React + Vite, Express, SQLite, WebSocket, xterm.js, node-pty.
Deployed on Railway with cloudflared tunnel to local machine.
239 commits across 16 completed phases in 10 days (2026-03-18 → 2026-03-28).
6 tracked projects: josie, gsddashboard, debates, reforma + others.

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

---
*Last updated: 2026-03-28 after v2.1 milestone*
