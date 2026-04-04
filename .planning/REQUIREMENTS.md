# Requirements: GSD Dashboard

**Defined:** 2026-04-04
**Core Value:** At a glance, see where every GSD project stands and interact with any session

## v4.1 Requirements

Requirements for Chat Polish milestone. Each maps to roadmap phases.

### Classifier Accuracy

- [ ] **CLS-01**: tmux capture-pane uses `-J` flag to join soft-wrapped lines, eliminating duplicate/fragmented messages
- [ ] **CLS-02**: 10+ missing HIDDEN patterns added (Update() calls, collapsed read summaries, task tree lines, selection UI chrome, session rating prompts, background notifications)
- [ ] **CLS-03**: GSD banner format correctly matched — heavy horizontal rules (`━━━`) with `GSD ►` prefix, not just markdown headings
- [ ] **CLS-04**: NEXT_UP blocks recognized as distinct type with tappable command rendering (▶ Next Up sections with `/gsd:` commands)

### Feedback System

- [ ] **FBK-01**: `gsd_message_feedback` SQLite table stores corrections (message_id, old_type, new_type, content snapshot, timestamp)
- [ ] **FBK-02**: POST endpoint to submit feedback and immediately reclassify the message in DB
- [ ] **FBK-03**: GET endpoint to retrieve feedback history for pattern improvement sessions
- [ ] **FBK-04**: Right-click (desktop) / long-press (mobile) context menu on chat messages to submit type corrections via Radix UI
- [ ] **FBK-05**: Corrections apply to all projects — patterns are universal

### Send Experience

- [ ] **SEND-01**: Immediate echo of sent message in chat with visual confirmation (optimistic outbound bubble)
- [ ] **SEND-02**: Session state changes to "Working" immediately after send (optimistic status update)

### Working Status

- [ ] **WORK-01**: Working indicator shows actual tmux status text pulled from capture-pane (e.g. "✻ Working… 1m 17s · 304 tokens")
- [ ] **WORK-02**: Status updates within 3 seconds of Claude starting/stopping work

### Message Rendering

- [ ] **REND-01**: Chat messages render markdown content (tables, headers, bold, code blocks, lists) using react-markdown or similar
- [ ] **REND-02**: Terminal-formatted text (ASCII tables, indentation) preserved or converted to readable format in chat bubbles

## Future Requirements

Deferred from previous milestones. Tracked but not in current roadmap.

### Cost Intelligence
- **COST-01**: Claude Max session and weekly token usage tracking
- **COST-02**: External services status/cost page
- **COST-03**: Autopilot cost gate

### Project Management
- **CREATE-01**: New project creation from dashboard
- **TASK-01**: Task Archive All
- **GH-01**: GitHub issues link on project cards

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-generated regex from feedback | Over-engineering — keep patterns in code, use feedback as evidence |
| NLP/ML classifier | Regex is sufficient for structured terminal output |
| Per-project pattern overrides | Output patterns are universal across all Claude Code sessions |
| Full terminal emulator in chat | Terminal overlay exists for raw access |
| Message editing/deletion | Not needed for monitoring tool |
| Bulk feedback correction | Defer to v4.2 unless trivial |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLS-01 | Phase 33 | Pending |
| CLS-02 | Phase 33 | Pending |
| CLS-03 | Phase 33 | Pending |
| CLS-04 | Phase 36 | Pending |
| FBK-01 | Phase 34 | Pending |
| FBK-02 | Phase 34 | Pending |
| FBK-03 | Phase 34 | Pending |
| FBK-04 | Phase 35 | Pending |
| FBK-05 | Phase 34 | Pending |
| SEND-01 | Phase 35 | Pending |
| SEND-02 | Phase 35 | Pending |
| WORK-01 | Phase 35 | Pending |
| WORK-02 | Phase 35 | Pending |
| REND-01 | Phase 36 | Pending |
| REND-02 | Phase 36 | Pending |

**Coverage:**
- v4.1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after roadmap creation*
