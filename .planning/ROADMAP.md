# Roadmap: GSD Dashboard

## Milestones

- ✅ **v1.0 Foundation** — Phases 1-3 (shipped 2026-03-18) → [archive](milestones/v1-ROADMAP.md)
- ✅ **v1.1 File Viewer & Card Enhancements** — Phases 4-6 (shipped 2026-03-21) → [archive](milestones/v1.1-ROADMAP.md)
- ✅ **v1.2 GSD Stats & Live Data Pipeline** — Phases 7-8 (shipped 2026-03-23) → [archive](milestones/v1.2-ROADMAP.md)
- ✅ **v2.0 Project Control Plane** — Phases 9-11 (shipped 2026-03-25) → [archive](milestones/v2.0-ROADMAP.md)
- ✅ **v2.1 Session Intelligence & Terminal UX** — Phases 12-14, 16 (shipped 2026-03-28) → [archive](milestones/v2.1-ROADMAP.md)
- ✅ **v2.2 Project Tasks** — Phases 17-19 (shipped 2026-03-29)
- ✅ **v2.3 UX Polish & Claude Desktop** — Phases 21-23 (shipped 2026-03-30)
- ✅ **v3.0 Autopilot & Cost Intelligence** — Phases 24-27 (shipped 2026-04-03)
- 🚧 **v4.0 Chat-First Dashboard** — Phases 28-32 (in progress)

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

<details>
<summary>✅ v2.2 Project Tasks (Phases 17-20) — SHIPPED 2026-03-30</summary>

- [x] Phase 17: Task Data Layer (2/2 plans) — completed 2026-03-28
- [x] Phase 18: Task UI (2/2 plans) — completed 2026-03-28
- [x] Phase 18.1: Persistent Tunnel for Remote Tmux (2/2 plans) — completed 2026-03-29
- [x] Phase 19: Clipboard Export (1/1 plan) — completed 2026-03-29
- [x] Phase 20: Fix Railway Deployment (1/1 plan) — completed 2026-03-30

</details>

<details>
<summary>✅ v2.3 UX Polish & Claude Desktop (Phases 21-23) — SHIPPED 2026-03-30</summary>

- [x] Phase 21: Card UX Simplification (2/2 plans) — completed 2026-03-30
- [x] Phase 22: Mobile Terminal Fixes (1/1 plan) — completed 2026-03-30
- [x] Phase 23: Task Textarea and MCP Server (2/2 plans) — completed 2026-03-30

</details>

<details>
<summary>✅ v3.0 Autopilot & Cost Intelligence (Phases 24-27) — SHIPPED 2026-04-03</summary>

- [x] Phase 24: Waiting Accuracy + Safety Foundation (2/2 plans) — completed 2026-04-01
- [x] Phase 25: Autopilot Core (3/3 plans) — completed 2026-04-01
- [ ] Phase 26: Cost Intelligence — deferred
- [ ] Phase 27: Card UX Polish — deferred (subsumed by v4.0)

</details>

### 🚧 v4.0 Chat-First Dashboard

**Milestone Goal:** Replace the kanban board with a WhatsApp/Telegram-style chat interface where each project is a conversation with Claude/GSD, using @chatscope/chat-ui-kit-react.

- [ ] **Phase 28: Schema + Classifier Foundation** - Chat UI library, extended message schema, and tmux output classifier
- [ ] **Phase 29: Chat List View** - Project conversation list replacing the kanban board as primary navigation
- [ ] **Phase 30: Chat Window + Message Rendering** - Per-project chat with classified message bubbles and send box
- [ ] **Phase 31: Interactivity + Real-Time Streaming** - Tappable actions, unread badges, and WebSocket chat updates
- [ ] **Phase 32: Project Detail Panel** - Header-tap access to all controls, file tabs, and project metadata

---

## Phase Details

### Phase 28: Schema + Classifier Foundation
**Goal**: The data pipeline can receive raw tmux output, classify it into typed messages, and persist them for chat rendering
**Depends on**: Phase 27 (v3.0 complete)
**Requirements**: INF-01, INF-02, MSG-01, MSG-07
**Success Criteria** (what must be TRUE):
  1. @chatscope/chat-ui-kit-react and its styles are installed and a minimal chatscope component renders in the app without style conflicts
  2. The gsd_messages table has type and metadata columns, and inserting a classified message with type "stage_banner" persists and retrieves correctly
  3. The tmux output classifier receives raw terminal text and returns an array of typed message objects (stage_banner, checkpoint, completion, error, text)
  4. Tool calls, code output, and verbose working output are classified as "hidden" and excluded from chat-visible message queries
**Plans**: TBD

### Phase 29: Chat List View
**Goal**: Users see their projects as a sorted conversation list and can filter and select any project to open
**Depends on**: Phase 28
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, INF-04
**Success Criteria** (what must be TRUE):
  1. The main dashboard shows a conversation list (not kanban cards) with projects sorted by most recent message activity
  2. Each project row displays the project name, a preview of the last message, a relative timestamp, and an unread count badge
  3. Each row has a colored left border matching the project's session state (yellow=waiting, green=working, red=paused, grey=archived)
  4. Filter tabs (All, Waiting, Working, Paused, Archived) appear above the list, each showing a count, and tapping one filters the list
  5. Chatscope components render correctly in both light and dark themes with CSS variable overrides
**Plans**: TBD

### Phase 30: Chat Window + Message Rendering
**Goal**: Users can view a full conversation history for any project and send messages, with tmux output rendered as styled chat bubbles by type
**Depends on**: Phase 29
**Requirements**: CHAT-06, CHAT-07, CHAT-08, CHAT-10, MSG-02, MSG-03, MSG-04, MSG-05, MSG-06
**Success Criteria** (what must be TRUE):
  1. Tapping a project in the chat list opens a chat window showing the full message history as chat bubbles
  2. GSD stage banners appear as centered system messages; checkpoints/questions show tappable option buttons; next-up blocks show command chips; completion summaries appear as Claude-aligned messages
  3. Critical errors render with a red border; minor warnings are collapsed under an expandable summary
  4. A message input box at the bottom sends text to the project's tmux session via send-keys on submit
  5. A working indicator shows elapsed time, token count, and context window percentage as a gauge when the session is active
**Plans**: TBD

### Phase 31: Interactivity + Real-Time Streaming
**Goal**: Chat updates arrive in real time via WebSocket, users can tap suggested actions to compose replies, and unread counts stay accurate
**Depends on**: Phase 30
**Requirements**: ACT-01, ACT-02, ACT-03, INF-03
**Success Criteria** (what must be TRUE):
  1. Tapping a suggested command chip or next-up action inserts the text into the reply box without auto-sending
  2. Multi-choice answer buttons from GSD prompts insert the selected choice into the reply box when tapped
  3. New classified messages stream into the open chat window via WebSocket without requiring page refresh or polling
  4. When new messages arrive for a project the user is not currently viewing, the unread badge on that project's chat row increments in real time
**Plans**: TBD

### Phase 32: Project Detail Panel
**Goal**: Users can access all project controls, file viewers, and metadata by tapping the chat header, and paused/archived projects preserve full history
**Depends on**: Phase 30
**Requirements**: DET-01, DET-02, DET-03, DET-04, DET-05, CHAT-09
**Success Criteria** (what must be TRUE):
  1. Tapping the chat window header/title opens a slide-in or overlay panel with project details
  2. The detail panel contains all existing controls: autopilot start/pause/resume, pause project, archive/unarchive, and raw terminal access
  3. File tabs (State, Roadmap, Requirements, Plan) render markdown content in the detail panel
  4. Progress bars and status indicators (phase completion, session state, context tokens) are visible in the detail panel
  5. Paused and archived projects show their full chat history; typing a message in a paused/archived chat triggers a "Reopen session?" confirmation before sending
**Plans**: TBD

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
| 17. Task Data Layer | v2.2 | 2/2 | Complete | 2026-03-28 |
| 18. Task UI | v2.2 | 2/2 | Complete | 2026-03-28 |
| 18.1. Persistent Tunnel for Remote Tmux | v2.2 | 2/2 | Complete | 2026-03-29 |
| 19. Clipboard Export | v2.2 | 1/1 | Complete | 2026-03-29 |
| 20. Fix Railway Deployment | v2.2 | 1/1 | Complete | 2026-03-30 |
| 21. Card UX Simplification | v2.3 | 2/2 | Complete | 2026-03-30 |
| 22. Mobile Terminal Fixes | v2.3 | 1/1 | Complete | 2026-03-30 |
| 23. Task Textarea and MCP Server | v2.3 | 2/2 | Complete | 2026-03-30 |
| 24. Waiting Accuracy + Safety Foundation | v3.0 | 2/2 | Complete | 2026-04-01 |
| 25. Autopilot Core | v3.0 | 3/3 | Complete | 2026-04-01 |
| 26. Cost Intelligence | v3.0 | 0/3 | Deferred | - |
| 27. Card UX Polish | v3.0 | 0/3 | Deferred | - |
| 28. Schema + Classifier Foundation | v4.0 | 0/? | Not started | - |
| 29. Chat List View | v4.0 | 0/? | Not started | - |
| 30. Chat Window + Message Rendering | v4.0 | 0/? | Not started | - |
| 31. Interactivity + Real-Time Streaming | v4.0 | 0/? | Not started | - |
| 32. Project Detail Panel | v4.0 | 0/? | Not started | - |

---

## Deferred

### Phase 15: New Project Creation (Deferred to v3.1+)
**Goal**: Users can create a new GSD project — directory, tmux session, and Claude Code launch — from a single button in the dashboard
**Depends on**: Phase 9
**Requirements**: CREATE-01, CREATE-02, CREATE-03, CREATE-04
**Status**: Deferred to v3.1+

### Phase 26: Cost Intelligence (Deferred from v3.0)
**Goal**: Users can see real-time Claude Max token consumption and external service costs, and autopilot is gated by configurable cost limits
**Depends on**: Phase 24
**Requirements**: COST-01, COST-02, COST-03, COST-04, COST-05, COST-06
**Status**: Deferred — not required for v4.0 chat redesign

### Phase 27: Card UX Polish (Deferred from v3.0)
**Goal**: Project cards surface GitHub issues, dynamic GSD shortcuts, a pause state, and the message log distinguishes human vs Claude messages
**Depends on**: Phase 25
**Requirements**: UX-03, UX-04, UX-05, UX-06, UX-07
**Status**: Deferred — subsumed by v4.0 chat redesign (message styling, dynamic actions, pause state all handled in new chat UI)
