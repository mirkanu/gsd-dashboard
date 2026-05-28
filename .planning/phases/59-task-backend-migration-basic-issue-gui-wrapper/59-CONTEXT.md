# Phase 59: Task Backend Migration + GitHub Issues Link — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

When a Dashboard-created project transitions Beta → Launched, its open tasks migrate to GitHub Issues. The native TasksTab is then replaced with a single prominent "Open GitHub Issues →" link. No GitHub Issues GUI is built inside the Dashboard — GitHub's own UI handles all issue work after migration.

**Requirements in scope:** TSK-01, TSK-02, TSK-08, TSK-09
**Requirements dropped:** TSK-03, TSK-04, TSK-05, TSK-06, TSK-07 — these described a full in-app GitHub Issues GUI wrapper. User decision: not building this. GitHub's native UI is used instead.

</domain>

<decisions>
## Implementation Decisions

### Migration Trigger
- **D-01:** Migration is **prompted during the Beta → Launched transition** (StageTransitionModal), not automatic and not forced. A migration step is added to the transition flow: it strongly encourages migration but includes a clearly visible skip option.
- **D-02:** If the user **skips** migration at transition time: the native tasks tab remains fully functional, and a "Migrate to GitHub" button is added at the top of the TasksTab so they can migrate any time later.

### Migration Execution
- **D-03:** **Scope**: Only projects that already have a GitHub remote (`git remote get-url origin` returns a result). Imported projects without a remote are silently excluded from migration eligibility — no error, just no migration option shown.
- **D-04:** **GitHub repo URL**: Read from `git remote get-url origin` from the project root at migration time. Store the result as a `github_repo` field in gsd-projects.json for that project after successful migration.
- **D-05:** **What gets migrated**: All non-archived open tasks. Each issue is created with the label `source:dashboard-migration`, creation date preserved in the body, and a back-reference to the Dashboard task ID in the body.
- **D-06:** **Partial failure handling**: Track which tasks exported successfully. On failure, allow retry — already-exported tasks are skipped, only failures are retried. `task_backend` stays `dashboard` until all tasks have exported successfully.
- **D-07:** The `task_backend` field (TSK-01) on a project is `dashboard` by default. It flips to `github` only after all tasks migrate successfully.

### TasksTab After Migration
- **D-08:** After successful migration, the **TasksTab content is replaced entirely** with a prominent "Open GitHub Issues →" link/button. No task list is shown — GitHub is the source of truth.
- **D-09:** The link opens `https://github.com/{owner}/{repo}/issues` (the repo's Issues tab directly).

### Rollback (TSK-08)
- **D-10:** Before migrating, **save a JSON snapshot** of all tasks to a file in the project dir (e.g. `.dashboard-task-snapshot-{timestamp}.json`).
- **D-11:** A "Roll back migration" button appears in the TasksTab GitHub link view for **7 days** after migration. Clicking it: restores tasks from the JSON snapshot, flips `task_backend` back to `dashboard`, hides the rollback button. No GitHub API needed for rollback.

### Scope Constraints
- **D-12:** TSK-09: GSD Dashboard itself stays in Beta through v5.0 and does NOT migrate its own tasks. Only user projects migrate.

### Claude's Discretion
- Exact snapshot filename format
- Visual design of the "Open GitHub Issues →" replacement panel (use existing button/card patterns)
- Whether to show the migrated task count in the GitHub link view ("12 issues migrated")
- Label color/formatting for `source:dashboard-migration`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Stage Transition (existing Phase 58 work)
- `client/src/components/StageTransitionModal.tsx` — where migration step must be added; understands Beta→Launched flow
- `client/src/components/TasksTab.tsx` — component being modified; replace content based on `task_backend` field
- `client/src/lib/types.ts` — `GsdProject` type needs `task_backend` and `github_repo` fields added
- `server/routes/projects.js` — project creation pipeline (github_create + git_push already in default step sequence)

### Task Data
- `server/db.js` — `project_tasks` table schema: `id, project_key, title, description, archived, sort_order`

### Requirements
- `.planning/REQUIREMENTS.md` — TSK-01 through TSK-09 definitions (read carefully; TSK-03–07 are dropped per D-01 decision above)

### GitHub Integration
- `server/routes/projects.js` (github_create + git_push steps) — how PAT is fetched; use same `getSecret('github_pat')` pattern for GitHub Issues API calls

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `StageTransitionModal.tsx` — already has a multi-step flow for Beta→Launched; migration step slots in here
- `TasksTab.tsx` — existing task list component; needs a `task_backend === 'github'` branch that renders the link view
- `getSecret(patKey)` in `server/routes/projects.js` — use same pattern for GitHub API auth in migration route
- `gh` CLI is available on the host — alternative to direct GitHub API calls

### Established Patterns
- `stage` + `stageUpdatedAt` fields in gsd-projects.json — same pattern for `task_backend` + `github_repo` + `taskMigratedAt`
- WebSocket broadcast on stage change — consider broadcasting `task_backend_change` the same way
- Project tasks API routes are in `server/routes/` — add migration route here

### Integration Points
- `StageTransitionModal` fires the Beta→Launched PATCH — migration step hooks in before or after this PATCH
- `TasksTab` reads from `api.getTasks(projectKey)` — after migration, it should read `project.task_backend` to decide what to render
- `gsd-projects.json` is the source of truth for per-project config — `task_backend` and `github_repo` live here

</code_context>

<specifics>
## Specific Ideas

- Migration should be "strongly encouraged but not mandatory" — phrase it positively in the UI ("Back up your tasks to GitHub before launching")
- GitHub Issues link panel should feel like a clean handoff, not a dead end — show repo name + issue count if fetchable
- Snapshot file lives in the project root dir so it's git-trackable if the user wants it
- Only projects with `git remote get-url origin` returning a result show the migration option — no error state for projects without a remote, migration option simply doesn't appear

</specifics>

<deferred>
## Deferred Ideas

- **TSK-03 through TSK-07** (full GitHub Issues GUI inside Dashboard): user explicitly dropped these. If ever revisited, they'd form their own phase.
- **Imported projects without a GitHub remote**: these are excluded from Phase 59. A future phase (likely Phase 51 or a dedicated "connect to GitHub" flow) should handle adding a remote to imported projects.
- **TSK-08 full auto-import rollback** (fetch live issues back from GitHub API): deferred in favour of the simpler snapshot approach.

</deferred>

---

*Phase: 59-task-backend-migration-basic-issue-gui-wrapper*
*Context gathered: 2026-05-28*
