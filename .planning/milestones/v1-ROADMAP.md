# Roadmap Archive: GSD Dashboard v1
*Completed: 2026-03-18*

## Overview

A web dashboard that brings visibility across concurrent GSD projects. Starting from Claude Code Agent Monitor, we add a GSD layer that reads `.planning/` files from multiple projects and displays unified phase progress, roadmap status, and requirements coverage. By Phase 3, users see where every project stands without opening individual planning files.

## Phases

- [x] **Phase 1: Foundation & Configuration** - Fork project, retain existing features, add configurable project list
- [x] **Phase 2: Backend Data Pipeline** - Read GSD files, parse content, expose `/api/gsd/projects` endpoint
- [x] **Phase 3: Frontend Dashboard** - Display unified GSD views with roadmap, state, and requirements coverage

## Phase Details

### Phase 1: Foundation & Configuration
**Goal**: Project is forked and configured to read GSD data from multiple projects
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, CONF-01, CONF-02, CONF-03
**Success Criteria**:
  1. ✅ Forked repository builds without errors and existing agent monitoring features work
  2. ✅ GSD tab/section is visible alongside existing views in the UI
  3. ✅ Project configuration file is created with all 4 projects (josie, gsddashboard, debates, reforma)
  4. ✅ Adding a new project requires only config file changes
**Plans**: 3/3 complete

Plans:
- [x] 01-01: Fork Claude Code Agent Monitor and verify existing features work — `f8ee6b2`
- [x] 01-02: Create GSD tab/section in React UI alongside agent monitoring — `0f2bb10`
- [x] 01-03: Implement configurable project list (config file with project roots) — `a9cfb23`

### Phase 2: Backend Data Pipeline
**Goal**: Backend reads GSD files and exposes parsed project data via API
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria**:
  1. ✅ Backend reads and parses ROADMAP.md from all configured projects
  2. ✅ Backend reads STATE.md and extracts status, phase, actions, blockers
  3. ✅ Backend reads REQUIREMENTS.md and counts checked-off requirements
  4. ✅ Backend reads PLAN.md and SUMMARY.md files and tracks task completion per phase
  5. ✅ Backend exposes `/api/gsd/projects` endpoint returning complete project data
**Plans**: 2/2 complete

Plans:
- [x] 02-01: Create backend file readers for ROADMAP.md, STATE.md, REQUIREMENTS.md — `933f8cb`
- [x] 02-02: Create endpoint `/api/gsd/projects` that parses and returns all project data — `933f8cb`

### Phase 3: Frontend Dashboard
**Goal**: Users see unified view of all project progress with real-time status
**Depends on**: Phase 2
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05, VIEW-06
**Success Criteria**:
  1. ✅ GSD tab displays a project card for each configured project with name, current phase, and status badge
  2. ✅ Users can see all phases for a project with names, goals, and completion state
  3. ✅ Users can view current phase status, last actions, and any blockers
  4. ✅ Users can see requirements coverage (total and checked-off) per project
  5. ✅ Dashboard data loads automatically on page load without manual refresh
**Plans**: 3/3 complete

Plans:
- [x] 03-01: Create project card component — `f58e2ec`
- [x] 03-02: Create roadmap overview panel — `f58e2ec`
- [x] 03-03: Create state panel, requirements coverage, wire up auto-load — `f58e2ec`

## Post-Milestone Additions (beyond original scope)

- [x] Railway cloud deployment with basic auth — `18d7928`
- [x] GSD data proxy via cloudflared tunnel (GSD_DATA_URL) — `90d2120`
- [x] Self-healing tunnel script (scripts/tunnel.sh) — `012908a`
- [x] /api/health auth bypass for Railway health checks — `576ed68`

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Configuration | 3/3 | ✅ Complete | 2026-03-18 |
| 2. Backend Data Pipeline | 2/2 | ✅ Complete | 2026-03-18 |
| 3. Frontend Dashboard | 3/3 | ✅ Complete | 2026-03-18 |
