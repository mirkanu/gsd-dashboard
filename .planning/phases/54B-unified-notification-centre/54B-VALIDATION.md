---
phase: 54B
slug: unified-notification-centre
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-29
---

# Phase 54B — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest (Node test runner via `npm run test:server`) |
| **Config file** | `package.json` scripts |
| **Quick run command** | `npm run test:server` |
| **Full suite command** | `npm run test:server && npm run test:client` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:server`
- **After every plan wave:** Run `npm run test:server && npm run test:client`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 54B-01-01 | 01 | 1 | NTF-01 | — | Schema migration additive only | unit | `npm run test:server` | created in Plan 01 Task 1 (TDD) | ⬜ pending |
| 54B-01-02 | 01 | 1 | NTF-02 | — | Policy defaults correctly applied | unit | `npm run test:server` | created in Plan 01 Task 1 (TDD) | ⬜ pending |
| 54B-02-01 | 02 | 2 | NTF-03 | — | NotificationCentre routes events correctly | unit | `npm run test:server` | created in Plan 01 Task 2 (TDD) | ⬜ pending |
| 54B-02-02 | 02 | 2 | NTF-03 | — | Duplicate suppression within window | unit | `npm run test:server` | created in Plan 01 Task 2 (TDD) | ⬜ pending |
| 54B-03-01 | 03 | 2 | NTF-04 | — | Policy CRUD API returns correct shapes | unit | `npm run test:server` | created in Plan 03 execution | ⬜ pending |
| 54B-04-01 | 04 | 3 | NTF-04 | — | UI toggles persist correctly | manual | Playwright UAT | N/A | ⬜ pending |
| 54B-05-01 | 05 | 4 | NTF-05 | — | Old call sites removed, no direct Telegram sends | unit | `npm run test:server` | created in Plan 04 execution | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Test stubs are created as the **first step of Plan 01 execution** (TDD style — executor writes tests before implementation). No separate Wave 0 plan is needed.

The three test files are created inline during Plan 01 execution:

- `server/__tests__/notificationCentre.test.js` — stubs for NTF-03 (policy evaluation, dedup); written before `notificationCentre.js` implementation in Task 2
- `server/__tests__/notificationPolicy.test.js` — stubs for NTF-01, NTF-02 (schema + defaults); written before `db.js` migrations in Task 1
- `server/__tests__/notificationRoutes.test.js` — stubs for NTF-04 (API CRUD); written at the start of Plan 03 Task 1

The executor MUST write failing tests first, then implement until tests pass (RED → GREEN per TDD contract in Plan 01 task `tdd="true"` attribute).

*Existing infrastructure (jest) covers the phase — no new framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| UI notification settings panel renders and persists toggles | NTF-04 | React component + DOM interaction | Open dashboard, navigate to notification settings, toggle events on/off, reload and verify state persists |
| Telegram message actually arrives with correct format | NTF-05 | External delivery channel | Trigger a qualifying event, verify Telegram message arrives within 5 seconds |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or test creation is part of execution scope
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered: test stubs created inline during Plan 01 TDD execution
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
