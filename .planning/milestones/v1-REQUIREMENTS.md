# Requirements Archive: GSD Dashboard v1
*Completed: 2026-03-18*
*Core Value: At a glance, see where every GSD project stands — which phase is active, what's done, what's blocked — without opening individual planning files.*

## v1 Requirements — All Delivered ✅

### Setup

- [x] **SETUP-01**: Fork Claude Code Agent Monitor repository as the project base — *Delivered: upstream merged into /data/home/gsddashboard*
- [x] **SETUP-02**: Existing agent monitoring features (sessions, Kanban, cost tracking) remain functional after fork — *Delivered: all existing routes preserved, 1607-module build clean*
- [x] **SETUP-03**: GSD tab/section is added alongside existing agent monitoring views — *Delivered: GSD Projects in sidebar nav at /gsd route*

### Configuration

- [x] **CONF-01**: Project list is defined in a config file (not hardcoded) — specifying project name and root path — *Delivered: gsd-projects.json*
- [x] **CONF-02**: Initial config includes josie, gsddashboard, debates, reforma (all under /data/home) — *Delivered: all 4 in gsd-projects.json*
- [x] **CONF-03**: Adding a new project requires only a config file edit, no code changes — *Delivered: verified by design*

### Data Reading

- [x] **DATA-01**: Backend reads ROADMAP.md from each configured project's `.planning/` directory and parses phase list, status, and requirement mappings — *Delivered: readRoadmap() in server/gsd/readers.js*
- [x] **DATA-02**: Backend reads STATE.md and extracts current phase, last action, next step, and any blockers — *Delivered: readState() handles both YAML frontmatter and pure markdown formats*
- [x] **DATA-03**: Backend reads REQUIREMENTS.md and counts total vs checked-off REQ-IDs per project — *Delivered: readRequirements() counts [x] vs [ ] lines*
- [x] **DATA-04**: Backend reads phase PLAN.md and SUMMARY.md files to determine per-phase plan completion — *Delivered: readRoadmap() parses progress table including plans_done/plans_total*
- [x] **DATA-05**: Backend exposes a single `/api/gsd/projects` endpoint returning parsed data for all configured projects on demand — *Delivered: GET /api/gsd/projects; also proxies to GSD_DATA_URL when set for Railway deployment*

### Dashboard Views

- [x] **VIEW-01**: GSD tab shows a project card for each configured project — *Delivered: 2-col grid of project cards in GSD.tsx*
- [x] **VIEW-02**: Each project card shows: project name, current phase, phase progress (plans done/total), and a status badge — *Delivered: name, status badge, current_phase, progress bar, phase/requirements counts*
- [x] **VIEW-03**: Roadmap overview shows all phases for a project — phase number, name, goal, and completion state — *Delivered: expandable roadmap section with per-phase status icons*
- [x] **VIEW-04**: State panel shows current phase status, last action, next step, and blockers (from STATE.md) — *Delivered: status badge, last_activity line, amber blocker alerts*
- [x] **VIEW-05**: Requirements coverage shows total REQ-IDs and percentage checked off per project — *Delivered: requirements bar with checked/total count*
- [x] **VIEW-06**: Dashboard data loads on page load — no manual trigger required — *Delivered: useEffect auto-load on mount + manual refresh button*

## Traceability

| Requirement | Phase | Outcome |
|-------------|-------|---------|
| SETUP-01 | Phase 1 | ✅ Validated |
| SETUP-02 | Phase 1 | ✅ Validated |
| SETUP-03 | Phase 1 | ✅ Validated |
| CONF-01 | Phase 1 | ✅ Validated |
| CONF-02 | Phase 1 | ✅ Validated |
| CONF-03 | Phase 1 | ✅ Validated |
| DATA-01 | Phase 2 | ✅ Validated |
| DATA-02 | Phase 2 | ✅ Validated |
| DATA-03 | Phase 2 | ✅ Validated |
| DATA-04 | Phase 2 | ✅ Validated |
| DATA-05 | Phase 2 | ✅ Validated |
| VIEW-01 | Phase 3 | ✅ Validated |
| VIEW-02 | Phase 3 | ✅ Validated |
| VIEW-03 | Phase 3 | ✅ Validated |
| VIEW-04 | Phase 3 | ✅ Validated |
| VIEW-05 | Phase 3 | ✅ Validated |
| VIEW-06 | Phase 3 | ✅ Validated |

**Coverage: 17/17 (100%)**

## Carried Forward to v2

The following v2 enhancements were defined during v1 planning and carried forward for the next milestone:

- **ENH-01**: Auto-refresh GSD data every N minutes (configurable interval)
- **ENH-02**: Click-through to view raw planning file content inline
- **ENH-03**: Phase timeline / Gantt-style view across projects
- **ENH-04**: Notification when a phase completes (browser notification)
- **ENH-05**: Trend graph showing requirements coverage over time

## Out of Scope (v1)

| Feature | Reason | Outcome |
|---------|--------|---------|
| Real-time file watching / WebSocket push | Manual refresh sufficient | Confirmed correct — not needed |
| Editing planning files from dashboard | Read-only tool | Confirmed correct |
| Authentication / user accounts | Single-developer local tool | Basic auth added for Railway deployment instead |
| Cloud hosting / remote access | Local dev server only | Actually delivered as bonus via Railway + cloudflared tunnel |
| AI analysis of project state | Out of scope | Confirmed |
