---
phase: 28
slug: schema-classifier-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in, already used) |
| **Config file** | package.json `test:server` script |
| **Quick run command** | `npm run test:server` |
| **Full suite command** | `npm run test:server` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:server`
- **After every plan wave:** Run `npm run test:server`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | INF-01 | manual | chatscope renders without style conflicts | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | INF-02 | unit | `npm run test:server` (migration + insert) | ❌ W0 | ⬜ pending |
| 28-02-01 | 02 | 2 | MSG-01 | unit | `npm run test:server` (classifier patterns) | ❌ W0 | ⬜ pending |
| 28-02-02 | 02 | 2 | MSG-07 | unit | `npm run test:server` (hidden type filtering) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/classifier.test.js` — stubs for MSG-01, MSG-07
- [ ] `server/__tests__/chatMessages.test.js` — stubs for INF-02

*Existing test infrastructure (`server/__tests__/`) covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| chatscope renders in app without style conflicts | INF-01 | Visual verification needed | Install chatscope, render minimal component, check no Tailwind conflicts in browser |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
