# Roadmap: GSD Dashboard

## Milestones

- ✅ **v1.0 Foundation** - Phases 1-3 (shipped 2026-03-18)
- ✅ **v1.1 File Viewer** - Phases 4-6 (shipped 2026-03-21)
- ✅ **v1.2 Live Data** - Phases 7-8 (shipped 2026-03-23)
- ✅ **v2.0 Control Plane** - Phases 9-11 (shipped 2026-03-25)
- ✅ **v2.1 Session Intelligence** - Phases 12-16 (shipped 2026-03-28)
- ✅ **v2.2-2.3 Card UX & Mobile** - Phases 17-19 (shipped 2026-03-30)
- ✅ **v3.0 Autopilot** - Phases 20-27 (shipped 2026-04-03)
- ✅ **v4.0 Chat-First Dashboard** - Phases 28-32 (shipped 2026-04-04)
- ✅ **v4.1 Chat Polish → Terminal-First** - Phases 33-36 + quick tasks 24-30 (shipped 2026-04-06)
- ✅ **v4.2 Cost Intelligence, Auth & UX Polish** - Phases 37-42 (shipped 2026-04-10)
- 📋 **v4.3 Optimisation & Cost Intelligence** - Phases 43-47 (planning)

## Phases

<details>
<summary>✅ v4.1 Chat Polish → Terminal-First (Phases 33-36) — SHIPPED 2026-04-06</summary>

- [x] Phase 33: Classifier Foundation (1/1 plans) — completed 2026-04-04
- [x] Phase 34: Feedback Pipeline (1/1 plans) — completed 2026-04-04
- [x] Phase 35: Feedback UI + Send Experience (2/2 plans) — completed 2026-04-05
- [x] Phase 36: Message Rendering + New Types (2/2 plans) — completed 2026-04-05

See [v4.1-ROADMAP.md](./milestones/v4.1-ROADMAP.md) for full archive.

</details>

<details>
<summary>✅ v4.2 Cost Intelligence, Auth & UX Polish (Phases 37-42) — SHIPPED 2026-04-10</summary>

- [x] Phase 37: Auth & Terminal Reliability (2/2 plans) — completed 2026-04-07
- [x] Phase 38: Terminal Light Mode & Status Colors (1/1 plans) — completed 2026-04-07
- [x] Phase 39: Resizable Columns (1/1 plans) — completed 2026-04-07
- [x] Phase 40: External Services Dashboard (1/1 plans) — completed 2026-04-07
- [x] Phase 41: Claude Usage Tracking (2/2 plans) — completed 2026-04-08
- [x] Phase 42: Configuration UI (2/2 plans) — completed 2026-04-10

Quick tasks: #34 terminal load delay, #35 auth blocking fix, #36 GSD MCP tools, #37 Usage page, #38 global defaults.

See [v4.2-ROADMAP.md](./milestones/v4.2-ROADMAP.md) for full archive.

</details>

### 📋 v4.3 Optimisation & Cost Intelligence (Phases 43-47)

**Goal:** Fix project status accuracy, enhance usage insights with tokens and model breakdowns, add comprehensive services cost tracking (email parser + APIs), and replace manual CLAUDE.md editing with an AI-guided chat workflow.

**Granularity:** coarse
**Requirements:** 21 mapped (100% coverage)

- [x] **Phase 43: Project Status Accuracy** — Real-time status push, correct working/waiting detection, elapsed time, task previews (completed 2026-04-10)
- [ ] **Phase 44: Usage Display Enhancements** — Token counts, editable pricing editor, per-model breakdowns
- [ ] **Phase 45: Services Cost Tracking Foundation** — Email parser, manual entry, cost display, credentials storage
- [ ] **Phase 46: Services API Integrations** — Uptime sparklines + Railway/OpenAI/Vercel API cost fetchers
- [ ] **Phase 47: AI-Guided CLAUDE.md Editor** — Chat UI, diff preview, approval flow, AI review action

## Phase Details

### Phase 43: Project Status Accuracy
**Goal**: User sees accurate, real-time project state on every card without polling lag or false "Waiting" reports.
**Depends on**: Nothing (foundational fix, first phase of v4.3)
**Requirements**: STAT-01, STAT-02, STAT-03, STAT-04
**Success Criteria** (what must be TRUE):
  1. When a tmux session transitions (working → waiting or vice versa), the project card updates within 1 second without requiring a page refresh or polling tick
  2. A session actively producing output reports "Working" (never "Waiting") — the current false-waiting bug is gone and verified on the live Railway URL
  3. Each project card shows elapsed time in the current state (e.g., "Working 2m 30s", "Waiting 5m") and the timer advances live
  4. Each project in the list shows a preview of the current task from tmux (e.g., "planning phase 14 UI integration") instead of the generic "Chat" placeholder
**Plans:** 3/3 plans complete
- [ ] 43-01-PLAN.md — Fix tmux state detection (output-change heuristic) + extractCurrentTask helper
- [ ] 43-02-PLAN.md — Server background broadcaster + project_state_change WebSocket push + stateEnteredAt/currentTask API fields
- [ ] 43-03-PLAN.md — Client WS handler + live elapsed tick + currentTask card render + deploy + human verify

### Phase 44: Usage Display Enhancements
**Goal**: User can see not just dollar costs but token counts, per-model breakdowns, and edit pricing rules directly from the Usage page.
**Depends on**: Phase 43
**Requirements**: USG-01, USG-02, USG-03, USG-04
**Success Criteria** (what must be TRUE):
  1. Usage page shows input, output, and cache token counts alongside dollar amounts for weekly and daily views
  2. User can edit per-model pricing rules in the UI (reusing `/api/pricing`) and the costs recalculate after saving
  3. Pricing editor displays inline tips explaining what input, output, and cache tokens mean and how they drive cost per model
  4. Usage page renders a model breakdown (Opus vs Sonnet vs Haiku) for both weekly and daily timeframes
**Plans:** 1/3 plans executed
- [ ] 44-01-PLAN.md — Extend /api/pricing/window with tokens + by_model breakdown (backend)
- [ ] 44-02-PLAN.md — Build PricingEditor component with inline tips (frontend, parallel)
- [ ] 44-03-PLAN.md — Wire tokens, model breakdown, and PricingEditor into UsagePage + deploy + verify

### Phase 45: Services Cost Tracking Foundation
**Goal**: User can see monthly services costs per project from email receipts and manual entries, with credentials stored in SQLite for use by future API integrations.
**Depends on**: Phase 44
**Requirements**: SVC-02, SVC-06, SVC-07, SVC-08
**Notes**: Builds on the existing `external_service_costs` SQLite table from Phase 24. This phase establishes the storage contract that Phase 46 API integrations will populate.
**Success Criteria** (what must be TRUE):
  1. When a billing receipt email is forwarded to the configured inbox, the parser extracts amount/date/service and inserts a row into `external_service_costs` (verifiable by checking the Services page after sending a test receipt)
  2. User can manually enter a fixed monthly cost for any service through the UI and it appears as a cost line on the Services page
  3. Services page shows cost alongside status — each service displays its monthly total, and each project displays a per-project rollup sum
  4. User can store Railway PAT, OpenAI admin key, and Vercel token via a settings UI (persisted in SQLite settings table, not env vars) and the values survive a Railway redeploy
**Plans**: TBD

### Phase 46: Services API Integrations
**Goal**: Services page shows 7-day uptime sparklines and live costs pulled directly from Railway, OpenAI, and Vercel APIs using credentials stored in Phase 45.
**Depends on**: Phase 45 (uses `external_service_costs` schema + credentials storage)
**Requirements**: SVC-01, SVC-03, SVC-04, SVC-05
**Success Criteria** (what must be TRUE):
  1. Each service on the Services page renders a 7-day uptime sparkline reflecting historical status checks
  2. Railway costs appear on the Services page, fetched from Railway's GraphQL API using the PAT stored in SQLite settings
  3. OpenAI daily usage appears on the Services page, fetched from the OpenAI admin API using the admin key stored in SQLite settings
  4. Vercel team billing data appears on the Services page, fetched from Vercel's API using the token stored in SQLite settings
  5. API-sourced costs and email-parsed costs live side-by-side in `external_service_costs` without double-counting for the same period
**Plans**: TBD

### Phase 47: AI-Guided CLAUDE.md Editor
**Goal**: User edits CLAUDE.md by describing changes in a chat; an AI assistant with GSD workflow context proposes diffs, the user approves or tweaks, and the file is written to disk.
**Depends on**: Phase 46
**Checkpoint**: User testing required — the AI integration is novel and warrants manual verification before marking the phase complete.
**Requirements**: CFG-04, CFG-05, CFG-06, CFG-07, CFG-08
**Success Criteria** (what must be TRUE):
  1. The manual CLAUDE.md textarea is gone from the Config page — no raw-text edit field remains
  2. Config page has a chat interface where the user describes a desired change; the AI reads the current CLAUDE.md and has GSD workflow context before replying
  3. AI responses include a unified diff preview (old vs new) rendered in the UI before anything is written to disk
  4. User can approve, reject, or tweak each proposed diff; only approved diffs are written to disk
  5. A separate "Review my CLAUDE.md" button asks the AI for unsolicited improvement suggestions without the user typing a prompt
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 43. Project Status Accuracy | 3/3 | Complete    | 2026-04-10 |
| 44. Usage Display Enhancements | 1/3 | In Progress|  |
| 45. Services Cost Tracking Foundation | 0/0 | Not started | - |
| 46. Services API Integrations | 0/0 | Not started | - |
| 47. AI-Guided CLAUDE.md Editor | 0/0 | Not started | - |

## Coverage (v4.3)

- v4.3 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

| Phase | Requirements |
|-------|--------------|
| 43 | STAT-01, STAT-02, STAT-03, STAT-04 |
| 44 | USG-01, USG-02, USG-03, USG-04 |
| 45 | SVC-02, SVC-06, SVC-07, SVC-08 |
| 46 | SVC-01, SVC-03, SVC-04, SVC-05 |
| 47 | CFG-04, CFG-05, CFG-06, CFG-07, CFG-08 |
