---
phase: 24
slug: waiting-accuracy-safety-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-01
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in `--test` module (server), Vitest (client) |
| **Config file** | None (server) / `vitest.config.ts` (client) |
| **Quick run command** | `npm run test:server` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:server`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | UX-01 | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | UX-01 | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | UX-02 | integration | `npm run test:client` | ❌ W0 | ⬜ pending |
| 24-02-01 | 02 | 1 | AUTO-05 | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 24-02-02 | 02 | 1 | AUTO-05 | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 24-02-03 | 02 | 1 | AUTO-05 | integration | `npm run test:server` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/__tests__/tmux.test.js` — stubs for UX-01 (waiting state detection patterns)
- [ ] `server/__tests__/circuitBreaker.test.js` — stubs for AUTO-05 (failure counting, circuit opening)
- [ ] `server/__tests__/processSpawner.test.js` — stubs for detached process spawning and registry
- [ ] `client/src/components/__tests__/TerminalOverlay.test.tsx` — stubs for UX-02 (auto-refresh on close)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Terminal close refreshes card state visually | UX-02 | Requires real tmux session + browser | Close terminal overlay, observe card updates within 2s |
| Waiting badge matches actual terminal state | UX-01 | Requires real Claude Code session | Open Claude session, verify Working/Waiting badges match |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
