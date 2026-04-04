---
phase: 30
slug: chat-window-message-rendering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (server), vite build (client) |
| **Config file** | package.json scripts |
| **Quick run command** | `npm run test:server && npm run build` |
| **Full suite command** | `npm run test:server && npm run build` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` (client compiles)
- **After every plan wave:** Run `npm run test:server && npm run build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | MSG-01 | unit | `npm run test:server` (classifier polling) | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | CHAT-06 | unit+build | `npm run test:server && npm run build` | ❌ W0 | ⬜ pending |
| 30-02-01 | 02 | 2 | MSG-02,03,04,05,06 | build+visual | `npm run build` + visual | ❌ W0 | ⬜ pending |
| 30-02-02 | 02 | 2 | CHAT-07 | build | `npm run build` (send box) | ❌ W0 | ⬜ pending |
| 30-02-03 | 02 | 2 | CHAT-08 | build+visual | `npm run build` (working indicator) | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `server/__tests__/classifierLoop.test.js` — stubs for TmuxClassifier polling tests

*Existing test infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Message types render visually correct | MSG-02-06 | Visual styling verification | Open chat, verify banner/error/checkpoint/completion rendering |
| Working indicator pulses with live data | CHAT-08 | Needs active Claude session | Start Claude in a project, verify indicator shows time/tokens/context |
| Mobile chat scroll and send | CHAT-07 | Touch UX | Test on phone via Railway URL |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 12s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
