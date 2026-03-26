# Requirements: GSD Dashboard

## v2.1 Requirements

**Defined:** 2026-03-26
**Core Value:** Know at a glance what every Claude session is doing; interact with tmux on mobile; get notified when your input is needed.

### Session State (STAT)

- [x] **STAT-01**: Backend detects tmux pane state by capturing the last N lines via `tmux capture-pane`; classifies as `working` (recent output, no prompt pattern), `waiting` (GSD question/prompt pattern detected), `paused` (no active Claude process or credit-error pattern), or `archived` (manually flagged in config)
- [x] **STAT-02**: `GET /api/gsd/projects` includes `sessionState: "working" | "waiting" | "paused" | "archived"` for each project
- [x] **STAT-03**: Each project card displays a colored left border and a single-word state label — Working (green), Waiting (amber), Paused (red), Archived (gray)
- [x] **STAT-04**: A user can mark any project as Archived from its card; the `archived: true` flag is written to that project's entry in `gsd-projects.json` and persists across server restarts
- [x] **STAT-05**: Archived projects are excluded from the main grid; a collapsible "View archived (N)" section appears below all cards whenever N ≥ 1
- [x] **STAT-06**: Archived projects can be unarchived from within the archived section, restoring them to the main grid immediately
- [ ] **STAT-07**: The summary stats row above the grid shows Working / Waiting / Paused / Archived counts with matching colors, replacing the previous Projects / Active / Complete stats

### Terminal UX (TUIX)

- [ ] **TUIX-01**: The send input and GSD command chips are relocated to the bottom of the terminal overlay (inside `TerminalOverlay`)
- [ ] **TUIX-02**: The send input and chips are removed from `ProjectCard` entirely; the card no longer renders `SendBox`
- [ ] **TUIX-03**: On mobile, when the software keyboard opens, the terminal overlay adjusts its layout so the send box stays visible above the keyboard (no content hidden behind keyboard)
- [ ] **TUIX-04**: The terminal content area is scrollable by touch swipe (up/down) on mobile devices

### Telegram Integration (TG)

- [ ] **TG-01**: GSDTelegram bot code is merged into this repo; the bot starts as part of the server process when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` env vars are set; it is a no-op when they are unset
- [ ] **TG-02**: When a project's `sessionState` transitions to `waiting` or `paused`, the server sends a Telegram message identifying the project name and new state
- [ ] **TG-03**: The server detects when a tmux pane contains a GSD scroll-to-select prompt (numbered list with a highlighted cursor line, as produced by GSD's interactive question format) and sends a distinct "needs your input" Telegram notification
- [ ] **TG-04**: No separate GSDTelegram process or repo is needed after the merge; all configuration is via env vars in this repo's `.env`

## v2.2 Requirements

### New Project (CREATE)

- [ ] **CREATE-01**: Dashboard has a "New project" button visible in the GSD tab header
- [ ] **CREATE-02**: User provides a project name; backend creates a directory at `{base_path}/{name}` (base path configurable, default `/data/home/`)
- [ ] **CREATE-03**: Backend creates a new tmux session named after the project and runs `claude` in it with `/gsd:new-project` sent as the first input
- [ ] **CREATE-04**: The new project is added to `gsd-projects.json` and its card appears in the grid immediately without a page refresh

## Previously Delivered

### v2.0 — Project Control Plane (completed 2026-03-25)

- [x] **TMX-01–03**: tmux_session in config; session liveness check; tmuxActive in API response
- [x] **SEND-01–03**: Send input on card with next_action pre-fill; GSD command chips
- [x] **TERM-01–04**: Open terminal button; full-screen xterm.js overlay; bidirectional I/O + resize; clean detach on close

### v1.2 — GSD Stats & Live Data Pipeline (completed 2026-03-23)

- [x] **PIPE-01–04**: Agent data proxied through GSD_DATA_URL tunnel to Railway
- [x] **NEXT-01–02**: Next action line on each card from STATE.md
- [x] **BLOCK-01–03**: Blocked badge, blocked-first sort, blockers in API response
- [x] **VEL-01–03**: Velocity (plans/week), streak (consecutive days), TTL estimate
- [x] **TTL-01–04**: estimatedCompletion computed server-side, rendered on card

### v1.1 — File Viewer & Card Enhancements (completed 2026-03-21)

- [x] **API-01–03**: Version + liveUrl from PROJECT.md; file content endpoints
- [x] **CARD-01–03**: Version badge, live URL link, card click opens drawer
- [x] **DRAW-01–05**: Side drawer with 4 file tabs; full-screen markdown viewer

### v1.0 — Foundation (completed 2026-03-18)

- [x] **SETUP-01–03**, **CONF-01–03**, **DATA-01–06**, **UI-01–06**, **DEPLOY-01–04**

## Out of Scope

- Multi-user auth or per-user session isolation (single developer tool)
- Session recording / playback
- tmux session creation for pre-existing projects in v2.0 (handled in v2.2 CREATE phase)

## Traceability (v2.1)

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAT-01 | Phase 12 — Session State Indicators | Complete |
| STAT-02 | Phase 12 — Session State Indicators | Complete |
| STAT-03 | Phase 12 — Session State Indicators | Complete |
| STAT-04 | Phase 12 — Session State Indicators | Complete |
| STAT-05 | Phase 12 — Session State Indicators | Complete |
| STAT-06 | Phase 12 — Session State Indicators | Complete |
| STAT-07 | Phase 12 — Session State Indicators | Pending |
| TUIX-01 | Phase 13 — Terminal UX | Pending |
| TUIX-02 | Phase 13 — Terminal UX | Pending |
| TUIX-03 | Phase 13 — Terminal UX | Pending |
| TUIX-04 | Phase 13 — Terminal UX | Pending |
| TG-01 | Phase 14 — Telegram Integration | Pending |
| TG-02 | Phase 14 — Telegram Integration | Pending |
| TG-03 | Phase 14 — Telegram Integration | Pending |
| TG-04 | Phase 14 — Telegram Integration | Pending |

## Traceability (v2.2)

| Requirement | Phase | Status |
|-------------|-------|--------|
| CREATE-01 | Phase 15 — New Project Creation | Pending |
| CREATE-02 | Phase 15 — New Project Creation | Pending |
| CREATE-03 | Phase 15 — New Project Creation | Pending |
| CREATE-04 | Phase 15 — New Project Creation | Pending |
