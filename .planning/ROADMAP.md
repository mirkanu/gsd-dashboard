# Roadmap: GSD Dashboard

## Milestones

- ✅ **v1.0 Foundation** - Phases 1-3 (shipped 2026-03-18)
- ✅ **v1.1 File Viewer** - Phases 4-6 (shipped 2026-03-21)
- ✅ **v1.2 Live Data** - Phases 7-8 (shipped 2026-03-23)
- ✅ **v2.0 Control Plane** - Phases 9-11 (shipped 2026-03-25)
- ✅ **v2.1 Session Intelligence** - Phases 12-16 (shipped 2026-03-28)
- ✅ **v2.2-2.3 Card UX & Mobile** - Phases 17-19 (shipped 2026-03-30)
- ✅ **v3.0 Autopilot** - Phases 20-27 (shipped 2026-04-03)
- ✅ **v4.0 Chat-First Dashboard** - Phases 28-32 (shipped 2026-04-04)
- ✅ **v4.1 Chat Polish → Terminal-First** - Phases 33-36 + quick tasks 24-30 (shipped 2026-04-06)
- 🚧 **v4.2 Cost Intelligence, Auth & UX Polish** - Phases 37-42 (in progress)

## Phases

<details>
<summary>✅ v4.1 Chat Polish → Terminal-First (Phases 33-36) — SHIPPED 2026-04-06</summary>

- [x] Phase 33: Classifier Foundation (1/1 plans) — completed 2026-04-04
- [x] Phase 34: Feedback Pipeline (1/1 plans) — completed 2026-04-04
- [x] Phase 35: Feedback UI + Send Experience (2/2 plans) — completed 2026-04-05
- [x] Phase 36: Message Rendering + New Types (2/2 plans) — completed 2026-04-05

**Note:** Phases 33-36 built chat features (classifier, feedback, message rendering) which were then superseded by the terminal-first pivot (quick tasks 24-30). Chat window, classifier, and feedback pipeline were removed. See [v4.1-ROADMAP.md](./milestones/v4.1-ROADMAP.md) for full archive.

Quick tasks: #24 lazy-load, #25 perf fixes, #27 terminal-first layout, #28 mobile UX, #29 async tmux, #30 dead code cleanup.

</details>

### 🚧 v4.2 Cost Intelligence, Auth & UX Polish (In Progress)

**Milestone Goal:** Add cost/service tracking, fix auth and terminal reliability, and polish the desktop UX with resizable columns and configurable CLAUDE.md editing.

## Phase Summary

- [x] **Phase 37: Auth & Terminal Reliability** - Persistent login and keep-alive terminal connection (completed 2026-04-07)
- [x] **Phase 38: Terminal Light Mode & Status Colors** - Fix invisible text and wrong status colors in light mode (completed 2026-04-07)
- [x] **Phase 39: Resizable Columns** - Drag handles for desktop 3-column layout with persisted widths (completed 2026-04-07)
- [x] **Phase 40: External Services Dashboard** - New page listing all external services with live status (completed 2026-04-07)
- [x] **Phase 41: Claude Usage Tracking** - Token usage data layer, SQLite persistence, and usage UI (completed 2026-04-08)
- [ ] **Phase 42: Configuration UI** - CLAUDE.md editor, verbosity settings, and Telegram notification config

## Phase Details

### Phase 37: Auth & Terminal Reliability
**Goal**: Users can authenticate once and keep a live terminal connection indefinitely
**Depends on**: Phase 36 (v4.1 complete)
**Requirements**: AUTH-01, AUTH-02, TERM-01, TERM-02
**Success Criteria** (what must be TRUE):
  1. User logs in once and remains authenticated across browser reloads for at least 30 days
  2. The login modal does not appear on page reload when the session is still valid
  3. A terminal session left idle for 10+ minutes does not disconnect
  4. If the terminal WebSocket drops, it reconnects automatically without any user action
**Plans**: 2 plans

Plans:
- [ ] 37-01-PLAN.md — Cookie-based auth: login/logout endpoint + client gate
- [ ] 37-02-PLAN.md — Terminal WebSocket keepalive + auto-reconnect

### Phase 38: Terminal Light Mode & Status Colors
**Goal**: Terminal is fully legible in light mode and status badges use the correct colors
**Depends on**: Phase 37
**Requirements**: TERM-03, TERM-04, UX-03
**Success Criteria** (what must be TRUE):
  1. Text selected in the terminal is visibly highlighted against the white background in light mode
  2. GSD selection query title text is readable in light mode (not white-on-white)
  3. Waiting status badge displays in blue
  4. Paused status badge displays in orange
**Plans**: 1 plan

Plans:
- [ ] 38-01-PLAN.md — xterm selectionBackground + terminal header button hover + blue/orange status badges

### Phase 39: Resizable Columns
**Goal**: Users can resize the 3-column desktop layout and their preferences stick
**Depends on**: Phase 38
**Requirements**: UX-01, UX-02
**Success Criteria** (what must be TRUE):
  1. Drag handles are visible between each column on the desktop layout
  2. User can drag a handle to widen or narrow a column
  3. Column widths are preserved after a page reload
**Plans**: 1 plan

Plans:
- [ ] 39-01-PLAN.md — useResizableColumns hook + drag handle wiring in GSD.tsx

### Phase 40: External Services Dashboard
**Goal**: Users can see all external services used by each project with live status on a dedicated page
**Depends on**: Phase 37
**Requirements**: COST-01, COST-02
**Success Criteria** (what must be TRUE):
  1. A services page is accessible from the main navigation
  2. The services page lists all configured external services (Railway, Vercel, Resend, GitHub, Claude, OpenAI) grouped by project
  3. Each service entry shows a live status indicator (up/down/degraded) fetched from the service's status API
**Plans**: 1 plan

Plans:
- [ ] 40-01-PLAN.md — Server status endpoint + ServicesPage component + sidebar nav entry

### Phase 41: Claude Usage Tracking
**Goal**: Users can see Claude Max token consumption per session and over the rolling week
**Depends on**: Phase 40
**Requirements**: COST-03, COST-04
**Success Criteria** (what must be TRUE):
  1. Token usage for the current session is visible on the project card or detail panel
  2. A weekly aggregate of token usage is displayed with a limit indicator
  3. Usage data survives server restarts (persisted in SQLite)
  4. Historical usage trend is visible (at minimum a simple count over past sessions)
**Plans**: 2 plans

Plans:
- [ ] 41-01-PLAN.md — Server APIs: per-project session cost, usage history, enhanced window endpoint
- [ ] 41-02-PLAN.md — Client UI: session cost on metadata, weekly gauge, 7-day trend sparkline

### Phase 42: Configuration UI
**Goal**: Users can view and edit CLAUDE.md files and configure notifications from the dashboard
**Depends on**: Phase 41
**Requirements**: CFG-01, CFG-02, CFG-03, NOTIF-01, NOTIF-02
**Success Criteria** (what must be TRUE):
  1. User can open and read both the global CLAUDE.md and any per-project CLAUDE.md from the dashboard
  2. User can edit and save a CLAUDE.md file directly in the dashboard without leaving the browser
  3. User can set Claude session verbosity (e.g., verbose/normal/quiet) per project from the dashboard
  4. User can configure which Telegram alerts fire per project from the dashboard
  5. Notification and verbosity settings are stored in SQLite and survive server restarts
**Plans**: 2 plans

Plans:
- [ ] 42-01-PLAN.md — Server APIs: CLAUDE.md read/write endpoints + project_settings SQLite table
- [ ] 42-02-PLAN.md — Client UI: ConfigPage with CLAUDE.md editor, verbosity select, notification toggles

## Progress

**Execution Order:** 37 → 38 → 39 → 40 → 41 → 42

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 37. Auth & Terminal Reliability | 2/2 | Complete    | 2026-04-07 | - |
| 38. Terminal Light Mode & Status Colors | 1/1 | Complete    | 2026-04-07 | - |
| 39. Resizable Columns | 1/1 | Complete    | 2026-04-07 | - |
| 40. External Services Dashboard | 1/1 | Complete    | 2026-04-07 | - |
| 41. Claude Usage Tracking | 2/2 | Complete    | 2026-04-08 | - |
| 42. Configuration UI | v4.2 | 0/2 | Not started | - |
