# Requirements: GSD Dashboard

**Defined:** 2026-04-01
**Core Value:** At a glance, see where every GSD project stands and interact with any session

## v3.0 Requirements

Requirements for Autopilot & Cost Intelligence milestone. Each maps to roadmap phases.

### Autopilot

- [ ] **AUTO-01**: User can trigger "Plan All Phases" to batch-plan remaining phases for a project
- [ ] **AUTO-02**: User can launch autonomous execution that chains plan → execute → verify per phase
- [ ] **AUTO-03**: User can pause autopilot from the dashboard (stops at next safe point)
- [ ] **AUTO-04**: User can resume a paused autopilot run
- [x] **AUTO-05**: Autopilot stops automatically after 3 consecutive failures on same phase (circuit breaker)
- [ ] **AUTO-06**: Failed phases extract failure context and retry with adjusted approach (failure learning)
- [ ] **AUTO-07**: Autopilot displays real-time progress (current phase, task, elapsed time) via WebSocket

### Cost Intelligence

- [ ] **COST-01**: Dashboard tracks Claude Max session usage (tokens consumed vs limit)
- [ ] **COST-02**: Dashboard tracks Claude Max weekly usage with projected burn rate
- [ ] **COST-03**: Visual alerts at 80% (yellow) and 95% (red) of usage limits
- [ ] **COST-04**: Autopilot auto-pauses when usage reaches configurable threshold
- [ ] **COST-05**: External services page shows status and cost for Railway, GitHub, Claude, OpenAI, and other configured services
- [ ] **COST-06**: Per-project cost badges visible on project cards

### Card & State UX

- [ ] **UX-01**: "Waiting" state accurately means waiting on human input — not agent-thinking or processing
- [ ] **UX-02**: Card status refreshes automatically when terminal overlay is closed
- [ ] **UX-03**: Project cards show link to GitHub issues for the project
- [ ] **UX-04**: Task list suggests "Archive All" after using Copy
- [ ] **UX-05**: Cards show dynamic shortcut to next recommended GSD command
- [ ] **UX-06**: User can pause a project card (defined pause state with visual indicator)
- [ ] **UX-07**: Messages tab distinguishes Claude vs human messages with different background colors and alignment

## v3.1 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Automation

- **ADV-01**: Email receipt parsing pipeline for automated cost ingestion from forwarded invoices
- **ADV-02**: Per-project cost budgets with automatic enforcement
- **ADV-03**: New project creation: one-click directory + tmux + Claude launch from dashboard
- **ADV-04**: Predictive cost estimates based on historical phase data

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-fix forever (unlimited retries) | Masks real blockers, wastes tokens — circuit breaker is safer |
| Auto-downgrade model on cost limit | Quality drops unpredictably — better to pause and alert |
| Predict phase completion time | Non-deterministic AI execution makes time estimates unreliable |
| Multi-user auth | Single developer tool |
| Pause entire project hierarchy | Complex state management, high risk for low value |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTO-01 | Phase 25 | Pending |
| AUTO-02 | Phase 25 | Pending |
| AUTO-03 | Phase 25 | Pending |
| AUTO-04 | Phase 25 | Pending |
| AUTO-05 | Phase 24 | Complete |
| AUTO-06 | Phase 25 | Pending |
| AUTO-07 | Phase 25 | Pending |
| COST-01 | Phase 26 | Pending |
| COST-02 | Phase 26 | Pending |
| COST-03 | Phase 26 | Pending |
| COST-04 | Phase 26 | Pending |
| COST-05 | Phase 26 | Pending |
| COST-06 | Phase 26 | Pending |
| UX-01 | Phase 24 | Pending |
| UX-02 | Phase 24 | Pending |
| UX-03 | Phase 27 | Pending |
| UX-04 | Phase 27 | Pending |
| UX-05 | Phase 27 | Pending |
| UX-06 | Phase 27 | Pending |
| UX-07 | Phase 27 | Pending |

**Coverage:**
- v3.0 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0

---
*Requirements defined: 2026-04-01*
*Last updated: 2026-04-01 — traceability complete after roadmap creation*
