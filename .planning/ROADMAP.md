# Roadmap: GSD Dashboard

## Milestones

- ✅ **v1.0 Foundation** — Phases 1-3 (shipped 2026-03-18) → [archive](milestones/v1-ROADMAP.md)
- ✅ **v1.1 File Viewer & Card Enhancements** — Phases 4-6 (shipped 2026-03-21) → [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 GSD Stats & Live Data Pipeline** — Phases 7-8 (shipped 2026-03-23) → [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v2.0 Project Control Plane** — Phases 9-11 (shipped 2026-03-25) → [archive](milestones/v2.0-ROADMAP.md)
- ✅ **v2.1 Session Intelligence & Terminal UX** — Phases 12-14, 16 (shipped 2026-03-28) → [archive](milestones/v2.1-ROADMAP.md)
- 🚧 **v2.2 New Project Creation** — Phase 15 (in progress)

---

## Phases

<details>
<summary>✅ v1.0 Foundation (Phases 1-3) — SHIPPED 2026-03-18</summary>

- [x] Phase 1: Foundation & Configuration (3/3 plans) — completed 2026-03-18
- [x] Phase 2: Backend Data Pipeline (2/2 plans) — completed 2026-03-18
- [x] Phase 3: Frontend Dashboard (3/3 plans) — completed 2026-03-18

</details>

<details>
<summary>✅ v1.1 File Viewer & Card Enhancements (Phases 4-6) — SHIPPED 2026-03-21</summary>

- [x] Phase 4: Backend File API (2/2 plans) — completed 2026-03-21
- [x] Phase 5: Card Enhancements (2/2 plans) — completed 2026-03-21
- [x] Phase 6: Drawer and Full-Screen Viewer (3/3 plans) — completed 2026-03-21

</details>

<details>
<summary>✅ v1.2 GSD Stats & Live Data Pipeline (Phases 7-8) — SHIPPED 2026-03-23</summary>

- [x] Phase 7: Agent Data Proxy (2/2 plans) — completed 2026-03-22
- [x] Phase 8: GSD Card Stats (2/2 plans) — completed 2026-03-23

</details>

<details>
<summary>✅ v2.0 Project Control Plane (Phases 9-11) — SHIPPED 2026-03-25</summary>

- [x] Phase 9: Tmux Backend Wiring (2/2 plans) — completed 2026-03-24
- [x] Phase 10: Smart Send UI (2/2 plans) — completed 2026-03-24
- [x] Phase 11: Live Terminal Overlay (2/2 plans) — completed 2026-03-25

</details>

<details>
<summary>✅ v2.1 Session Intelligence & Terminal UX (Phases 12-14, 16) — SHIPPED 2026-03-28</summary>

- [x] Phase 12: Session State Indicators (3/3 plans) — completed 2026-03-26
- [x] Phase 13: Terminal UX (2/2 plans) — completed 2026-03-26
- [x] Phase 13.1: Mobile Terminal Polish & Message Log (3/3 plans) — completed 2026-03-27
- [x] Phase 14: Telegram Integration (2/2 plans) — completed 2026-03-28
- [x] Phase 16: OOM Prevention (1/1 plan) — completed 2026-03-28

</details>

### 🚧 v2.2 New Project Creation

- [ ] **Phase 15: New Project Creation** — One-click new project flow: create directory, tmux session, launch Claude with /gsd:new-project, add to config

#### Phase 15: New Project Creation
**Goal**: Users can create a new GSD project — directory, tmux session, and Claude Code launch — from a single button in the dashboard
**Depends on**: Phase 9
**Requirements**: CREATE-01, CREATE-02, CREATE-03, CREATE-04
**Success Criteria** (what must be TRUE):
  1. A "New project" button is visible in the GSD tab header at all times
  2. Clicking the button prompts for a project name; submitting creates the directory at `{base_path}/{name}` and a new tmux session named after the project
  3. The backend sends `claude` followed by `/gsd:new-project` as the first input into the new tmux session so the project scaffold starts automatically
  4. The new project's card appears in the dashboard grid immediately after creation without requiring a page refresh or manual config edit
**Plans**: 2 plans
Plans:
- [ ] 15-01-PLAN.md — Backend POST /api/gsd/projects/create: directory, tmux session, claude launch, config write
- [ ] 15-02-PLAN.md — Frontend: New project button + NewProjectDialog + optimistic card prepend

---

## Progress Table

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Configuration | v1.0 | 3/3 | Complete | 2026-03-18 |
| 2. Backend Data Pipeline | v1.0 | 2/2 | Complete | 2026-03-18 |
| 3. Frontend Dashboard | v1.0 | 3/3 | Complete | 2026-03-18 |
| 4. Backend File API | v1.1 | 2/2 | Complete | 2026-03-21 |
| 5. Card Enhancements | v1.1 | 2/2 | Complete | 2026-03-21 |
| 6. Drawer and Full-Screen Viewer | v1.1 | 3/3 | Complete | 2026-03-21 |
| 7. Agent Data Proxy | v1.2 | 2/2 | Complete | 2026-03-22 |
| 8. GSD Card Stats | v1.2 | 2/2 | Complete | 2026-03-23 |
| 9. Tmux Backend Wiring | v2.0 | 2/2 | Complete | 2026-03-24 |
| 10. Smart Send UI | v2.0 | 2/2 | Complete | 2026-03-24 |
| 11. Live Terminal Overlay | v2.0 | 2/2 | Complete | 2026-03-25 |
| 12. Session State Indicators | v2.1 | 3/3 | Complete | 2026-03-26 |
| 13. Terminal UX | v2.1 | 2/2 | Complete | 2026-03-26 |
| 13.1 Mobile Terminal Polish & Message Log | v2.1 | 3/3 | Complete | 2026-03-27 |
| 14. Telegram Integration | v2.1 | 2/2 | Complete | 2026-03-28 |
| 16. OOM Prevention | v2.1 | 1/1 | Complete | 2026-03-28 |
| 15. New Project Creation | v2.2 | 0/2 | Planned | - |
