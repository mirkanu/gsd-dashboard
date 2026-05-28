# Phase 59: Task Backend Migration + GitHub Issues Link — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 59-task-backend-migration-basic-issue-gui-wrapper
**Areas discussed:** Migration trigger, Link button placement, GitHub repo source, TasksTab after migration, Rollback

---

## Pre-discussion Direction

User opened with: "I don't think we should wrap GitHub Issues GUI, just a clear link button to it to replace the native tasks. When migrating a project's tasks to GitHub, obviously needs to include an automation to migrate the actual tasks."

This dropped TSK-03 through TSK-07 (full GUI wrapper) before discussion began.

User also noted during discussion: "by default every new project should go onto GitHub for basic backup functions (private by default)". Investigation confirmed this is **already the case** — `github_create` and `git_push` are in the default step sequence for new projects, visibility defaults to `private`.

---

## Migration Trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Auto on Launched transition | Migration runs automatically as part of stage change | ✓ (then revised) |
| Separate button after Launched | Migration button appears on tasks panel post-Launched | |
| Prompted during Launched flow | StageTransitionModal includes a migration step with confirm/skip | ✓ (final) |

**User's choice:** Initially selected "Auto on Launched transition", then revised: "going back to previous Q, the migration to GitHub Issues should be strongly encouraged but not mandatory or automatic"
**Notes:** Final decision = prompted step in StageTransitionModal, strongly encouraged, skippable.

---

## Skip Behavior (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Stays as native tasks, link button added later | Tasks tab stays functional; Migrate button appears at top | ✓ |
| Stays as native tasks, no migration prompt again | Clean skip, no repeated nag | |
| Prompt again each time tasks tab opens | Persistent reminder | |

**User's choice:** Stays as native tasks, "Migrate to GitHub" button added to tasks tab top.

---

## Migration Partial Failure

| Option | Description | Selected |
|--------|-------------|----------|
| Retry failed tasks, skip already-done | Track per-task success; safe to retry | ✓ |
| Abort and roll back | Any failure undoes everything | |
| Best-effort, log failures | Continue regardless | |

**User's choice:** Retry failed tasks only; skip already-succeeded.

---

## Link Button Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Tasks tab replaced with GitHub link | TasksTab content replaced entirely | ✓ |
| Tasks tab shows link + read-only list | GitHub link + frozen task list | |
| Link added to project card header | Small icon in card header | |

**User's choice:** Tasks tab replaced with GitHub link entirely.

---

## GitHub Issues Link Target

| Option | Description | Selected |
|--------|-------------|----------|
| Direct to repo Issues tab | github.com/{owner}/{repo}/issues | ✓ |
| Repo root | github.com/{owner}/{repo} | |
| Filtered to migration label | Issues filtered to source:dashboard-migration | |

**User's choice:** Direct to Issues tab.

---

## GitHub Repo Source

| Option | Description | Selected |
|--------|-------------|----------|
| Read from git remote at migration time | git remote get-url origin; save to gsd-projects.json | ✓ |
| User pastes it manually | Migration prompt asks for URL | |
| Add github_repo in Phase 51 | Defer to project creation wizard | |

**User's choice:** Read from git remote at migration time.
**Notes:** Discussion revealed imported projects don't go through `github_create`. User said "keep narrow, ignore imported projects for now."

---

## Rollback (TSK-08)

| Option | Description | Selected |
|--------|-------------|----------|
| Simple snapshot: save JSON before migrating | Write task JSON before export; restore button for 7 days | ✓ |
| Defer to later phase | Skip TSK-08 | |

**User's choice:** Simple snapshot approach.

---

## Claude's Discretion

- Exact snapshot filename format
- Visual design of the GitHub link replacement panel
- Whether to show migrated issue count in the link view
- Label color for `source:dashboard-migration`

## Deferred Ideas

- TSK-03–07 (full GitHub Issues GUI): explicitly dropped, may resurface in a future phase
- Imported projects without a GitHub remote: excluded from Phase 59 scope
- TSK-08 full auto-import rollback (fetch issues back from GitHub API): deferred in favour of snapshot
