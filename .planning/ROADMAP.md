# Roadmap: GSD Dashboard

## Overview

A web dashboard that brings visibility across concurrent GSD projects. Starting from Claude Code Agent Monitor, we add a GSD layer that reads `.planning/` files from multiple projects and displays unified phase progress, roadmap status, and requirements coverage. By Phase 3, users see where every project stands without opening individual planning files.

## Phases

- [ ] **Phase 1: Foundation & Configuration** - Fork project, retain existing features, add configurable project list
- [ ] **Phase 2: Backend Data Pipeline** - Read GSD files, parse content, expose `/api/gsd/projects` endpoint
- [ ] **Phase 3: Frontend Dashboard** - Display unified GSD views with roadmap, state, and requirements coverage

## Phase Details

### Phase 1: Foundation & Configuration
**Goal**: Project is forked and configured to read GSD data from multiple projects
**Depends on**: Nothing (first phase)
**Requirements**: SETUP-01, SETUP-02, SETUP-03, CONF-01, CONF-02, CONF-03
**Success Criteria** (what must be TRUE):
  1. Forked repository builds without errors and existing agent monitoring features work
  2. GSD tab/section is visible alongside existing views in the UI
  3. Project configuration file is created with all 4 projects (josie, gsddashboard, debates, reforma)
  4. Adding a new project requires only config file changes (verified by documenting the process)
**Plans**: 3 plans

Plans:
- [ ] 01-01: Fork Claude Code Agent Monitor and verify existing features work
- [ ] 01-02: Create GSD tab/section in React UI alongside agent monitoring
- [ ] 01-03: Implement configurable project list (config file with project roots)

### Phase 2: Backend Data Pipeline
**Goal**: Backend reads GSD files and exposes parsed project data via API
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. Backend can read and parse ROADMAP.md from all configured projects
  2. Backend can read STATE.md and extract status, phase, actions, blockers
  3. Backend can read REQUIREMENTS.md and count checked-off requirements
  4. Backend can read PLAN.md and SUMMARY.md files and track task completion per phase
  5. Backend exposes `/api/gsd/projects` endpoint returning complete project data on request
**Plans**: 2 plans

Plans:
- [ ] 02-01: Create backend file readers for ROADMAP.md, STATE.md, REQUIREMENTS.md
- [ ] 02-02: Create endpoint `/api/gsd/projects` that parses and returns all project data

### Phase 3: Frontend Dashboard
**Goal**: Users see unified view of all project progress with real-time status
**Depends on**: Phase 2
**Requirements**: VIEW-01, VIEW-02, VIEW-03, VIEW-04, VIEW-05, VIEW-06
**Success Criteria** (what must be TRUE):
  1. GSD tab displays a project card for each configured project with name, current phase, and status badge
  2. Users can see all phases for a project with names, goals, and completion state
  3. Users can view current phase status, last actions, and any blockers
  4. Users can see requirements coverage (total and checked-off) per project
  5. Dashboard data loads automatically on page load without manual refresh
**Plans**: 3 plans

Plans:
- [ ] 03-01: Create project card component showing project name, current phase, and progress
- [ ] 03-02: Create roadmap overview panel showing all phases and completion state
- [ ] 03-03: Create state panel and requirements coverage views; wire up automatic data load

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Configuration | 0/3 | Not started | - |
| 2. Backend Data Pipeline | 0/2 | Not started | - |
| 3. Frontend Dashboard | 0/3 | Not started | - |
