---
phase: 29
slug: chat-list-view
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (server), vite build (client) |
| **Config file** | package.json scripts |
| **Quick run command** | `npm run build` |
| **Full suite command** | `npm run test:server && npm run build` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build` (client compiles)
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | INF-04 | build | `npm run build` (chatscope theme compiles) | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 1 | CHAT-01,02,03 | build+visual | `npm run build` + visual check | ❌ W0 | ⬜ pending |
| 29-02-01 | 02 | 2 | CHAT-04 | build | `npm run build` (filter tabs render) | ❌ W0 | ⬜ pending |
| 29-02-02 | 02 | 2 | CHAT-05 | build+visual | `npm run build` + tap opens chat | ❌ W0 | ⬜ pending |

---

## Wave 0 Requirements

*Existing infrastructure covers framework setup. No new test files needed — this phase is primarily UI work verified by build + visual inspection.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Chat list renders correctly on mobile | CHAT-01 | Visual + touch UX | Open Railway URL on phone, verify scroll and tap work |
| Dark/light theme on chatscope | INF-04 | Visual verification | Toggle theme, verify no broken colors |
| State-colored borders visible | CHAT-03 | Visual verification | Check yellow/green/red/grey borders on rows |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
