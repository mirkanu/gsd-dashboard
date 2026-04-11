# Requirements: GSD Dashboard

**Defined:** 2026-04-10
**Core Value:** At a glance, see where every GSD project stands and interact with any session

## v4.3 Requirements

Requirements for Optimisation & Cost Intelligence milestone.

### Project Status Accuracy

- [x] **STAT-01**: Project card status updates in real-time via WebSocket push (no polling delay)
- [x] **STAT-02**: Status detection correctly identifies "Working" vs "Waiting" state (fix current false "Waiting" reports)
- [x] **STAT-03**: Project cards show elapsed time in current state (e.g., "Working 2m 30s" / "Waiting 5m")
- [x] **STAT-04**: Project list shows current task preview instead of "Chat" placeholder (e.g., "planning phase 14 UI integration")

### Usage & Cost Display

- [x] **USG-01**: Usage page displays token counts (input/output/cache) alongside dollar costs
- [x] **USG-02**: Usage page includes editable per-model pricing editor (reuses existing `/api/pricing` rules)
- [x] **USG-03**: Pricing editor shows helpful tips explaining cost components (input vs output vs cache) per model
- [x] **USG-04**: Usage page shows model breakdown (Opus vs Sonnet vs Haiku) for weekly and daily views

### Services Page UI

- [ ] **SVC-01**: Each service has a 7-day uptime sparkline showing historical status

### Services Cost Tracking

- [ ] **SVC-02**: Email billing parser — forward receipts from all services, extract amount/date/service into `external_service_costs` SQLite table (extends existing YNAB parser pattern)
- [ ] **SVC-03**: Railway GraphQL integration fetches current usage and cost via PAT
- [ ] **SVC-04**: OpenAI admin API integration fetches daily usage via admin API key
- [ ] **SVC-05**: Vercel API integration fetches team billing data (Pro tier)
- [x] **SVC-06**: Manual cost entry fallback — type fixed monthly costs for services without API or email
- [x] **SVC-07**: Services page displays cost alongside status — monthly total per service + per-project rollup
- [x] **SVC-08**: API credentials (Railway PAT, OpenAI admin key, Vercel token) stored in SQLite settings table, not env vars

### AI-Guided CLAUDE.md Editor

- [ ] **CFG-04**: Manual CLAUDE.md textarea editing is removed from the Config page
- [ ] **CFG-05**: Config page has a chat interface where user describes desired changes; AI has full GSD workflow context and reads the current CLAUDE.md before suggesting edits
- [ ] **CFG-06**: AI produces a diff preview (old vs new) showing proposed changes before applying
- [ ] **CFG-07**: User can approve, reject, or tweak each diff before it is written to disk
- [ ] **CFG-08**: Separate "Review my CLAUDE.md" action asks the AI for improvement suggestions without requiring a chat prompt

## Future Requirements

Deferred from previous milestones. Tracked but not in current roadmap.

### Cost Intelligence
- **COST-05**: Autopilot cost gate with configurable cost limits

### Project Management
- **CREATE-01**: New project creation from dashboard
- **GH-01**: GitHub issues link on project cards

### Services (deferred from v4.3)
- **SVC-09**: GitHub Actions cost tracking (not currently incurring costs)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-user auth / RBAC | Single developer tool |
| Real-time cost alerts | Defer until usage tracking proves valuable |
| Manual CLAUDE.md editing | Replaced by AI-guided workflow in this milestone |
| Scraping billing pages | Fragile, against ToS — use email or official API only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STAT-01 | Phase 43 | Complete |
| STAT-02 | Phase 43 | Complete |
| STAT-03 | Phase 43 | Complete |
| STAT-04 | Phase 43 | Complete |
| USG-01 | Phase 44 | Complete |
| USG-02 | Phase 44 | Complete |
| USG-03 | Phase 44 | Complete |
| USG-04 | Phase 44 | Complete |
| SVC-02 | Phase 45 | Pending |
| SVC-06 | Phase 45 | Complete |
| SVC-07 | Phase 45 | Complete |
| SVC-08 | Phase 45 | Complete |
| SVC-01 | Phase 46 | Pending |
| SVC-03 | Phase 46 | Pending |
| SVC-04 | Phase 46 | Pending |
| SVC-05 | Phase 46 | Pending |
| CFG-04 | Phase 47 | Pending |
| CFG-05 | Phase 47 | Pending |
| CFG-06 | Phase 47 | Pending |
| CFG-07 | Phase 47 | Pending |
| CFG-08 | Phase 47 | Pending |

**Coverage:**
- v4.3 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-04-10 | Traceability updated: 2026-04-10*
