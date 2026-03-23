# Roadmap: GSD Dashboard

## Milestones

- [x] **v1** — Foundation, backend data pipeline, frontend dashboard UI, Railway deployment (2026-03-18) → [archive](.planning/milestones/v1-ROADMAP.md)
- [x] **v1.1** — File Viewer & Card Enhancements (completed 2026-03-21)
- [ ] **v1.2** — GSD Stats & Live Data Pipeline (in progress)

---

## v1.1 Phases

- [x] **Phase 4: Backend File API** — Parse version/URL from PROJECT.md and expose a file-content endpoint for planning files
- [x] **Phase 5: Card Enhancements** — Display version badge and live URL on cards; wire click to open drawer
- [x] **Phase 6: Drawer and Full-Screen Viewer** — Side drawer with file tabs rendering markdown; full-screen markdown view

## v1.2 Phases

- [ ] **Phase 7: Agent Data Proxy** — Proxy agent API requests through GSD_DATA_URL so Railway shows live session data from the local machine
- [ ] **Phase 8: GSD Card Stats** — Enrich /api/gsd/projects with blockers/velocity/streak/TTL/nextAction and render all stats on project cards
- [ ] **Phase 9: Active Session Pulse** — Show a live green pulse on a project card when a Claude Code session is active in that project's directory

---

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
- [x] 06-02-PLAN.md — Build GsdDrawer with four file tabs and inline markdown rendering
- [x] 06-03-PLAN.md — Add MarkdownViewer full-screen overlay and wire expand control

### Phase 7: Agent Data Proxy
**Goal**: Users can see real agent session and event data on the Railway-hosted dashboard, not an empty database
**Depends on**: Phase 6
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. Opening the agent dashboard at the Railway URL shows the same sessions, events, and stats that exist on the local machine
  2. Agent data API routes on Railway transparently forward to the local server through the same GSD_DATA_URL tunnel already used for planning files
  3. The local server exposes sessions, agents, events, stats, and analytics endpoints reachable by the Railway proxy
  4. When running locally without GSD_DATA_URL set, all agent data routes are served directly from the local SQLite database with no proxy involved
**Plans**: 2 plans
Plans:
- [x] 07-01-PLAN.md — Create createAgentProxy middleware in server/routes/proxy.js; mount in index.js before agent routers; update basicAuth to skip agent GET routes
- [x] 07-02-PLAN.md — Add proxy behavior tests: proxied GET, non-proxied POST, local fallthrough without GSD_DATA_URL

### Phase 8: GSD Card Stats
**Goal**: Every project card shows next action, blocked status, velocity, streak, and time-to-completion — all computed server-side and rendered without any manual file parsing in the browser
**Depends on**: Phase 7
**Requirements**: NEXT-01, NEXT-02, BLOCK-01, BLOCK-02, BLOCK-03, VEL-01, VEL-02, VEL-03, TTL-01, TTL-02, TTL-03, TTL-04
**Success Criteria** (what must be TRUE):
  1. A project card shows the next action line from STATE.md, or nothing at all if STATE.md has no next action recorded
  2. A project with one or more blockers shows a visible "Blocked" badge and sorts to the top of the project grid; unblocked projects are unaffected
  3. Each project card displays plans completed in the last 7 days (velocity) and consecutive days with at least one completed plan (streak)
  4. Each project card shows a human-readable time-to-completion estimate (e.g. "~2 days") when enough data exists, and shows nothing when it cannot be computed
  5. The `/api/gsd/projects` response includes `nextAction`, `blockers`, `velocity`, `streak`, `estimatedCompletion` fields so the frontend renders stats without re-parsing files
**Plans**: 2 plans
Plans:
- [x] 08-01-PLAN.md — Extend readers.js: next_action in readState(), velocity/streak/estimatedCompletion in readProject(); 4 new tests
- [ ] 08-02-PLAN.md — Frontend: update GsdState/GsdProject types, render Blocked badge + next action + stats row in ProjectCard, sort blocked projects first

### Phase 9: Active Session Pulse
**Goal**: Users see at a glance whether Claude Code is actively running in a project's directory, with the indicator updating live without a page refresh
**Depends on**: Phase 8
**Requirements**: SESS-01, SESS-02, SESS-03
**Success Criteria** (what must be TRUE):
  1. A project card shows a green pulse indicator when at least one agent session has status "active" and a working directory matching that project's root
  2. The pulse indicator disappears in real time when the active session ends — no manual refresh required
  3. When no session is active for a project, the card shows no pulse and no empty placeholder
**Plans**: TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. Backend File API | 2/2 | Complete | 2026-03-21 |
| 5. Card Enhancements | 2/2 | Complete | 2026-03-21 |
| 6. Drawer and Full-Screen Viewer | 3/3 | Complete | 2026-03-21 |
| 7. Agent Data Proxy | 2/2 | Complete | 2026-03-22 |
| 8. GSD Card Stats | 1/2 | In Progress | - |
| 9. Active Session Pulse | 0/? | Not started | - |
