# Requirements: GSD Dashboard v2.0

**Defined:** 2026-03-24
**Core Value:** Control all GSD projects from the dashboard — send commands, open terminals, create new projects — without touching a separate shell.

## v2.0 Requirements

### Tmux Wiring (TMX)

- [ ] **TMX-01**: Each project in `gsd-projects.json` can specify a `tmux_session` name; backend validates the session exists before any tmux operation
- [ ] **TMX-02**: Backend exposes `POST /api/gsd/projects/:name/send` — sends arbitrary text to the project's tmux session via `tmux send-keys`
- [ ] **TMX-03**: `GET /api/gsd/projects` response includes `tmuxActive: boolean` — true when the named session exists and has at least one window

### Smart Send (SEND)

- [ ] **SEND-01**: Each project card shows a send input; it pre-fills with the project's `state.next_action` as a suggested command when one is available
- [ ] **SEND-02**: User can edit the pre-fill or type freely; submitting dispatches the text to the project's tmux session via the backend endpoint
- [ ] **SEND-03**: Send box shows quick-action chips for common GSD commands: `/gsd:resume-work`, `/gsd:progress`, `/gsd:pause-work`, `/gsd:plan-phase`

### Live Terminal (TERM)

- [ ] **TERM-01**: Each project card shows an "Open terminal" button only when `tmuxActive` is true
- [ ] **TERM-02**: Clicking opens a full-screen xterm.js overlay that attaches to the project's tmux session via a WebSocket connection backed by node-pty
- [ ] **TERM-03**: The terminal is fully interactive — bidirectional I/O, terminal resize events are forwarded
- [ ] **TERM-04**: Closing the overlay detaches from the tmux session without killing it; the session persists

### New Project (CREATE)

- [ ] **CREATE-01**: Dashboard has a "New project" button visible in the GSD tab header
- [ ] **CREATE-02**: User provides a project name; backend creates a directory at `{base_path}/{name}` (base path configurable, default `/data/home/`)
- [ ] **CREATE-03**: Backend creates a new tmux session named after the project and runs `claude` in it with `/gsd:new-project` sent as the first input
- [ ] **CREATE-04**: The new project is added to `gsd-projects.json` and its card appears in the grid immediately without a page refresh

## Previously Delivered

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

## Out of Scope (v2.0)

- Multi-user auth or per-user session isolation (single developer tool)
- Session recording / playback
- tmux session creation for pre-existing projects (user creates sessions manually, registers name in config)

## Traceability (v2.0)

| Requirement | Phase | Status |
|-------------|-------|--------|
| TMX-01 | Phase 9 — Tmux Backend Wiring | Pending |
| TMX-02 | Phase 9 — Tmux Backend Wiring | Pending |
| TMX-03 | Phase 9 — Tmux Backend Wiring | Pending |
| SEND-01 | Phase 10 — Smart Send UI | Pending |
| SEND-02 | Phase 10 — Smart Send UI | Pending |
| SEND-03 | Phase 10 — Smart Send UI | Pending |
| TERM-01 | Phase 11 — Live Terminal Overlay | Pending |
| TERM-02 | Phase 11 — Live Terminal Overlay | Pending |
| TERM-03 | Phase 11 — Live Terminal Overlay | Pending |
| TERM-04 | Phase 11 — Live Terminal Overlay | Pending |
| CREATE-01 | Phase 12 — New Project Creation | Pending |
| CREATE-02 | Phase 12 — New Project Creation | Pending |
| CREATE-03 | Phase 12 — New Project Creation | Pending |
| CREATE-04 | Phase 12 — New Project Creation | Pending |
