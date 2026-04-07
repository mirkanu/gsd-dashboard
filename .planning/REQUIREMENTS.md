# Requirements: GSD Dashboard

**Defined:** 2026-04-07
**Core Value:** At a glance, see where every GSD project stands and interact with any session

## v4.2 Requirements

Requirements for Cost Intelligence, Auth & UX Polish milestone. Each maps to roadmap phases.

### Cost Intelligence

- [x] **COST-01**: User can view a services page listing all external services (Railway, Vercel, Resend, GitHub, Claude, OpenAI) used by each project
- [x] **COST-02**: Services page shows live status (up/down/degraded) for each external service
- [ ] **COST-03**: User can see Claude Max token usage per session and weekly aggregate with limits display
- [ ] **COST-04**: Usage data persists in SQLite and displays historical trends

### Authentication

- [x] **AUTH-01**: User authenticates once and the browser session persists across reloads for at least 30 days
- [x] **AUTH-02**: Login uses a secure token/cookie instead of a modal prompt on every page load

### Terminal Reliability

- [x] **TERM-01**: Terminal WebSocket connection stays alive when idle for 10+ minutes (no timeout disconnect)
- [x] **TERM-02**: If connection drops, terminal auto-reconnects without user intervention
- [x] **TERM-03**: In light mode, text selection highlight is clearly visible against the white background
- [x] **TERM-04**: GSD selection query title text is legible in light mode (not white-on-white)

### UX Polish

- [x] **UX-01**: Desktop 3-column layout has drag handles allowing user to resize column widths
- [x] **UX-02**: Column width preferences persist across page reloads
- [x] **UX-03**: Waiting status displays in blue, Paused status displays in orange

### Configuration

- [ ] **CFG-01**: User can view global CLAUDE.md and per-project CLAUDE.md files from the dashboard
- [ ] **CFG-02**: User can edit and save CLAUDE.md files directly from the dashboard
- [ ] **CFG-03**: User can configure Claude session verbosity settings per project

### Notifications

- [ ] **NOTIF-01**: User can configure Telegram alert preferences per-project from the dashboard
- [ ] **NOTIF-02**: Notification settings persist in SQLite (not just env vars)

## Future Requirements

Deferred from previous milestones. Tracked but not in current roadmap.

### Cost Intelligence
- **COST-05**: Autopilot cost gate with configurable cost limits for autonomous execution

### Project Management
- **CREATE-01**: New project creation from dashboard
- **TASK-01**: Task Archive All
- **GH-01**: GitHub issues link on project cards

## Out of Scope

| Feature | Reason |
|---------|--------|
| Email receipt parsing for cost tracking | Over-engineering for v4.2 — manual entry sufficient |
| Multi-user auth / RBAC | Single developer tool |
| Real-time cost alerts | Defer until usage tracking proves valuable |
| Terminal recording/playback | Not core to monitoring |
| Keyboard shortcuts | Nice-to-have, defer to v4.3 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| COST-01 | Phase 40 | Complete |
| COST-02 | Phase 40 | Complete |
| COST-03 | Phase 41 | Pending |
| COST-04 | Phase 41 | Pending |
| AUTH-01 | Phase 37 | Complete |
| AUTH-02 | Phase 37 | Complete |
| TERM-01 | Phase 37 | Complete |
| TERM-02 | Phase 37 | Complete |
| TERM-03 | Phase 38 | Complete |
| TERM-04 | Phase 38 | Complete |
| UX-01 | Phase 39 | Complete |
| UX-02 | Phase 39 | Complete |
| UX-03 | Phase 38 | Complete |
| CFG-01 | Phase 42 | Pending |
| CFG-02 | Phase 42 | Pending |
| CFG-03 | Phase 42 | Pending |
| NOTIF-01 | Phase 42 | Pending |
| NOTIF-02 | Phase 42 | Pending |

**Coverage:**
- v4.2 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0

---
*Requirements defined: 2026-04-07*
*Last updated: 2026-04-07 — traceability complete, all 18 requirements mapped to phases 37-42*
