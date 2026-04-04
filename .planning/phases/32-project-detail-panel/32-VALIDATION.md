---
phase: 32
slug: project-detail-panel
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-04
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | TypeScript compiler + vite build |
| **Quick run command** | `cd client && npx tsc --noEmit && npx vite build` |
| **Full suite command** | `npm run test:server && cd client && npx vite build` |
| **Estimated runtime** | ~12 seconds |

---

## Sampling Rate

- **After every task commit:** `cd client && npx vite build`
- **After every plan wave:** Full suite
- **Max feedback latency:** 12 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 32-01-T1 | 01 | 1 | DET-02, DET-04, DET-05 | build | `cd client && npx tsc --noEmit && npx vite build` | ⬜ pending |
| 32-01-T2 | 01 | 1 | DET-01, DET-03 | build | `cd client && npx vite build` | ⬜ pending |
| 32-02-T1 | 02 | 1 | CHAT-09 | build | `cd client && npx vite build` | ⬜ pending |

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Autopilot controls functional in panel | DET-02 | Needs live autopilot | Click start/pause in detail panel |
| Reopen confirmation shows for paused project | CHAT-09 | Needs paused tmux session | Pause a project, try sending message |
| Mobile drawer shows same controls as desktop panel | DET-02 | Visual + responsive | Test on phone via Railway |

---

## Validation Sign-Off

- [x] All tasks have automated verify
- [x] No watch-mode flags
- [x] Feedback latency < 12s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
