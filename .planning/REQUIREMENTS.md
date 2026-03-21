# Requirements: GSD Dashboard v1.1

**Defined:** 2026-03-18
**Core Value:** Drill into any project's planning files directly from the dashboard — no more opening files manually.

## v1.1 Requirements

### Card Enhancements

- [x] **CARD-01**: Each project card displays the current version (e.g. "v1") parsed from the project's PROJECT.md
- [x] **CARD-02**: Each project card displays a clickable link to the project's live URL parsed from the project's PROJECT.md
- [ ] **CARD-03**: Clicking a project card (outside of existing interactive elements) opens a side drawer for that project

### File Drawer

- [ ] **DRAW-01**: The drawer shows tabs for STATE.md, ROADMAP.md, REQUIREMENTS.md, and the active phase's PLAN.md
- [ ] **DRAW-02**: Each tab renders the file's content as formatted markdown (not raw text)
- [ ] **DRAW-03**: Clicking a tab/file within the drawer opens it full-screen with beautiful rendered markdown formatting
- [ ] **DRAW-04**: The full-screen view has a close/back control to return to the drawer
- [ ] **DRAW-05**: The active PLAN.md tab resolves the correct plan file based on the current phase from STATE.md

### Backend

- [x] **API-01**: The backend parses version and live URL from each project's PROJECT.md and includes them in the `/api/gsd/projects` response
- [x] **API-02**: A new endpoint `GET /api/gsd/projects/:name/files/:filename` serves raw markdown content for a given planning file
- [x] **API-03**: The file endpoint supports: `state`, `roadmap`, `requirements`, and `plan` as filename identifiers (resolved to actual file paths server-side)

## Future Requirements (deferred)

- Auto-refresh GSD data every N minutes (configurable interval)
- Phase timeline / Gantt-style view across projects
- Named Cloudflare Tunnel for stable permanent URL
- Browser notification when a phase completes
- Trend graph showing requirements coverage over time

## Out of Scope (v1.1)

| Feature | Reason |
|---------|--------|
| Editing planning files from the drawer | Read-only tool — edits belong in the editor |
| Syntax highlighting for markdown code blocks | Nice-to-have, defer to later |
| Search/filter across planning file content | Scope creep for this milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CARD-01 | Phase 5 | Complete |
| CARD-02 | Phase 5 | Complete |
| CARD-03 | Phase 5 | Pending |
| DRAW-01 | Phase 6 | Pending |
| DRAW-02 | Phase 6 | Pending |
| DRAW-03 | Phase 6 | Pending |
| DRAW-04 | Phase 6 | Pending |
| DRAW-05 | Phase 6 | Pending |
| API-01 | Phase 4 | Complete |
| API-02 | Phase 4 | Complete |
| API-03 | Phase 4 | Complete |

**Coverage:**
- v1.1 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
