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
- 🚧 **v4.1 Chat Polish** - Phases 33-36 (in progress)

## Phases

- [x] **Phase 33: Classifier Foundation** - Fix tmux line joining, expand HIDDEN patterns, fix GSD banner matching (completed 2026-04-04)
- [x] **Phase 34: Feedback Pipeline** - DB schema, API endpoints, reclassify logic for user corrections (completed 2026-04-04)
- [x] **Phase 35: Feedback UI + Send Experience** - Context menu for corrections, send confirmation, working status reliability (completed 2026-04-04)
- [x] **Phase 36: Message Rendering + New Types** - Markdown in chat bubbles, terminal text preservation, NEXT_UP type (completed 2026-04-05)

## Phase Details

### Phase 33: Classifier Foundation
**Goal**: Chat messages are dramatically less noisy -- hidden output stays hidden and GSD banners render correctly
**Depends on**: Phase 32 (v4.0 complete)
**Requirements**: CLS-01, CLS-02, CLS-03
**Success Criteria** (what must be TRUE):
  1. Long Claude output lines no longer appear as duplicate or fragmented messages in chat
  2. Tool calls (Update, Read collapsed summaries), task tree lines, selection UI chrome, session rating prompts, and background notifications no longer appear as visible TEXT messages
  3. GSD workflow banners with heavy horizontal rules and `GSD` prefix are classified as STAGE_BANNER, not TEXT
**Plans:** 1/1 plans complete

Plans:
- [ ] 33-01-PLAN.md — Fix tmux -J flag, expand HIDDEN patterns, add GSD banner STAGE_BANNER patterns

### Phase 34: Feedback Pipeline
**Goal**: Server can receive, store, and serve classifier corrections so the UI has a working backend to talk to
**Depends on**: Phase 33
**Requirements**: FBK-01, FBK-02, FBK-03, FBK-05
**Success Criteria** (what must be TRUE):
  1. A `gsd_message_feedback` table exists in SQLite storing message_id, old_type, new_type, content snapshot, and timestamp
  2. POSTing a correction to the API immediately updates the message type in the database (reclassify on submit)
  3. GET endpoint returns feedback history that can be used to identify pattern gaps
  4. Corrections submitted for one project apply universally -- patterns are not project-scoped
**Plans:** 1/1 plans complete

Plans:
- [ ] 34-01-PLAN.md — DB migration, PatternManager, feedback API endpoints, classifier wiring

### Phase 35: Feedback UI + Send Experience
**Goal**: Users can correct misclassified messages in-place and get immediate confirmation when sending commands
**Depends on**: Phase 34
**Requirements**: FBK-04, SEND-01, SEND-02, WORK-01, WORK-02
**Success Criteria** (what must be TRUE):
  1. Right-clicking (desktop) or long-pressing (mobile) a chat message opens a context menu to select the correct message type
  2. After sending a command, an outbound message bubble appears immediately in the chat (optimistic echo)
  3. Session state visibly changes to "Working" within 1 second of sending a command (optimistic status)
  4. Working indicator displays actual tmux status text (e.g. "Working... 1m 17s . 304 tokens") instead of generic label
  5. Status updates reflect Claude starting/stopping work within 3 seconds
**Plans:** 2/2 plans complete

Plans:
- [ ] 35-01-PLAN.md — Radix context menu on chat messages for classifier feedback corrections
- [ ] 35-02-PLAN.md — Optimistic working state on send, faster status polling when active

### Phase 36: Message Rendering + New Types
**Goal**: Chat messages render rich content (markdown, tables, code) and NEXT_UP blocks surface actionable GSD commands
**Depends on**: Phase 33
**Requirements**: CLS-04, REND-01, REND-02
**Success Criteria** (what must be TRUE):
  1. Chat messages containing markdown (headers, bold, lists, code blocks, tables) render as formatted HTML, not raw text
  2. Terminal-formatted content (ASCII tables, indented output) is preserved or converted to readable format in chat bubbles
  3. "Next Up" blocks with `/gsd:` commands are recognized as NEXT_UP type and render with tappable command chips
**Plans:** 2/2 plans complete

Plans:
- [ ] 36-01-PLAN.md — NEXT_UP classifier patterns, TypeScript types, and classifier tests
- [ ] 36-02-PLAN.md — Markdown TEXT rendering, terminal detection, NextUpCard with tappable commands

## Progress

**Execution Order:** 33 → 34 → 35 → 36

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 33. Classifier Foundation | 1/1 | Complete    | 2026-04-04 | - |
| 34. Feedback Pipeline | 1/1 | Complete    | 2026-04-04 | - |
| 35. Feedback UI + Send Experience | 2/2 | Complete    | 2026-04-05 | - |
| 36. Message Rendering + New Types | 2/2 | Complete   | 2026-04-05 | - |
