---
gsd_state_version: 1.0
milestone: v4.3
milestone_name: Optimisation & Cost Intelligence
current_plan: 3
status: completed
stopped_at: Completed quick task 44 (auto-deploy-railway-on-tunnel-rotate)
last_updated: "2026-04-11T17:50:00.000Z"
last_activity: 2026-04-11
progress:
  total_phases: 5
  completed_phases: 2
  total_plans: 6
  completed_plans: 6
  percent: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-07)

**Core value:** At a glance, see where every GSD project stands and interact with any session
**Current focus:** v4.3 — Optimisation & Cost Intelligence (roadmap complete, ready to plan Phase 43)

## Current Position

Milestone: v4.3 Optimisation & Cost Intelligence
Phase: 43 — Project Status Accuracy (in progress)
Current Plan: 3
Total Plans in Phase: 3
Status: Plan 01 complete — tmux detection primitives (STAT-02 + STAT-04 fixed at the primitive layer). Ready for Plan 02 (background poller).
Last activity: 2026-04-11 - Completed quick task 44: auto-deploy Railway when Cloudflare tunnel URL rotates

Progress: [█░░░░░░░░░] 6% (1/3 plans in Phase 43, 0/5 phases)

## Performance Metrics

**v1.0 velocity:** 9 plans, 3 phases, 1 day (2026-03-18)
**v1.1 velocity:** 7 plans, 3 phases, 1 day (2026-03-21)
**v1.2 velocity:** 4 plans, 2 phases, 2 days (2026-03-22 - 2026-03-23)
**v2.0 velocity:** 6 plans, 3 phases, 2 days (2026-03-24 - 2026-03-25)
**v2.1 velocity:** 11 plans, 5 phases, 3 days (2026-03-26 - 2026-03-28)
**v3.0 velocity:** 20 plans, 11 phases + 18 quick tasks, 4 days (2026-03-31 - 2026-04-03)
**v4.1 velocity:** 6 plans, 4 phases + 10 quick tasks, 2 days (2026-04-04 - 2026-04-06)
**v4.2 velocity:** 9 plans, 6 phases + 5 quick tasks, 3 days (2026-04-07 - 2026-04-10)

## Accumulated Context

### Decisions

- [v4.1]: Terminal-first approach beats chat classifier — raw terminal is more reliable, faster, and always accurate
- [v4.1]: Async tmux + API caching critical for responsiveness (sync calls blocked event loop 5-15s)
- [v4.2]: Phases 37-38 are foundational fixes (auth, terminal reliability, light mode) — do before new features
- [Phase 37-auth-terminal-reliability]: 20s ping interval on terminal WS (vs 30s main WS) — terminal proxies are less tolerant of idle
- [Phase 37-auth-terminal-reliability]: Terminal reconnect reuses xterm Terminal instance — preserves scrollback and avoids re-init flicker
- [Phase 37]: Cookie auth over JWT: simpler, no secret management, single-user dashboard
- [Phase 37]: In-memory token store: sufficient for single-user local dashboard
- [Phase 38]: xterm selectionBackground uses indigo rgba(99,102,241) to match ::selection CSS override
- [Phase 38]: Terminal header buttons use hover:text-gray-900 instead of hover:text-white — visible in both light and dark mode
- [Phase 38]: Status colors: waiting=blue-500, paused=orange-500 per UX-03 spec across all 4 views
- [Phase 39]: Flex layout over grid for resizable columns — grid can't accommodate drag handle dividers as siblings; middle uses flex-1 not explicit width to avoid floating-point sum edge cases
- [Phase 40-external-services-dashboard]: Services feature: Promise.allSettled + AbortSignal.timeout(5000) for parallel fetch with graceful fallback to unknown status
- [Phase 41-claude-usage-tracking]: Export calculateCost as named export from pricing.js for cross-route reuse; sessionCost is null (not 0) when no data exists
- [Phase 41]: UsagePanel self-fetches data (no props) since it shows global usage; 0 weekly limit constant; error hides panel silently
- [Phase 42]: Reused loadConfig() pattern from gsd.js for config routes rather than extracting shared module
- [Phase 42]: telegram_alerts stored as JSON string in SQLite, parsed on read
- [Phase 42-configuration-ui]: Global tab shows only CLAUDE.md (no verbosity/telegram); global defaults deferred to follow-up quick task
- [Phase 42-configuration-ui]: Auto-save on dropdown/toggle change; explicit Save button only for free-text CLAUDE.md editor
- [Phase 42-configuration-ui]: Proxy required passthrough fix to forward /api/config and non-GET methods to backend
- [v4.3 roadmap]: Status accuracy (Phase 43) first as foundational fix; Services foundation (Phase 45) before API integrations (Phase 46) because APIs populate the same `external_service_costs` table the email parser uses
- [v4.3 roadmap]: Credentials (Railway PAT, OpenAI admin key, Vercel token) stored in SQLite settings table, not env vars — survives redeploy, editable via UI
- [v4.3 roadmap]: Manual CLAUDE.md textarea removed entirely in Phase 47; replaced by AI-guided chat + diff approval
- [v4.3 roadmap]: Phase 47 requires user-testing checkpoint because AI integration is novel
- [Phase 43]: 3s change-heuristic window tuned to Claude Code tool-call streaming cadence (1-2s bursts)
- [Phase 43]: paneHashCache kept in-memory only — no DB writes, honors backend transaction boundaries rule
- [Phase 43]: extractCurrentTask is additive; extractStatusLine untouched (different purpose, still used for statusText)
- [Phase 43]: Silent initial seed — first poll never broadcasts, avoids boot-time broadcast storms
- [Phase 43]: 2s poll interval, recursive setTimeout prevents overlapping ticks
- [Phase 43]: Proxy mode (GSD_DATA_URL) never runs the poller; Railway forwards upstream snapshots through existing cache
- [Phase 43]: Route-level snapshot-preferred merge keeps projects API and WebSocket messages consistent while degrading safely on cold start
- [Phase 43]: Plan 03: Updated ChatListView alongside ProjectCard — live UI path renders via ChatListView (@chatscope), ProjectCard is dead code kept in sync
- [Phase 43]: Plan 03: Single nowMs useState + 1s setInterval drives elapsed-time ticks across all cards — cheap React reconciliation at ~10 cards
- [Phase 43]: Plan 03: patchProjectsOnStateChange returns input array by reference on unknown project — avoids spurious re-renders during cold-start races
- [Phase 44]: Plan 02: PricingEditor kept self-contained — Plan 03 owns UsagePage wiring so both can land atomically
- [Phase 44]: Plan 02: Per-row dirty/saving state + per-row Save button instead of global save — prevents accidental bulk writes
- [Phase 44]: Plan 02: Inline tips always visible (not collapsible) in PricingEditor header so first-time users see the cost formula immediately
- [Phase 44-usage-display-enhancements]: API evolution: /api/pricing/window kept fully additive - new token totals and by_model fields alongside existing cost/from/by_project, so UsagePanel and UsagePage keep working without changes
- [Phase 44-usage-display-enhancements]: by_model sorted by cost desc server-side; unknown models fall back to display_name = raw model string and model_pattern = null
- [Phase 44]: Plan 03: Parent-owned refetch pattern — PricingEditor calls props.onChange() after upsert, UsagePage passes fetchData directly so saving a rate triggers a single source-of-truth refetch
- [Phase 44]: Plan 03: Railway proxy mode (GSD_DATA_URL) requires PM2 gsd-dashboard restart after backend-touching deploys — Railway alone doesn't refresh the upstream

### Pending Todos

- Plan + execute Phase 43 (Project Status Accuracy) — run `/gsd:plan-phase 43`
- Plan Phase 44 (Usage Display Enhancements)
- Plan Phase 45 (Services Cost Tracking Foundation)
- Plan Phase 46 (Services API Integrations)
- Plan Phase 47 (AI-Guided CLAUDE.md Editor)
- Simplify cookieAuth: skip all `/api/` paths and rely on client-side auth gate only (carried over from v4.2)

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 35 | Fix auth blocking dashboard access - AUTH_REQUIRED error | 2026-04-07 | 7ba51c5 | [35-fix-auth-blocking-dashboard-access-auth-](./quick/35-fix-auth-blocking-dashboard-access-auth-/) |
| 36 | Add GSD MCP tools and disable dashboard_ tools | 2026-04-07 | 023ed67 | [36-add-gsd-mcp-tools-and-disable-dashboard-](./quick/36-add-gsd-mcp-tools-and-disable-dashboard-/) |
| 37 | Add dedicated Usage page with cross-project cost summary | 2026-04-09 | b6db8bc | [37-add-dedicated-usage-page-with-cross-proj](./quick/37-add-dedicated-usage-page-with-cross-proj/) |
| 38 | Add global default settings with apply-to-all prompt | 2026-04-10 | 282e867 | [38-add-global-default-settings-with-apply-t](./quick/38-add-global-default-settings-with-apply-t/) |
| 39 | Reduce mobile terminal scroll sensitivity | 2026-04-10 | 0691942 | [39-reduce-mobile-terminal-scroll-sensitivit](./quick/39-reduce-mobile-terminal-scroll-sensitivit/) |
| 40 | Add copy button to each task row beside Archive | 2026-04-10 | 75f96ca | [40-add-copy-single-task-button-beside-archi](./quick/40-add-copy-single-task-button-beside-archi/) |
| 41 | Add Archive All + icon-only All: group | 2026-04-10 | (pending) | [41-add-archive-all-button-icon-only-all-pre](./quick/41-add-archive-all-button-icon-only-all-pre/) |
| 42 | Fix usage window filter to include long-running sessions | 2026-04-11 | 38c2196 | [42-fix-usage-window-filter-to-include-long-](./quick/42-fix-usage-window-filter-to-include-long-/) |
| 43 | Swap ngrok → Cloudflare Tunnel (pivoted from Tailscale) + zombie cleanup | 2026-04-11 | e391629 | [43-switch-tunnel-from-ngrok-to-tailscale-fu](./quick/43-switch-tunnel-from-ngrok-to-tailscale-fu/) |
| 44 | Auto-deploy Railway when Cloudflare tunnel URL rotates | 2026-04-11 | d7688f3 | [44-auto-deploy-railway-when-cloudflared-tun](./quick/44-auto-deploy-railway-when-cloudflared-tun/) |
| Phase 43 P01 | 25min | 2 tasks | 2 files |
| Phase 43 P02 | 15min | 2 tasks | 4 files |
| Phase 43 P03 | ~13min | 3 tasks | 7 files |
| Phase 44 P02 | 4min | 2 tasks | 2 files |
| Phase 44-usage-display-enhancements P01 | 8min | 2 tasks | 2 files |
| Phase 44-usage-display-enhancements P03 | 12min | 3 tasks | 2 files |

## Session Continuity

Last session: 2026-04-11T08:19:01.648Z
Stopped at: Completed 44-03-PLAN.md
Resume file: None
Next action: Run `/gsd:plan-phase 43` to decompose Phase 43 (Project Status Accuracy) into executable plans
