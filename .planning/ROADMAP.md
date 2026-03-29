# Roadmap: GSD Dashboard

## Milestones

- ✅ **v1.0 Foundation** — Phases 1-3 (shipped 2026-03-18) → [archive](milestones/v1-ROADMAP.md)
- ✅ **v1.1 File Viewer & Card Enhancements** — Phases 4-6 (shipped 2026-03-21) → [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 GSD Stats & Live Data Pipeline** — Phases 7-8 (shipped 2026-03-23) → [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v2.0 Project Control Plane** — Phases 9-11 (shipped 2026-03-25) → [archive](milestones/v2.0-ROADMAP.md)
- ✅ **v2.1 Session Intelligence & Terminal UX** — Phases 12-14, 16 (shipped 2026-03-28) → [archive](milestones/v2.1-ROADMAP.md)
- 🚧 **v2.2 Project Tasks** — Phases 17-19 (in progress)

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

### 🚧 v2.2 Project Tasks

- [x] **Phase 17: Task Data Layer** — SQLite table and CRUD API endpoints for per-project tasks (completed 2026-03-28)
- [x] **Phase 18: Task UI** — Tasks tab in project drawer with add, view, archive, and unarchive interactions (completed 2026-03-28)
- [x] **Phase 19: Clipboard Export** — Copy all open tasks as formatted markdown for GSD consumption (completed 2026-03-29)

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
- [ ] 17-01-PLAN.md — project_tasks schema + stmts + POST/GET/PATCH routes
- [ ] 17-02-PLAN.md — task endpoint tests in api.test.js

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
- [ ] 18-01-PLAN.md — GsdTask type + api.gsd.tasks methods (list/create/update)
- [ ] 18-02-PLAN.md — TasksTab component + wire into GsdDrawer as first tab

### Phase 18.1: Persistent Tunnel for Remote Tmux (INSERTED)

**Goal:** Replace the ephemeral Cloudflare Quick Tunnel with a named Cloudflare Tunnel that has a permanent subdomain, so Railway's GSD_DATA_URL is set once and never needs updating — restoring stable terminal overlay, re-open tmux, and session state detection from the cloud dashboard
**Requirements**: none (inserted phase, no formal requirement IDs)
**Depends on:** Phase 18
**Plans:** 2/2 plans complete

Plans:
- [ ] 18.1-01-PLAN.md — Rewrite tunnel.sh for named tunnel + systemd service unit + one-time setup script
- [ ] 18.1-02-PLAN.md — Verify tunnel prerequisites, set Railway GSD_DATA_URL, deploy, and end-to-end verify

### Phase 19: Clipboard Export
**Goal**: Users can copy all open tasks as formatted markdown for pasting into GSD commands
**Depends on**: Phase 18
**Requirements**: CLIP-01, CLIP-02
**Success Criteria** (what must be TRUE):
  1. A "Copy all" button is visible in the Tasks tab when at least one open task exists
  2. Clicking the button copies all open tasks to the clipboard as `- **Title** — description` lines (one per task) and shows a confirmation to the user
**Plans**: 1 plan

Plans:
- [ ] 19-01-PLAN.md — Add Copy all button with clipboard logic to TasksTab

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
| 17. Task Data Layer | 2/2 | Complete    | 2026-03-28 | - |
| 18. Task UI | 2/2 | Complete    | 2026-03-28 | - |
| 18.1. Persistent Tunnel for Remote Tmux | 2/2 | Complete    | 2026-03-29 | - |
| 19. Clipboard Export | 1/1 | Complete   | 2026-03-29 | - |

### Phase 20: Fix Railway deployment

**Goal:** Deploy the dequal-patch fix and add a post-build dist assertion so the live dashboard reflects recent client changes and future deploys cannot silently ship stale builds
**Requirements**: none
**Depends on:** none (hotfix, runs independently)
**Plans:** 1/1 plans complete

Plans:
- [ ] 20-01-PLAN.md — add verify-build.sh safeguard, deploy to Railway, verify live dashboard

---

## v3.0 Future

### Phase 15: New Project Creation (Deferred)
**Goal**: Users can create a new GSD project — directory, tmux session, and Claude Code launch — from a single button in the dashboard
**Depends on**: Phase 9
**Requirements**: CREATE-01, CREATE-02, CREATE-03, CREATE-04
**Success Criteria** (what must be TRUE):
  1. A "New project" button is visible in the GSD tab header at all times
  2. Clicking the button prompts for a project name; submitting creates the directory at `{base_path}/{name}` and a new tmux session named after the project
  3. The backend sends `claude` followed by `/gsd:new-project` as the first input into the new tmux session so the project scaffold starts automatically
  4. The new project's card appears in the dashboard grid immediately after creation without requiring a page refresh or manual config edit
**Status**: Deferred to v3.0
