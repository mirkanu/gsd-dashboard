# Requirements: GSD Dashboard

**Defined:** 2026-03-28
**Core Value:** At a glance, see where every GSD project stands and interact with any session

## v2.2 Requirements (Complete)

### Data Storage

- [x] **STORE-01**: SQLite table `project_tasks` stores tasks with id, project_key, title, description, archived flag, and created_at timestamp
- [x] **STORE-02**: API endpoint creates a task for a given project (POST /api/gsd/projects/:key/tasks)
- [x] **STORE-03**: API endpoint lists tasks for a project with archived filter (GET /api/gsd/projects/:key/tasks)
- [x] **STORE-04**: API endpoint updates a task's title, description, or archived status (PATCH /api/gsd/projects/:key/tasks/:id)

### Task UI

- [x] **UI-01**: Tasks tab appears as the first tab in the project drawer (before Message and GSD file tabs)
- [x] **UI-02**: User can add a task with a required title and optional description
- [x] **UI-03**: User can view list of open tasks for a project
- [x] **UI-04**: User can archive a task from the task list
- [x] **UI-05**: User can toggle to view archived tasks and unarchive them

### Clipboard Export

- [x] **CLIP-01**: "Copy all" button formats all open tasks as markdown and copies to clipboard
- [x] **CLIP-02**: Copied format uses `- **Title** — description` per task, ready for GSD consumption

## v2.3 Requirements

Requirements for milestone v2.3 — UX Polish & Claude Desktop. Each maps to roadmap phases.

### Card UX

- [x] **CARD-01**: User can click a state box (Working/Waiting/Paused/Archived) to filter the project grid to only that state's cards
- [x] **CARD-02**: Dashboard defaults to showing Waiting cards on load
- [x] **CARD-03**: A "Show All" button displays all non-archived projects regardless of state filter
- [ ] **CARD-04**: Project cards show only: project name, state indicator, status badges, live URL, and Open Terminal — stats, progress, next action, and blockers are removed from the card face

### Mobile Terminal

- [ ] **MOB-01**: Terminal overlay touch scroll speed is reduced to a comfortable level (mobile only)
- [ ] **MOB-02**: iOS keyboard opening does not cause the viewport to zoom (mobile only, applies globally)
- [ ] **MOB-03**: Tapping special key buttons (Esc, arrows, etc) in the terminal does not shift focus or scroll position (mobile only)

### Task UX

- [ ] **TASK-01**: Task description field is a multi-line textarea that auto-grows as content increases, with a max height limit

### Integration

- [ ] **MCP-01**: An MCP server exposes .planning/ files (PROJECT.md, STATE.md, ROADMAP.md, REQUIREMENTS.md) for all tracked GSD projects so Claude Desktop can read them

## Future Requirements

Deferred to v3.0+.

### Project Creation

- **CREATE-01**: User can create a new GSD project from the dashboard
- **CREATE-02**: Dashboard creates directory and tmux session for new project
- **CREATE-03**: Dashboard launches Claude with /gsd:new-project in new session
- **CREATE-04**: New project card appears immediately without refresh

## Out of Scope

| Feature | Reason |
|---------|--------|
| Task due dates / priorities | Overkill for simple notes; GSD handles prioritization |
| Drag-and-drop reordering | Complexity not justified |
| Task assignments | Single developer tool |
| Cross-project task views | Per-project scope is sufficient |
| Rich text editing | Markdown plain text is sufficient |
| Moved card info (stats/progress) to drawer | Removed from cards, not relocated — viewable via GSD file tabs |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STORE-01 | Phase 17 | Complete |
| STORE-02 | Phase 17 | Complete |
| STORE-03 | Phase 17 | Complete |
| STORE-04 | Phase 17 | Complete |
| UI-01 | Phase 18 | Complete |
| UI-02 | Phase 18 | Complete |
| UI-03 | Phase 18 | Complete |
| UI-04 | Phase 18 | Complete |
| UI-05 | Phase 18 | Complete |
| CLIP-01 | Phase 19 | Complete |
| CLIP-02 | Phase 19 | Complete |
| CARD-01 | Phase 21 | Complete |
| CARD-02 | Phase 21 | Complete |
| CARD-03 | Phase 21 | Complete |
| CARD-04 | Phase 21 | Pending |
| MOB-01 | Phase 22 | Pending |
| MOB-02 | Phase 22 | Pending |
| MOB-03 | Phase 22 | Pending |
| TASK-01 | Phase 23 | Pending |
| MCP-01 | Phase 23 | Pending |

**Coverage:**
- v2.3 requirements: 9 total
- Mapped to phases: 9
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-30 after v2.3 roadmap creation (Phases 21-23)*
