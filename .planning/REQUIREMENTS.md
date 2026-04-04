# Requirements: GSD Dashboard

**Defined:** 2026-04-03
**Core Value:** At a glance, see where every GSD project stands and interact with any session

## v4.0 Requirements

Requirements for Chat-First Dashboard milestone. Each maps to roadmap phases.

### Chat List

- [x] **CHAT-01**: Projects displayed as chat rows sorted by most recent activity
- [x] **CHAT-02**: Each row shows project name, last message preview, timestamp, and unread count
- [x] **CHAT-03**: State-colored left border (yellow=waiting, green=working, red=paused, grey=archived)
- [x] **CHAT-04**: Filter tabs along top (All, Waiting, Working, Paused, Archived) with project counts
- [x] **CHAT-05**: Tapping a chat row opens the per-project chat window

### Chat Window

- [x] **CHAT-06**: Full chat history with messages parsed from tmux output, displayed as chat bubbles
- [x] **CHAT-07**: Message input box that sends text to tmux via send-keys on submit
- [x] **CHAT-08**: Working indicator: pulsing "Working... 14m 18s · 5.8k tokens · Context: 45%" with gauge
- [x] **CHAT-09**: Paused/archived projects show full chat history; sending triggers "Reopen session?" confirmation
- [x] **CHAT-10**: Back button returns to chat list

### Message Classification

- [x] **MSG-01**: Server-side tmux output classifier that parses terminal text into typed messages
- [x] **MSG-02**: GSD stage banners rendered as system messages (centered, styled)
- [x] **MSG-03**: Checkpoints/AskUserQuestion prompts rendered with tappable option buttons
- [x] **MSG-04**: Next Up blocks rendered with tappable command chips
- [x] **MSG-05**: Completion summaries rendered as Claude messages
- [x] **MSG-06**: Critical errors rendered as red-bordered messages; minor warnings collapsed
- [x] **MSG-07**: Tool calls, code output, and verbose working output hidden completely

### Interactivity

- [ ] **ACT-01**: Tapping a suggested command/action inserts it into reply box (not auto-send)
- [ ] **ACT-02**: Multi-choice answers from GSD rendered as tappable buttons that insert the choice
- [ ] **ACT-03**: Unread badge on chat rows when new messages arrive while not viewing that chat

### Project Detail Panel

- [x] **DET-01**: Tapping chat header/title opens project detail panel (slide-in or overlay)
- [x] **DET-02**: Contains all existing controls: autopilot, pause, archive, reopen, raw terminal
- [x] **DET-03**: File tabs (State, Roadmap, Requirements, Plan) with markdown rendering
- [x] **DET-04**: Progress bars and status indicators
- [x] **DET-05**: Project metadata (display name, session state, context tokens)

### Infrastructure

- [x] **INF-01**: Adopt @chatscope/chat-ui-kit-react for UI components
- [x] **INF-02**: Extend gsd_messages table schema for typed messages (type, metadata columns)
- [ ] **INF-03**: WebSocket streaming of classified messages for real-time chat updates
- [x] **INF-04**: Light/dark theme support for chatscope components (CSS variable overrides)

## Future Requirements

Deferred from v3.0 and earlier. Tracked but not in current roadmap.

### Cost Intelligence
- **COST-01**: Claude Max session and weekly token usage as progress bar with color coding
- **COST-02**: External services status/cost page (Railway, GitHub, Claude, OpenAI)
- **COST-03**: Autopilot cost gate — halt when cost limit reached

### Project Management
- **CREATE-01**: New project creation: one-click directory + tmux + Claude launch
- **TASK-01**: Task Archive All: suggest bulk archive after Copy
- **GH-01**: GitHub issues link on project cards

## Out of Scope

| Feature | Reason |
|---------|--------|
| End-to-end encryption | Single-user local tool, no security benefit |
| Message search | Defer to v4.1 — focus on core chat UX first |
| Voice messages / audio | Text-only interaction with Claude |
| Group chats / multi-user | Single developer tool |
| Message reactions / emoji | Not useful for project management context |
| Custom chat themes beyond light/dark | Two themes sufficient |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CHAT-01 | Phase 29 | Complete |
| CHAT-02 | Phase 29 | Complete |
| CHAT-03 | Phase 29 | Complete |
| CHAT-04 | Phase 29 | Complete |
| CHAT-05 | Phase 29 | Complete |
| CHAT-06 | Phase 30 | Complete |
| CHAT-07 | Phase 30 | Complete |
| CHAT-08 | Phase 30 | Complete |
| CHAT-09 | Phase 32 | Complete |
| CHAT-10 | Phase 30 | Complete |
| MSG-01 | Phase 28 | Complete |
| MSG-02 | Phase 30 | Complete |
| MSG-03 | Phase 30 | Complete |
| MSG-04 | Phase 30 | Complete |
| MSG-05 | Phase 30 | Complete |
| MSG-06 | Phase 30 | Complete |
| MSG-07 | Phase 28 | Complete |
| ACT-01 | Phase 31 | Pending |
| ACT-02 | Phase 31 | Pending |
| ACT-03 | Phase 31 | Pending |
| DET-01 | Phase 32 | Complete |
| DET-02 | Phase 32 | Complete |
| DET-03 | Phase 32 | Complete |
| DET-04 | Phase 32 | Complete |
| DET-05 | Phase 32 | Complete |
| INF-01 | Phase 28 | Complete |
| INF-02 | Phase 28 | Complete |
| INF-03 | Phase 31 | Pending |
| INF-04 | Phase 29 | Complete |

**Coverage:**
- v4.0 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---
*Requirements defined: 2026-04-03*
*Last updated: 2026-04-03 after v4.0 roadmap creation*
