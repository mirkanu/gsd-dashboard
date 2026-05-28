---
phase: 58
slug: project-maturity-stages
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (client) / node:test (server) |
| **Config file** | `client/vite.config.ts` / `server/` |
| **Quick run command** | `npm run test:server` |
| **Full suite command** | `npm run test:server && npm run test:client` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:server`
- **After every plan wave:** Run `npm run test:server && npm run test:client`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | MAT-01 | — | stage defaults to draft | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 58-01-02 | 01 | 1 | MAT-01 | — | backfill chip hidden when stage set | unit | `npm run test:client` | ❌ W0 | ⬜ pending |
| 58-01-03 | 01 | 1 | MAT-06 | — | backfill chip visible when stage missing | unit | `npm run test:client` | ❌ W0 | ⬜ pending |
| 58-02-01 | 02 | 2 | MAT-03 | — | gate validation blocks invalid transitions | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 58-02-02 | 02 | 2 | MAT-04 | — | soft gate warns but does not block | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 58-02-03 | 02 | 2 | MAT-05 | — | BetterStack monitor created at Beta→Launched | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 58-02-04 | 02 | 2 | MAT-05 | — | R2 bucket created at Beta→Launched | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 58-02-05 | 02 | 2 | MAT-08 | — | kill flow requires DELETE confirmation | manual | visual inspection | N/A | ⬜ pending |
| 58-03-01 | 03 | 3 | MAT-02 | — | stage grouping toggle visible in Dashboard | unit | `npm run test:client` | ❌ W0 | ⬜ pending |
| 58-03-02 | 03 | 3 | MAT-07 | — | nudge event written to feed when eligible | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 58-03-03 | 03 | 3 | MAT-07 | — | nudge badge appears on card | unit | `npm run test:client` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/tests/stage-transitions.test.js` — gate validation, provisioning, reversibility
- [ ] `client/src/components/__tests__/StageTransitionModal.test.tsx` — wizard UI tests
- [ ] `client/src/components/__tests__/ChatListFilters.test.tsx` — stage grouping toggle

*Existing test infrastructure (vitest, node:test) covers all phase requirements — no new framework installation needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Kill/archive flow — Full delete requires typing DELETE | MAT-08 | Destructive action confirmation UX | Open Dashboard → find Draft project → click kill button → verify both Archive and Full delete options → attempt full delete without typing DELETE → verify it's blocked → type DELETE → verify modal proceeds |
| BetterStack monitor appears in dashboard after Beta→Launched | MAT-05 | External API side effect | Trigger Beta→Launched transition on test project → navigate to BetterStack dashboard → verify monitor exists |
| Retired project does not auto-start tmux | MAT-05 | System behavior on server restart | Retire a project → restart pm2 process → verify tmux session for retired project is not created |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
