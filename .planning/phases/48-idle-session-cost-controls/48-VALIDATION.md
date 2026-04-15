---
phase: 48
slug: idle-session-cost-controls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (server) + vitest (client, if UI tests needed) |
| **Config file** | none — uses existing `npm run test:server` / `npm run test:client` |
| **Quick run command** | `npm run test:server -- --test-name-pattern='idle\|graceful\|tmux.cost'` |
| **Full suite command** | `npm run test:server && npm run test:client` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick-run command (filtered to idle/graceful/tmux-cost tests)
- **After every plan wave:** Run full server suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Filled in during planning. Planner derives task IDs + test types from CONTEXT.md decisions.

| Task ID | Plan | Wave | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|----------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | graceful shutdown primitive sends pause-work then kills tmux | unit (server) | `npm run test:server -- --test-name-pattern='graceful'` | ❌ W0 | ⬜ pending |
| TBD     | TBD  | TBD  | idle detector requires BOTH waiting+pane-unchanged | unit (server) | `npm run test:server -- --test-name-pattern='idle.detect'` | ❌ W0 | ⬜ pending |
| TBD     | TBD  | TBD  | autopilot sessions get 2× threshold | unit (server) | `npm run test:server -- --test-name-pattern='idle.autopilot'` | ❌ W0 | ⬜ pending |
| TBD     | TBD  | TBD  | 6h+ working sessions force-killed without handoff | unit (server) | `npm run test:server -- --test-name-pattern='force.kill'` | ❌ W0 | ⬜ pending |
| TBD     | TBD  | TBD  | tmux cost = RSS * Railway rate, per-session $/day | unit (server) | `npm run test:server -- --test-name-pattern='tmux.cost'` | ❌ W0 | ⬜ pending |
| TBD     | TBD  | TBD  | daily cost log writes to external_service_costs with tmux_cost_estimate prefix | integration (server) | `npm run test:server -- --test-name-pattern='cost.log'` | ❌ W0 | ⬜ pending |
| TBD     | TBD  | TBD  | pause-work failure → kill + Telegram | unit (server) | `npm run test:server -- --test-name-pattern='graceful.fallback'` | ❌ W0 | ⬜ pending |
| TBD     | TBD  | TBD  | manual Pause button uses shared graceful shutdown | integration (server) | `npm run test:server -- --test-name-pattern='pause.route'` | ❌ W0 | ⬜ pending |
| TBD     | TBD  | TBD  | new `/api/*` routes added to PROXY_PREFIXES | unit (server) | `npm run test:server -- --test-name-pattern='proxy.prefix'` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/test/idle-detector.test.js` — stubs for idle signal combination, threshold math, autopilot override
- [ ] `server/test/graceful-shutdown.test.js` — stubs for pause-work send, completion polling, fallback kill+Telegram
- [ ] `server/test/tmux-cost.test.js` — stubs for RSS read, cost math, daily log write
- [ ] `server/test/pause-route.test.js` — stubs verifying manual Pause uses shared primitive
- [ ] `server/test/proxy-prefixes.test.js` — assertion that new Phase 48 routes are in PROXY_PREFIXES
- [ ] Shared fixtures: fake tmux (capture-pane output), fake `ps` (RSS output), in-memory SQLite

*Planner should place the actual test-stub files in Wave 0 of plan 01.*

---

## Manual-Only Verifications

| Behavior | Why Manual | Test Instructions |
|----------|------------|-------------------|
| Services page renders `$/day` column correctly on Railway | UI rendering + live data | Open live URL, Services page — each session row shows `$X.XX/day` beside status |
| Usage page banner shows total idle $/day sum | UI + aggregation | Open Usage page — banner near top shows `$X.XX/day wasted on idle sessions` |
| Idle session is auto-closed after 2h with pause-work handoff | End-to-end async behavior | Leave a waiting session for >2h, confirm: (a) STATE.md got new handoff entry, (b) tmux session gone, (c) Telegram arrived |
| ConfigurationPage has idle-timeout setting that persists across reload | Settings round-trip via SQLite | Change threshold in ConfigurationPage → reload → value persisted |
| Manual Pause button now shows "saving handoff..." before killing tmux | UX regression check | Click Pause on any session, confirm pause-work runs first |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
