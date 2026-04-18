# Milestones

## v4.3 Optimisation & Cost Intelligence (Shipped: 2026-04-18)

**Phases completed:** 43, 44, 45, 48, 49 (5 phases, 13 plans)
**Timeline:** 2026-04-10 → 2026-04-18 (8 days)

**Key accomplishments:**
- Project status accuracy: in-memory `stateBroadcaster` with 2s poll + 3s change-heuristic cadence; WS push replaces stale message-based status
- Usage tracking: `/api/pricing/window` with per-model tokens + by_model breakdown; inline pricing editor with per-row dirty/saving state; session cost surfaced on project cards
- Services cost foundation: encrypted credentials (AES-GCM) in `app_settings`; `external_service_costs` table with email-parser route; ServicesPage renders costs/rules/credentials alongside status
- Idle session cost controls: `costMeasurement` (RSS → $/day math, daily log), `idleDetector` (graceful pause on waiting idle); Railway $/day surfaced on Services page; Config page Idle Auto-Close section
- Idle detector busy-work awareness: Claude Code hook-sourced busy markers (`PreToolUse` Bash(bg)/Agent/Task, `PostToolUse`/`SubagentStop` clear) prevent auto-close of sessions legitimately waiting on in-flight background work; UI surfaces state as "Working" (not "Waiting") when markers present; JSONL audit log for every skipped auto-close decision; weekly `disk-prune` sweep

**Phases carried forward / dropped:**
- Phase 46 (Services API Integrations) — subsumed by v5.0 Phase 54 (Admin-API Onboarding)
- Phase 47 (AI-Guided CLAUDE.md Editor) — parked as SEED-001; v5.0 Phase 56B supersedes the intent

**Last phase number:** 49
**Archived artifacts:** `.planning/milestones/v4.3/`

---

## v4.2 Cost Intelligence, Auth & UX Polish (Shipped: 2026-04-10)

**Phases completed:** 6 phases, 9 plans, 0 tasks

**Key accomplishments:**
- (none recorded)

---

## v4.1 Chat Polish → Terminal-First (Shipped: 2026-04-06)

**Phases:** 33-36 (4 phases, 6 plans + 7 quick tasks)
**Timeline:** 2026-04-04 → 2026-04-06 (2 days)

**Key accomplishments:**
- Terminal-first dashboard: replaced chat window with always-on xterm terminal as primary view (auto-connects on project select)
- Performance overhaul: async tmux calls with Promise.all, 5s API cache, PTY output batching (API response 5-15s → <500ms)
- Mobile terminal UX: no auto-keyboard on load, info button opens project drawer, send bar for mobile input
- Live tmux status: project list shows current task from tmux (e.g. "planning Phase 31") instead of stale chat messages
- Dead code cleanup: removed classifier, feedback pipeline, message storage — 11 dead files, eliminated 2.5s CPU polling loop

**Architectural pivot:** Phases 33-36 originally built chat features (classifier, feedback, message rendering). User testing revealed the chat view was unreliable and slow — messages were often misclassified, poorly formatted, and not the latest. Quick tasks 27-30 pivoted to a terminal-first approach, removing the chat window entirely and making the raw terminal the primary interaction surface. This proved significantly faster and more reliable.

**Last phase number:** 36

---

## v4.0 Chat-First Dashboard (Shipped: 2026-04-04)

**Phases:** 28-32 (5 phases, 9 plans + 5 quick tasks)
**Timeline:** 2026-04-04 (1 day)

**Key accomplishments:**
- Chat-first UI: WhatsApp/Telegram-style conversation list replacing kanban board
- Per-project chat window with classified message bubbles from tmux output
- Tmux output classifier: regex-based pipeline classifying terminal output into typed messages (stage banners, checkpoints, completions, errors, hidden)
- @chatscope/chat-ui-kit-react integration with dark/light theme support
- 3-column desktop layout (20% chat list / 50% chat / 30% project details)
- Working indicator with live tmux status text (typing indicator pattern)
- Tappable command chips and checkpoint option buttons (insert, don't auto-send)
- Unread badge tracking via WebSocket eventBus
- Project detail panel with autopilot controls, metadata, file tabs
- Reopen confirmation for paused/archived project sends

**Last phase number:** 32

---

## v3.0 Autopilot & Cost Intelligence (Shipped: 2026-04-03)

**Phases:** 17-25, 18.1 (11 phases, 20 plans + 18 quick tasks)
**Timeline:** 2026-03-31 → 2026-04-03 (4 days)

**Key accomplishments:**
- Autopilot Core: AutopilotManager with circuit breaker, REST API, UI controls with WebSocket progress
- Waiting accuracy: session state detection via tmux capture-pane, polling burst on terminal close
- Safety foundation: CircuitBreaker, processSpawner with waitForIdle, process_registry
- Task data layer + UI: per-project tasks with CRUD, textarea descriptions, clipboard export
- Persistent tunnel: ngrok static domain replacing ephemeral cloudflare tunnels
- Card UX: kanban board, pause button, archive/unarchive, light/dark mode toggle
- pm2 process management with health check watchdog for auto-restart
- Reopen terminal auto-launches Claude with --dangerously-skip-permissions

**Deferred:** Cost Intelligence, Card UX Polish → subsumed by v4.0 chat redesign
**Last phase number:** 27

---

## v2.1 Session Intelligence & Terminal UX (Shipped: 2026-03-28)

**Phases:** 12, 13, 13.1, 14, 16 (5 phases, 11 plans)
**Timeline:** 2026-03-26 → 2026-03-28 (3 days)

**Key accomplishments:**
- Session state detection (working/waiting/paused/archived) with colored card borders and labels
- Archive/unarchive projects in-app; summary stats row with state counts
- Terminal UX overhaul: send box moved into overlay, mobile keyboard-push fix, touch scroll
- Mobile terminal polish: special key bar, full-screen send input, message log with chat-style UI
- Telegram notifications on session state transitions with scroll-to-select detection
- OOM prevention: 1GB heap caps, memory watchdog, orphan process cleanup

---

## v2.0 Project Control Plane (Shipped: 2026-03-25)

**Phases:** 9-11 (3 phases, 6 plans)
**Timeline:** 2026-03-24 → 2026-03-25 (2 days)

**Key accomplishments:**
- Tmux backend wiring: session liveness detection, send-keys endpoint, tmuxActive field
- Smart send UI: next_action pre-fill from STATE.md, GSD command chips
- Full-screen xterm.js terminal overlay with node-pty WebSocket bridge and live I/O

---

## v1.2 GSD Stats & Live Data Pipeline (Shipped: 2026-03-23)

**Phases:** 7-8 (2 phases, 4 plans)
**Timeline:** 2026-03-22 → 2026-03-23 (2 days)

**Key accomplishments:**
- Agent data proxy through GSD_DATA_URL tunnel — Railway shows live local session data
- Server-side stats: next action, blockers, velocity, streak, estimated completion
- Blocked-first sort and blocked badge on project cards

---

## v1.1 File Viewer & Card Enhancements (Shipped: 2026-03-21)

**Phases:** 4-6 (3 phases, 7 plans)
**Timeline:** 2026-03-21 (1 day)

**Key accomplishments:**
- Version badge and live URL on project cards, parsed from PROJECT.md
- File content endpoints for planning files (state, roadmap, requirements, active plan)
- Side drawer with 4 file tabs and inline markdown rendering
- Full-screen markdown viewer with GFM tables and checkboxes

---

## v1.0 Foundation (Shipped: 2026-03-18)

**Phases:** 1-3 (3 phases, 9 plans)
**Timeline:** 2026-03-18 (1 day)

**Key accomplishments:**
- Forked Claude Code Agent Monitor; added GSD tab to React UI
- Backend readers for .planning/ files (ROADMAP, STATE, REQUIREMENTS, phases)
- /api/gsd/projects endpoint with configurable project list
- Frontend dashboard with project cards, phase progress, status badges
- Railway deployment with cloudflared tunnel for local GSD data

---
