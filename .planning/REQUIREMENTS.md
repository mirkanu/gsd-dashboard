# Requirements: GSD Dashboard

**Defined:** 2026-03-28
**Core Value:** At a glance, see where every GSD project stands and interact with any session

## v2.2 Requirements

Requirements for milestone v2.2 — Project Tasks. Each maps to roadmap phases.

### Data Storage

- [ ] **STORE-01**: SQLite table `project_tasks` stores tasks with id, project_key, title, description, archived flag, and created_at timestamp
- [ ] **STORE-02**: API endpoint creates a task for a given project (POST /api/gsd/projects/:key/tasks)
- [ ] **STORE-03**: API endpoint lists tasks for a project with archived filter (GET /api/gsd/projects/:key/tasks)
- [ ] **STORE-04**: API endpoint updates a task's title, description, or archived status (PATCH /api/gsd/projects/:key/tasks/:id)

### Task UI

- [ ] **UI-01**: Tasks tab appears as the first tab in the project drawer (before Message and GSD file tabs)
- [ ] **UI-02**: User can add a task with a required title and optional description
- [ ] **UI-03**: User can view list of open tasks for a project
- [ ] **UI-04**: User can archive a task from the task list
- [ ] **UI-05**: User can toggle to view archived tasks and unarchive them

### Clipboard Export

- [ ] **CLIP-01**: "Copy all" button formats all open tasks as markdown and copies to clipboard
- [ ] **CLIP-02**: Copied format uses `- **Title** — description` per task, ready for GSD consumption

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
| Drag-and-drop reordering | Complexity not justified for v2.2 |
| Task assignments | Single developer tool |
| Cross-project task views | Per-project scope is sufficient |
| Rich text editing | Markdown plain text is sufficient |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| STORE-01 | — | Pending |
| STORE-02 | — | Pending |
| STORE-03 | — | Pending |
| STORE-04 | — | Pending |
| UI-01 | — | Pending |
| UI-02 | — | Pending |
| UI-03 | — | Pending |
| UI-04 | — | Pending |
| UI-05 | — | Pending |
| CLIP-01 | — | Pending |
| CLIP-02 | — | Pending |

**Coverage:**
- v2.2 requirements: 11 total
- Mapped to phases: 0
- Unmapped: 11 ⚠️

---
*Requirements defined: 2026-03-28*
*Last updated: 2026-03-28 after initial definition*
