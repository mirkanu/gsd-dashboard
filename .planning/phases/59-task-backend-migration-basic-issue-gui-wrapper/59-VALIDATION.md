---
phase: 59
slug: task-backend-migration-basic-issue-gui-wrapper
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 59 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest (server) + Vitest (client) |
| **Config file** | `package.json` (jest/vitest config) |
| **Quick run command** | `npm run test:server` |
| **Full suite command** | `npm run test:server && npm run test:client` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:server`
- **After every plan wave:** Run `npm run test:server && npm run test:client`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 59-01-01 | 01 | 1 | TSK-01 | — | task_backend defaults to "dashboard"; no unauthorized field write | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 59-01-02 | 01 | 1 | TSK-02 | — | github_repo stored only after successful migration | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 59-02-01 | 02 | 2 | TSK-01,TSK-02 | T-59-01 | PAT not exposed in migration response; only repo owner can migrate | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 59-02-02 | 02 | 2 | TSK-08 | T-59-02 | Snapshot file created before any GitHub API call | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 59-02-03 | 02 | 2 | TSK-09 | — | task_backend stays "dashboard" on partial failure | unit | `npm run test:server` | ❌ W0 | ⬜ pending |
| 59-03-01 | 03 | 2 | TSK-01 | — | GsdProject type includes task_backend and github_repo | type | `npm run mcp:typecheck` | ❌ W0 | ⬜ pending |
| 59-04-01 | 04 | 3 | TSK-02 | — | StageTransitionModal shows migration step with skip option | unit | `npm run test:client` | ❌ W0 | ⬜ pending |
| 59-05-01 | 05 | 3 | TSK-01,TSK-08 | — | TasksTab renders GitHub link when task_backend=github | unit | `npm run test:client` | ❌ W0 | ⬜ pending |
| 59-05-02 | 05 | 3 | TSK-09 | — | Rollback button present for 7 days, absent after | unit | `npm run test:client` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/routes/__tests__/task-migration.test.js` — stubs for TSK-01, TSK-02, TSK-08, TSK-09 migration route
- [ ] `client/src/components/__tests__/TasksTab.test.tsx` — stubs for dashboard vs. github backend branches
- [ ] `client/src/components/__tests__/StageTransitionModal.test.tsx` — stub for migration step in Beta→Launched flow

*Note: Jest and Vitest infrastructure already present — no new framework installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GitHub Issues appear in GitHub after migration | TSK-02 | Requires live GitHub API + real PAT | Trigger migration on a test project, verify issues appear at `github.com/{owner}/{repo}/issues` |
| Snapshot file is git-trackable | TSK-08 | Filesystem + git interaction | Run migration, check snapshot file exists in project root, `git status` shows untracked file |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
