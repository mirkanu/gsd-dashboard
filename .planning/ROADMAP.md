# Roadmap: GSD Dashboard

## Milestones

- [x] **v1** — Foundation, backend data pipeline, frontend dashboard UI, Railway deployment (2026-03-18) → [archive](.planning/milestones/v1-ROADMAP.md)
- [x] **v1.1** — File Viewer & Card Enhancements (completed 2026-03-21)
- [x] **v1.2** — GSD Stats & Live Data Pipeline (completed 2026-03-23)
- [ ] **v2.0** — Project Control Plane (in progress)

---

## v1.1 Phases

- [x] **Phase 4: Backend File API** — Parse version/URL from PROJECT.md and expose a file-content endpoint for planning files
- [x] **Phase 5: Card Enhancements** — Display version badge and live URL on cards; wire click to open drawer
- [x] **Phase 6: Drawer and Full-Screen Viewer** — Side drawer with file tabs rendering markdown; full-screen markdown view

## v1.2 Phases

- [x] **Phase 7: Agent Data Proxy** — Proxy agent API requests through GSD_DATA_URL so Railway shows live session data from the local machine
- [x] **Phase 8: GSD Card Stats** — Enrich /api/gsd/projects with blockers/velocity/streak/TTL/nextAction and render all stats on project cards

## v2.0 Phases

- [ ] **Phase 9: Tmux Backend Wiring** — Add tmux_session to project config, validate session existence, and expose a send-keys endpoint
- [ ] **Phase 10: Smart Send UI** — Add a send input to each project card with next_action pre-fill and GSD command chips
- [ ] **Phase 11: Live Terminal Overlay** — Full-screen xterm.js terminal attached to a project's tmux session via node-pty WebSocket
- [ ] **Phase 12: New Project Creation** — One-click new project flow: create directory, tmux session, launch Claude with /gsd:new-project, add to config

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
- [x] 08-02-PLAN.md — Frontend: update GsdState/GsdProject types, render Blocked badge + next action + stats row in ProjectCard, sort blocked projects first

### Phase 9: Tmux Backend Wiring
**Goal**: The backend can verify tmux session liveness for any project and send arbitrary text into that session on demand
**Depends on**: Phase 8
**Requirements**: TMX-01, TMX-02, TMX-03
**Success Criteria** (what must be TRUE):
  1. Adding a `tmux_session` name to a project entry in `gsd-projects.json` causes the API to validate whether that session is running before any tmux operation
  2. `POST /api/gsd/projects/:name/send` with a `text` body sends the text into the project's tmux session; the request succeeds only when the session is active
  3. `GET /api/gsd/projects` includes a `tmuxActive: boolean` field for every project — true when the named session exists and has at least one window, false otherwise
  4. Projects without a `tmux_session` field return `tmuxActive: false` and a 4xx error on send attempts without crashing the server
**Plans**: TBD

### Phase 10: Smart Send UI
**Goal**: Users can send any text — or a suggested next action — into a project's tmux session directly from the project card
**Depends on**: Phase 9
**Requirements**: SEND-01, SEND-02, SEND-03
**Success Criteria** (what must be TRUE):
  1. Each project card shows a send input pre-filled with the project's `next_action` from STATE.md when one is available, and blank when it is not
  2. User can clear or edit the pre-fill and submit any text; the text arrives in the project's tmux session within one second
  3. Four GSD command chips are visible below the input; clicking a chip replaces the current input value and does not immediately submit
  4. The send input and chips are hidden for projects where `tmuxActive` is false
**Plans**: TBD

### Phase 11: Live Terminal Overlay
**Goal**: Users can open a fully interactive terminal for any active project's tmux session without leaving the dashboard
**Depends on**: Phase 9
**Requirements**: TERM-01, TERM-02, TERM-03, TERM-04
**Success Criteria** (what must be TRUE):
  1. An "Open terminal" button appears on a project card only when `tmuxActive` is true; it is absent or disabled for inactive sessions
  2. Clicking the button opens a full-screen xterm.js overlay that immediately renders the live content of the project's tmux session
  3. Keystrokes typed in the overlay reach the tmux session and output from the session appears in the overlay in real time; terminal resize events are forwarded so line-wrapping is correct
  4. Closing the overlay (via Escape or a visible close button) disconnects the WebSocket and detaches from the tmux session without killing it; reopening attaches again cleanly
**Plans**: TBD

### Phase 12: New Project Creation
**Goal**: Users can create a new GSD project — directory, tmux session, and Claude Code launch — from a single button in the dashboard
**Depends on**: Phase 9
**Requirements**: CREATE-01, CREATE-02, CREATE-03, CREATE-04
**Success Criteria** (what must be TRUE):
  1. A "New project" button is visible in the GSD tab header at all times
  2. Clicking the button prompts for a project name; submitting creates the directory at `{base_path}/{name}` and a new tmux session named after the project
  3. The backend sends `claude` followed by `/gsd:new-project` as the first input into the new tmux session so the project scaffold starts automatically
  4. The new project's card appears in the dashboard grid immediately after creation without requiring a page refresh or manual config edit
**Plans**: TBD

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 4. Backend File API | 2/2 | Complete | 2026-03-21 |
| 5. Card Enhancements | 2/2 | Complete | 2026-03-21 |
| 6. Drawer and Full-Screen Viewer | 3/3 | Complete | 2026-03-21 |
| 7. Agent Data Proxy | 2/2 | Complete | 2026-03-22 |
| 8. GSD Card Stats | 2/2 | Complete | 2026-03-23 |
| 9. Tmux Backend Wiring | 0/TBD | Not started | - |
| 10. Smart Send UI | 0/TBD | Not started | - |
| 11. Live Terminal Overlay | 0/TBD | Not started | - |
| 12. New Project Creation | 0/TBD | Not started | - |
