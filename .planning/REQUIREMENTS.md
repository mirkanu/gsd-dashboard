# Requirements: GSD Dashboard

**Defined:** 2026-03-18
**Core Value:** At a glance, see where every GSD project stands — which phase is active, what's done, what's blocked — without opening individual planning files.

## v1 Requirements

### Setup

- [ ] **SETUP-01**: Fork Claude Code Agent Monitor repository as the project base
- [ ] **SETUP-02**: Existing agent monitoring features (sessions, Kanban, cost tracking) remain functional after fork
- [ ] **SETUP-03**: GSD tab/section is added alongside existing agent monitoring views

### Configuration

- [ ] **CONF-01**: Project list is defined in a config file (not hardcoded) — specifying project name and root path
- [ ] **CONF-02**: Initial config includes josie, gsddashboard, debates, reforma (all under /data/home)
- [ ] **CONF-03**: Adding a new project requires only a config file edit, no code changes

### Data Reading

- [ ] **DATA-01**: Backend reads ROADMAP.md from each configured project's `.planning/` directory and parses phase list, status, and requirement mappings
- [ ] **DATA-02**: Backend reads STATE.md and extracts current phase, last action, next step, and any blockers
- [ ] **DATA-03**: Backend reads REQUIREMENTS.md and counts total vs checked-off REQ-IDs per project
- [ ] **DATA-04**: Backend reads phase PLAN.md and SUMMARY.md files to determine per-phase plan completion (done vs pending)
- [ ] **DATA-05**: Backend exposes a single `/api/gsd/projects` endpoint returning parsed data for all configured projects on demand

### Dashboard Views

- [ ] **VIEW-01**: GSD tab shows a project card for each configured project
- [ ] **VIEW-02**: Each project card shows: project name, current phase, phase progress (plans done/total), and a status badge
- [ ] **VIEW-03**: Roadmap overview shows all phases for a project — phase number, name, goal, and completion state
- [ ] **VIEW-04**: State panel shows current phase status, last action, next step, and blockers (from STATE.md)
- [ ] **VIEW-05**: Requirements coverage shows total REQ-IDs and percentage checked off per project
- [ ] **VIEW-06**: Dashboard data loads on page load — no manual trigger required

## v2 Requirements

### Enhancements

- **ENH-01**: Auto-refresh GSD data every N minutes (configurable interval)
- **ENH-02**: Click-through to view raw planning file content inline
- **ENH-03**: Phase timeline / Gantt-style view across projects
- **ENH-04**: Notification when a phase completes (browser notification)
- **ENH-05**: Trend graph showing requirements coverage over time

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time file watching / WebSocket push for GSD data | Manual refresh is sufficient — extra complexity not justified |
| Editing planning files from the dashboard | Read-only tool; edits belong in the editor/CLI |
| Authentication / user accounts | Single-developer local tool |
| Cloud hosting / remote access | Local dev server only for v1 |
| AI analysis of project state | Out of scope for a monitoring tool |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SETUP-01 | Phase 1 | Pending |
| SETUP-02 | Phase 1 | Pending |
| SETUP-03 | Phase 1 | Pending |
| CONF-01 | Phase 1 | Pending |
| CONF-02 | Phase 1 | Pending |
| CONF-03 | Phase 1 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| VIEW-01 | Phase 3 | Pending |
| VIEW-02 | Phase 3 | Pending |
| VIEW-03 | Phase 3 | Pending |
| VIEW-04 | Phase 3 | Pending |
| VIEW-05 | Phase 3 | Pending |
| VIEW-06 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 17 total
- Mapped to phases: 17
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after initial definition*
