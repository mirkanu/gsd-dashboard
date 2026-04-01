# Roadmap: GSD Dashboard

## Milestones

- ✅ **v1.0 Foundation** — Phases 1-3 (shipped 2026-03-18) → [archive](milestones/v1-ROADMAP.md)
- ✅ **v1.1 File Viewer & Card Enhancements** — Phases 4-6 (shipped 2026-03-21) → [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 GSD Stats & Live Data Pipeline** — Phases 7-8 (shipped 2026-03-23) → [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v2.0 Project Control Plane** — Phases 9-11 (shipped 2026-03-25) → [archive](milestones/v2.0-ROADMAP.md)
- ✅ **v2.1 Session Intelligence & Terminal UX** — Phases 12-14, 16 (shipped 2026-03-28) → [archive](milestones/v2.1-ROADMAP.md)
- ✅ **v2.2 Project Tasks** — Phases 17-19 (shipped 2026-03-29)
- ✅ **v2.3 UX Polish & Claude Desktop** — Phases 21-23 (shipped 2026-03-30)
- 🚧 **v3.0 Autopilot & Cost Intelligence** — Phases 24-27 (in progress)

---

## Phases

<details>
<summary>✅ v1.0 Foundation (Phases 1-3) — SHIPPED 2026-03-18</summary>

- [x] Phase 1: Foundation & Configuration (3/3 plans) — completed 2026-03-18
- [x] Phase 2: Backend Data Pipeline (2/2 plans) — completed 2026-03-18
- [x] Phase 3: Frontend Dashboard (3/3 plans) — completed 2026-03-18

</details>

<details>
<summary>✅ v1.1 File Viewer & Card Enhancements (Phases 4-6) — SHIPPED 2026-03-21</summary>

- [x] Phase 4: Backend File API (2/2 plans) — completed 2026-03-21
- [x] Phase 5: Card Enhancements (2/2 plans) — completed 2026-03-21
- [x] Phase 6: Drawer and Full-Screen Viewer (3/3 plans) — completed 2026-03-21

</details>

<details>
<summary>✅ v1.2 GSD Stats & Live Data Pipeline (Phases 7-8) — SHIPPED 2026-03-23</summary>

- [x] Phase 7: Agent Data Proxy (2/2 plans) — completed 2026-03-22
- [x] Phase 8: GSD Card Stats (2/2 plans) — completed 2026-03-23

</details>

<details>
<summary>✅ v2.0 Project Control Plane (Phases 9-11) — SHIPPED 2026-03-25</summary>

- [x] Phase 9: Tmux Backend Wiring (2/2 plans) — completed 2026-03-24
- [x] Phase 10: Smart Send UI (2/2 plans) — completed 2026-03-24
- [x] Phase 11: Live Terminal Overlay (2/2 plans) — completed 2026-03-25

</details>

<details>
<summary>✅ v2.1 Session Intelligence & Terminal UX (Phases 12-14, 16) — SHIPPED 2026-03-28</summary>

- [x] Phase 12: Session State Indicators (3/3 plans) — completed 2026-03-26
- [x] Phase 13: Terminal UX (2/2 plans) — completed 2026-03-26
- [x] Phase 13.1: Mobile Terminal Polish & Message Log (3/3 plans) — completed 2026-03-27
- [x] Phase 14: Telegram Integration (2/2 plans) — completed 2026-03-28
- [x] Phase 16: OOM Prevention (1/1 plan) — completed 2026-03-28

</details>

<details>
<summary>✅ v2.2 Project Tasks (Phases 17-19) — SHIPPED 2026-03-29</summary>

- [x] **Phase 17: Task Data Layer** — SQLite table and CRUD API endpoints for per-project tasks (completed 2026-03-28)
- [x] **Phase 18: Task UI** — Tasks tab in project drawer with add, view, archive, and unarchive interactions (completed 2026-03-28)
- [x] **Phase 18.1: Persistent Tunnel for Remote Tmux** (INSERTED) — Named cloudflared tunnel with permanent subdomain (completed 2026-03-29)
- [x] **Phase 19: Clipboard Export** — Copy all open tasks as formatted markdown for GSD consumption (completed 2026-03-29)
- [x] **Phase 20: Fix Railway Deployment** — dequal-patch fix + post-build dist assertion (completed 2026-03-30)

</details>

<details>
<summary>✅ v2.3 UX Polish & Claude Desktop (Phases 21-23) — SHIPPED 2026-03-30</summary>

- [x] **Phase 21: Card UX Simplification** — State-based filtering with slim cards showing only essential info (completed 2026-03-30)
- [x] **Phase 22: Mobile Terminal Fixes** — Reduced scroll sensitivity, iOS zoom prevention, special key focus fix (completed 2026-03-30)
- [x] **Phase 23: Task Textarea and MCP Server** — Auto-growing textarea for task descriptions and MCP server for Claude Desktop (completed 2026-03-30)

</details>

### 🚧 v3.0 Autopilot & Cost Intelligence

**Milestone Goal:** Transform the dashboard from a monitoring tool into an autonomous execution controller with full cost visibility across all projects and services.

- [x] **Phase 24: Waiting Accuracy + Safety Foundation** - Fix state detection and lay the database/backend groundwork required before any autopilot runs (completed 2026-04-01)
- [ ] **Phase 25: Autopilot Core** - Autonomous plan-all → execute-all loop with circuit breaker, pause/resume, and real-time progress
- [ ] **Phase 26: Cost Intelligence** - Claude Max token tracking, external services cost page, visual alerts, and autopilot cost gate
- [ ] **Phase 27: Card UX Polish** - GitHub issues links, Archive All, dynamic GSD shortcuts, message tab styling, and pause card

---

## Phase Details

### Phase 17: Task Data Layer
**Goal**: The backend can store and serve per-project tasks
**Depends on**: Nothing (new table and routes)
**Requirements**: STORE-01, STORE-02, STORE-03, STORE-04
**Success Criteria** (what must be TRUE):
  1. A `project_tasks` table exists in SQLite with id, project_key, title, description, archived, and created_at columns
  2. POST /api/gsd/projects/:key/tasks creates a task and returns it with a generated id and timestamp
  3. GET /api/gsd/projects/:key/tasks returns open tasks by default and archived tasks when the filter is set
  4. PATCH /api/gsd/projects/:key/tasks/:id updates title, description, or archived status and returns the updated task
**Plans**: 2 plans

Plans:
- [x] 17-01-PLAN.md — project_tasks schema + stmts + POST/GET/PATCH routes
- [x] 17-02-PLAN.md — task endpoint tests in api.test.js

### Phase 18: Task UI
**Goal**: Users can manage tasks for each project from the project drawer
**Depends on**: Phase 17
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05
**Success Criteria** (what must be TRUE):
  1. Opening a project drawer shows a Tasks tab as the first tab, before Message and GSD file tabs
  2. User can type a title (required) and optional description and submit to create a task that appears in the list immediately
  3. Open tasks are listed under the Tasks tab with their title and description visible
  4. Each task row has an archive action; clicking it removes the task from the open list
  5. A toggle switches the view to archived tasks, where each task has an unarchive action that moves it back to open
**Plans**: 2 plans

Plans:
- [x] 18-01-PLAN.md — GsdTask type + api.gsd.tasks methods (list/create/update)
- [x] 18-02-PLAN.md — TasksTab component + wire into GsdDrawer as first tab

### Phase 18.1: Persistent Tunnel for Remote Tmux (INSERTED)
**Goal:** Replace the ephemeral Cloudflare Quick Tunnel with a named Cloudflare Tunnel that has a permanent subdomain, so Railway's GSD_DATA_URL is set once and never needs updating
**Requirements**: none (inserted phase, no formal requirement IDs)
**Depends on:** Phase 18
**Plans:** 2/2 plans complete

Plans:
- [x] 18.1-01-PLAN.md — Rewrite tunnel.sh for named tunnel + systemd service unit + one-time setup script
- [x] 18.1-02-PLAN.md — Verify tunnel prerequisites, set Railway GSD_DATA_URL, deploy, and end-to-end verify

### Phase 19: Clipboard Export
**Goal**: Users can copy all open tasks as formatted markdown for pasting into GSD commands
**Depends on**: Phase 18
**Requirements**: CLIP-01, CLIP-02
**Success Criteria** (what must be TRUE):
  1. A "Copy all" button is visible in the Tasks tab when at least one open task exists
  2. Clicking the button copies all open tasks to the clipboard as `- **Title** — description` lines (one per task) and shows a confirmation to the user
**Plans**: 1 plan

Plans:
- [x] 19-01-PLAN.md — Add Copy all button with clipboard logic to TasksTab

### Phase 20: Fix Railway Deployment
**Goal:** Deploy the dequal-patch fix and add a post-build dist assertion so the live dashboard reflects recent client changes and future deploys cannot silently ship stale builds
**Requirements**: none
**Depends on:** none (hotfix, runs independently)
**Plans:** 1/1 plans complete

Plans:
- [x] 20-01-PLAN.md — add verify-build.sh safeguard, deploy to Railway, verify live dashboard

### Phase 21: Card UX Simplification
**Goal**: Users can filter the project grid by session state and see only the information that matters on each card
**Depends on**: Phase 20
**Requirements**: CARD-01, CARD-02, CARD-03, CARD-04
**Success Criteria** (what must be TRUE):
  1. Clicking a state box (Working/Waiting/Paused/Archived) filters the grid to show only projects in that state
  2. The dashboard shows only Waiting projects by default when first loaded
  3. A "Show All" button is visible and clicking it displays all non-archived projects regardless of state
  4. Each project card shows only project name, state indicator, status badges, live URL, and Open Terminal
**Plans**: 2 plans

Plans:
- [x] 21-01-PLAN.md — State filter bar: clickable stat boxes, default Waiting, Show All button
- [x] 21-02-PLAN.md — Slim card face: remove progress/stats/next-action/blockers/roadmap from card

### Phase 22: Mobile Terminal Fixes
**Goal**: The terminal overlay is comfortable to use on a mobile device without zoom, focus, or scroll annoyances
**Depends on**: Phase 21
**Requirements**: MOB-01, MOB-02, MOB-03
**Success Criteria** (what must be TRUE):
  1. Scrolling the terminal overlay on a touch device moves at a comfortable speed without overshooting
  2. Opening the keyboard on iOS does not cause the viewport to zoom in
  3. Tapping Esc, arrow keys, or other special key buttons in the terminal does not shift scroll position or move focus away from the terminal input
**Plans**: 1 plan

Plans:
- [x] 22-01-PLAN.md — Viewport zoom fix + touch scroll damping + special key focus re-focus

### Phase 23: Task Textarea and MCP Server
**Goal**: Task descriptions support multi-line input and Claude Desktop can read all tracked GSD project planning files via MCP
**Depends on**: Phase 21
**Requirements**: TASK-01, MCP-01
**Success Criteria** (what must be TRUE):
  1. The task description field is a textarea that grows vertically as text is typed, up to a maximum height, and does not require horizontal scrolling
  2. Claude Desktop (or any MCP client) can connect to the MCP server and retrieve PROJECT.md, STATE.md, ROADMAP.md, and REQUIREMENTS.md for any tracked GSD project by name
**Plans**: 2 plans

Plans:
- [x] 23-01-PLAN.md — Auto-growing textarea replacing description input in TasksTab
- [x] 23-02-PLAN.md — GSD planning tools domain in MCP server (gsd_list_projects + gsd_read_planning_file)

---

### Phase 24: Waiting Accuracy + Safety Foundation
**Goal**: "Waiting" state correctly means waiting on human input, and the database and backend infrastructure required for safe autopilot operation is in place
**Depends on**: Phase 23
**Requirements**: UX-01, UX-02, AUTO-05
**Success Criteria** (what must be TRUE):
  1. A project card shows "Waiting" only when the terminal session has paused and is awaiting human keypress — agent-thinking and processing phases show "Working"
  2. Closing the terminal overlay automatically refreshes the card's state within 2 seconds without a full page reload
  3. SQLite contains the four new tables (autopilot_runs, claude_api_usage, external_service_costs, process_registry) and all migration scripts run cleanly
  4. The autopilot backend can spawn a GSD command detached from the Express event loop and return a job ID immediately — no blocking
  5. The circuit breaker logic halts a simulated autopilot run after 3 consecutive failures on the same phase and marks the run as paused
**Plans**: 2 plans

Plans:
- [ ] 24-01-PLAN.md — Waiting state accuracy: refined tmux timer patterns + terminal close auto-refresh
- [ ] 24-02-PLAN.md — Safety foundation: SQLite autopilot schema + CircuitBreaker class + processSpawner

### Phase 25: Autopilot Core
**Goal**: Users can launch and control an autonomous plan-all → execute-all loop for any project from the dashboard
**Depends on**: Phase 24
**Requirements**: AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-06, AUTO-07
**Success Criteria** (what must be TRUE):
  1. Clicking "Plan All" on a project card triggers batch planning of all remaining phases and shows real-time progress via the existing WebSocket feed
  2. Clicking "Run Autopilot" launches the autonomous execution loop — the dashboard card updates as each phase is planned and executed without any user input
  3. Clicking "Pause" on an active autopilot run stops the loop at the next safe point (end of current phase) and shows "Paused" on the card
  4. Clicking "Resume" on a paused run restarts the loop from the next pending phase
  5. When a phase fails, the autopilot stores the failure context, adjusts the retry prompt, and attempts the phase again before counting it as a failure toward the circuit breaker limit
**Plans**: TBD

Plans:
- [ ] 25-01: AutopilotManager class — watchLoop, STATE.md monitoring, phase chaining, failure learning
- [ ] 25-02: Autopilot API routes — /api/autopilot/start, /pause, /resume, /status
- [ ] 25-03: Autopilot UI — Plan All button, Run Autopilot button, pause/resume controls, real-time progress display on cards

### Phase 26: Cost Intelligence
**Goal**: Users can see real-time Claude Max token consumption and external service costs, and autopilot is gated by configurable cost limits
**Depends on**: Phase 24
**Requirements**: COST-01, COST-02, COST-03, COST-04, COST-05, COST-06
**Success Criteria** (what must be TRUE):
  1. A Cost Intelligence page shows Claude Max session and weekly token usage as a progress bar with color coding (green below 80%, yellow 80-95%, red above 95%)
  2. The cost page shows current status and estimated cost for Railway, GitHub, Claude, and OpenAI with a data freshness timestamp on every figure
  3. Per-project cost badges are visible on each project card showing token spend during any active autopilot run
  4. When token usage reaches the configured threshold, autopilot automatically pauses and sends a Telegram alert
  5. Manual refresh respects a 60-second frontend debounce and 5-minute backend rate limit; stale data (over 6 hours old) is visually flagged in red
**Plans**: TBD

Plans:
- [ ] 26-01: Cost backend — Anthropic Admin API integration, SQLite caching, /api/cost/* routes
- [ ] 26-02: Cost Intelligence React page — progress bars, service breakdown, burn rate, freshness indicators
- [ ] 26-03: Autopilot cost gate — pre-execution budget check, auto-pause on threshold breach, cost badges on cards

### Phase 27: Card UX Polish
**Goal**: Project cards surface GitHub issues, dynamic GSD shortcuts, a pause state, and the message log distinguishes human vs Claude messages
**Depends on**: Phase 25
**Requirements**: UX-03, UX-04, UX-05, UX-06, UX-07
**Success Criteria** (what must be TRUE):
  1. Each project card shows a link to the project's GitHub issues page (if configured) that opens in a new tab
  2. After clicking "Copy" in the Tasks tab, the UI suggests "Archive All?" with a one-click confirm that archives all open tasks
  3. Each project card shows the recommended next GSD command based on the current phase state (e.g., "/gsd:execute-phase 25" when a phase is planned but not yet executed)
  4. A project card can be set to "Paused" state from the dashboard, showing a distinct visual indicator and suppressing autopilot from targeting that project
  5. The Messages tab renders Claude messages with a distinct background and right-alignment, and human messages with a different background and left-alignment
**Plans**: TBD

Plans:
- [ ] 27-01: GitHub issues link + Archive All suggestion + dynamic shortcuts on cards
- [ ] 27-02: Pause card state — backend pause field, visual indicator, autopilot exclusion
- [ ] 27-03: Message tab styling — distinguish Claude vs human messages by background color and alignment

---

## Progress Table

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Configuration | v1.0 | 3/3 | Complete | 2026-03-18 |
| 2. Backend Data Pipeline | v1.0 | 2/2 | Complete | 2026-03-18 |
| 3. Frontend Dashboard | v1.0 | 3/3 | Complete | 2026-03-18 |
| 4. Backend File API | v1.1 | 2/2 | Complete | 2026-03-21 |
| 5. Card Enhancements | v1.1 | 2/2 | Complete | 2026-03-21 |
| 6. Drawer and Full-Screen Viewer | v1.1 | 3/3 | Complete | 2026-03-21 |
| 7. Agent Data Proxy | v1.2 | 2/2 | Complete | 2026-03-22 |
| 8. GSD Card Stats | v1.2 | 2/2 | Complete | 2026-03-23 |
| 9. Tmux Backend Wiring | v2.0 | 2/2 | Complete | 2026-03-24 |
| 10. Smart Send UI | v2.0 | 2/2 | Complete | 2026-03-24 |
| 11. Live Terminal Overlay | v2.0 | 2/2 | Complete | 2026-03-25 |
| 12. Session State Indicators | v2.1 | 3/3 | Complete | 2026-03-26 |
| 13. Terminal UX | v2.1 | 2/2 | Complete | 2026-03-26 |
| 13.1 Mobile Terminal Polish & Message Log | v2.1 | 3/3 | Complete | 2026-03-27 |
| 14. Telegram Integration | v2.1 | 2/2 | Complete | 2026-03-28 |
| 16. OOM Prevention | v2.1 | 1/1 | Complete | 2026-03-28 |
| 17. Task Data Layer | v2.2 | 2/2 | Complete | 2026-03-28 |
| 18. Task UI | v2.2 | 2/2 | Complete | 2026-03-28 |
| 18.1. Persistent Tunnel for Remote Tmux | v2.2 | 2/2 | Complete | 2026-03-29 |
| 19. Clipboard Export | v2.2 | 1/1 | Complete | 2026-03-29 |
| 20. Fix Railway Deployment | v2.2 | 1/1 | Complete | 2026-03-30 |
| 21. Card UX Simplification | v2.3 | 2/2 | Complete | 2026-03-30 |
| 22. Mobile Terminal Fixes | v2.3 | 1/1 | Complete | 2026-03-30 |
| 23. Task Textarea and MCP Server | v2.3 | 2/2 | Complete | 2026-03-30 |
| 24. Waiting Accuracy + Safety Foundation | 2/2 | Complete   | 2026-04-01 | - |
| 25. Autopilot Core | v3.0 | 0/3 | Not started | - |
| 26. Cost Intelligence | v3.0 | 0/3 | Not started | - |
| 27. Card UX Polish | v3.0 | 0/3 | Not started | - |

---

## Deferred

### Phase 15: New Project Creation (Deferred to v3.1+)
**Goal**: Users can create a new GSD project — directory, tmux session, and Claude Code launch — from a single button in the dashboard
**Depends on**: Phase 9
**Requirements**: CREATE-01, CREATE-02, CREATE-03, CREATE-04
**Success Criteria** (what must be TRUE):
  1. A "New project" button is visible in the GSD tab header at all times
  2. Clicking the button prompts for a project name; submitting creates the directory and a new tmux session named after the project
  3. The backend sends `claude` followed by `/gsd:new-project` as the first input into the new tmux session so the project scaffold starts automatically
  4. The new project's card appears in the dashboard grid immediately after creation without requiring a page refresh
**Status**: Deferred to v3.1+
