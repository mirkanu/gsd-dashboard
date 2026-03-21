# Roadmap: GSD Dashboard

## Milestones

- [x] **v1** — Foundation, backend data pipeline, frontend dashboard UI, Railway deployment (2026-03-18) → [archive](.planning/milestones/v1-ROADMAP.md)
- [ ] **v1.1** — File Viewer & Card Enhancements (started 2026-03-18)

---

## v1.1 Phases

- [x] **Phase 4: Backend File API** — Parse version/URL from PROJECT.md and expose a file-content endpoint for planning files
- [x] **Phase 5: Card Enhancements** — Display version badge and live URL on cards; wire click to open drawer
- [ ] **Phase 6: Drawer and Full-Screen Viewer** — Side drawer with file tabs rendering markdown; full-screen markdown view

## Phase Details

### Phase 4: Backend File API
**Goal**: The API delivers richer project metadata and serves raw planning file content on demand
**Depends on**: Nothing (first v1.1 phase — builds on existing v1 server)
**Requirements**: API-01, API-02, API-03
**Success Criteria** (what must be TRUE):
  1. `/api/gsd/projects` response includes `version` and `liveUrl` fields for each project, parsed from that project's PROJECT.md
  2. `GET /api/gsd/projects/:name/files/state` returns the raw markdown content of that project's STATE.md
  3. `GET /api/gsd/projects/:name/files/plan` returns the markdown content of the active phase's PLAN.md, resolved server-side from STATE.md's current phase
  4. `GET /api/gsd/projects/:name/files/roadmap` and `.../files/requirements` each return the correct file's markdown content
**Plans**: 2 plans
Plans:
- [x] 04-01-PLAN.md — Parse version + liveUrl from PROJECT.md and extend readProject()
- [x] 04-02-PLAN.md — Add GET /api/gsd/projects/:name/files/:fileId endpoint with server-side resolution

### Phase 5: Card Enhancements
**Goal**: Each project card surfaces version and live URL, and a click anywhere on the card body opens the drawer
**Depends on**: Phase 4
**Requirements**: CARD-01, CARD-02, CARD-03
**Success Criteria** (what must be TRUE):
  1. Every project card shows a version badge (e.g. "v1") using the value returned by the API
  2. Every project card shows a clickable live URL link that opens the project's live site in a new tab without triggering the drawer
  3. Clicking the card body (outside the URL link and any other interactive elements) opens the side drawer scoped to that project
**Plans**: 2 plans
Plans:
- [x] 05-01-PLAN.md — Add version badge and live URL to project cards (type + ProjectCard component)
- [x] 05-02-PLAN.md — Wire card click to open drawer; create GsdDrawer stub component

### Phase 6: Drawer and Full-Screen Viewer
**Goal**: Users can read any planning file — STATE.md, ROADMAP.md, REQUIREMENTS.md, active PLAN.md — rendered as formatted markdown, and expand any file to full-screen
**Depends on**: Phase 5
**Requirements**: DRAW-01, DRAW-02, DRAW-03, DRAW-04, DRAW-05
**Success Criteria** (what must be TRUE):
  1. The drawer opens with four tabs (State, Roadmap, Requirements, Plan); each tab fetches and displays the file's content as rendered markdown, not raw text
  2. The Plan tab resolves and renders the active phase's PLAN.md based on the current phase recorded in STATE.md
  3. Clicking a tab's content (or an expand control) transitions to a full-screen markdown view of that file with proper heading hierarchy, lists, and tables rendered
  4. The full-screen view has a visible close/back control that returns the user to the drawer without losing their tab selection
**Plans**: 3 plans
Plans:
- [x] 06-01-PLAN.md — Install react-markdown + remark-gfm; add api.gsd.file() text-mode fetch
- [ ] 06-02-PLAN.md — Build GsdDrawer with four file tabs and inline markdown rendering
- [ ] 06-03-PLAN.md — Add MarkdownViewer full-screen overlay and wire expand control

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. Backend File API | 2/2 | Complete    | 2026-03-21 |
| 5. Card Enhancements | 2/2 | Complete    | 2026-03-21 |
| 6. Drawer and Full-Screen Viewer | 1/3 | In progress | - |
