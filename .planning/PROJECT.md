# GSD Dashboard

## What This Is

A terminal-first web dashboard for managing multiple Claude Code GSD projects from a single interface. Forked from Claude Code Agent Monitor, it adds a GSD layer that reads `.planning/` files, shows phase progress and session states, provides live terminal access to tmux sessions via xterm.js, sends Telegram notifications when input is needed, and prevents OOM crashes on the shared container. Built for a single developer managing several concurrent AI-assisted projects.

## Core Value

**As of v5.0 (Non-Programmer Mode):** Build, run, and evolve software by describing what you want — with the Dashboard handling everything that surrounds the CLI. The tmux terminal stays as a first-class surface. The Dashboard wraps projects, planning, services, lifecycle, notifications, and launched-project workflows — not the conversational loop itself.

**Historical (v1.0–v4.3):** At a glance, see where every GSD project stands and interact with any session — without opening separate terminals or checking files manually.

## Design Principles (v5.0)

1. The terminal is a first-class surface, not a debug view — stays fully visible in novice mode.
2. Never ask the user to edit or write code — the user describes, Claude does.
3. Never ask the user to do programmer things — no diff/log pastes, no file opens, no terminal commands, no jargon decisions.
4. No GSD/Claude Code jargon in the primary UI in novice mode ("Phase", "Plan", "Milestone", `/gsd:*` hidden behind friendly labels).
5. Autonomous testing is the default, not a choice.
6. Admin-API-first for external services.
7. Minimise external services — Railway-first wherever feasible.
8. Dashboard is the control plane, tmux sessions are workers.
9. Progress narrated in plain English.
10. Power-user (expert) mode is a toggle, not a separate product.

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
- ✓ Cookie-based persistent auth: 30-day session, login page, bypasses reload modal — v4.2
- ✓ Terminal WebSocket keepalive + auto-reconnect: 20s ping, 10-retry client reconnect — v4.2
- ✓ Terminal light mode fixes: xterm selectionBackground, header button visibility — v4.2
- ✓ Status badge colors: waiting=blue, paused=orange across all views — v4.2
- ✓ Resizable 3-column desktop layout: drag handles with localStorage persistence — v4.2
- ✓ External services dashboard: page listing Railway/Vercel/GitHub/Claude/OpenAI status per project — v4.2
- ✓ Claude usage tracking: session cost on metadata, weekly gauge with $50 limit, 7-day sparkline — v4.2
- ✓ Dedicated Usage page: cross-project cost summary with weekly gauge, trend chart, breakdown table — v4.2 (quick task 37)
- ✓ CLAUDE.md editor: view/edit global + per-project CLAUDE.md from dashboard — v4.2
- ✓ Per-project config: verbosity settings + Telegram alert toggles, SQLite persistence — v4.2
- ✓ Global default settings with apply-to-all: global verbosity + Telegram defaults, bulk apply to existing projects — v4.2 (quick task 38)
- ✓ MCP GSD tools: gsd_list_projects, gsd_get_all_project_status, gsd_read_planning_file, gsd_list_tasks — v4.2 (quick task 36)
- ✓ Project status accuracy: in-memory stateBroadcaster with 2s poll + 3s change-heuristic cadence; WS push replaces stale message-based status — v4.3
- ✓ Usage display enhancements: `/api/pricing/window` with per-model tokens + by_model breakdown; inline pricing editor with per-row dirty/saving state — v4.3
- ✓ Services cost tracking foundation: encrypted credentials in app_settings; `external_service_costs` table with email-parser route; ServicesPage renders costs/rules/credentials — v4.3
- ✓ Idle session cost controls: RSS → $/day cost measurement; graceful pause on waiting idle; Railway $/day surfaced on Services; Config page Idle Auto-Close section — v4.3
- ✓ Idle detector busy-work awareness: Claude Code hook-sourced busy markers prevent auto-close of sessions waiting on in-flight bg work; state reads "Working" when busy; JSONL audit log + weekly disk-prune sweep — v4.3 (Phase 49 + quick task 260418-khw)

### Active (v5.0 — Non-Programmer Mode)

- [ ] Original-repo cleanup: strip dormant features inherited from upstream fork (Sessions/SessionDetail/ActivityFeed/Kanban route, useNotifications, seed/import scripts, unused routes + schema) — Phase 50.5
- [ ] `ui_mode` toggle (novice/expert, novice default) with copywriting translation layer hiding GSD/Claude Code jargon in primary UI — Phase 50
- [ ] GUI project creation + import: New Project wizard (name → repo → tmux → new-project interview), Import Existing Project with auto codebase analysis — Phase 51
- [ ] Auto-verify by default: every plan execution auto-runs verify-work; failed verification offers one-click retry; Pause/Archive fold in verification — Phase 53
- [ ] Admin-API onboarding: guided panels per external service, OAuth where available, admin-key paste otherwise; Railway-first picker; credentials exposed to Claude sessions as env vars — Phase 54 (subsumes former Phase 46)
- [ ] MCP tool router evaluation: Composio vs self-hosted gateway vs per-service MCP — decision phase only — Phase 55
- [ ] CLI verbosity contract + Portfolio Feed: reduce CLI output; extract landmark events into Dashboard cards without replacing the terminal — Phase 56
- [ ] Non-programmer behavioural contract: Claude never asks the user to do programmer things; behavioural eval against 20 representative prompts; user-testing checkpoint — Phase 56B
- [ ] Project maturity stages (draft/alpha/beta/launched/maintenance/retired) with stage-appropriate Dashboard defaults and GUI transition wizard — Phase 58
- [ ] Unified notification centre: single Dashboard-owned Telegram sender, event-bus driven, rate-limited + deduplicated + quiet-hours policy; old tmux-level Telegram removed — Phase 54B
- [ ] Task backend migration + issue GUI wrapper: Beta→Launched migrates tasks to GitHub Issues; Dashboard-native issue list/detail/create/close — Phase 59
- [ ] Dev/production environment manager: Beta→Launched provisions dev + prod envs on Railway; GUI "Promote dev → prod" button with verify-work gating; one-click rollback — Phase 60

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

Shipped v4.2 with cost intelligence, persistent auth, terminal reliability, and configuration UI.
Tech stack: React + Vite, Express, SQLite, WebSocket, xterm.js, node-pty.
Deployed on Railway with cloudflared tunnel to local machine.
7 tracked projects: josie, gsddashboard, debates, reforma, KidAI, ynab + others.
GSD Autopilot fork (github.com/jamoeight/get-shit-done-autopilot) provides reference architecture for autonomous execution.
User is a non-coder using vibe coding — wants maximum automation and hands-off execution.
v4.2 lessons:
- Every /api/ route was individually bypassed in cookieAuth; simpler to skip auth entirely server-side and rely on client-side gate
- Anything that needs local filesystem/SQLite data must go through the tunnel proxy (not just GSD routes); PUT/POST bodies need to be forwarded
- Group-by queries need to include model field for calculateCost() to match pricing rules

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
| Cookie auth over JWT | Simpler, no secret management, single-user dashboard | ✅ Correct — works, 30-day sessions |
| Skip all /api/ routes in cookieAuth | Every route was individually bypassed anyway; client-side gate handles UI access | ✅ Correct — single-user dashboard |
| Proxy /api/pricing, /api/config through tunnel | Data and files live locally; Railway server has no access | ✅ Correct — needed for Usage + Config pages |
| Reuse project_settings table for global defaults | Reserved `__global__` key avoids new migration | ✅ Correct — fallback read inherits on first access |
| Per-project services in gsd-projects.json | Extends existing config; Atlassian Statuspage format covers most providers | ✅ Correct |
| $50 weekly Claude Max limit (constant) | No public API for actual limits; user can mentally calibrate | ⚠️ Revisit — if usage grows may need configurable |

## Constraints

- **Tech stack**: Fork of Claude Code Agent Monitor — React frontend, Express backend, must stay compatible
- **Data source**: Read-only filesystem access to `.planning/` directories on the same machine
- **Deployment**: Railway (cloud) with cloudflared tunnel to local machine for GSD data
- **Memory**: Railway container shared by 4+ Claude Code sessions; 1GB heap cap per node process

## Current Milestone: v4.3 Optimisation & Cost Intelligence

**Goal:** Fix project status accuracy, optimise the new pages (Services/Usage/Config), add comprehensive services cost tracking, and replace manual CLAUDE.md editing with an AI-guided workflow.

**Target features:**
- Real-time project status via WebSocket push (fix Working/Waiting false states)
- Project cards show elapsed time + current task preview
- Usage page: token counts, editable per-model pricing, model breakdown
- Services page: uptime sparklines + comprehensive cost tracking (email + APIs)
- AI-guided CLAUDE.md editor with diff preview

---
*Last updated: 2026-04-10 after v4.3 milestone start*
