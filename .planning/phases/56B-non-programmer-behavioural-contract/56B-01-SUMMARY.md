---
phase: 56B
plan: "01"
subsystem: claude-md-templates
tags: [non-programmer-contract, claude-md, behavioral-rules, templates]
dependency_graph:
  requires: []
  provides: [non-programmer-contract-in-template, non-programmer-contract-in-project-claude-mds]
  affects: [debates, reforma, ynab, KidAI, zoho-todoist-sync, gsd-template]
tech_stack:
  added: []
  patterns: [gsd-marker-bounded-sections, pure-append-injection]
key_files:
  created: []
  modified:
    - /home/claude/.claude/get-shit-done/templates/claude-md.md
    - /home/services/debates/CLAUDE.md
    - /home/services/reforma/CLAUDE.md
    - /home/services/ynab/CLAUDE.md
    - /home/services/KidAI/CLAUDE.md
    - /home/services/zoho-todoist-sync/CLAUDE.md
decisions:
  - "Non-Programmer Contract appended after Verbosity Contract in each project file (pure append, no existing content touched)"
  - "ynab/CLAUDE.md backfilled with Verbosity Contract before Non-Programmer Contract (was missing)"
  - "reforma/CLAUDE.md not in a git repo — file edited on disk, no commit possible"
  - "Template file (/home/claude/.claude/get-shit-done/templates/claude-md.md) not in a git repo — change saved on disk only"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-28"
  tasks_completed: 2
  files_modified: 6
requirements_completed: [NPB-01, NPB-03, NPB-06]
---

# Phase 56B Plan 01: Non-Programmer Contract CLAUDE.md Injection Summary

**One-liner:** GSD-marker-bounded Non-Programmer Contract section (12-row forbidden→replacement table) injected into global template and all 5 project CLAUDE.md files.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add Non-Programmer Contract to global template | n/a (not a git repo) | `/home/claude/.claude/get-shit-done/templates/claude-md.md` |
| 2 | Inject into debates/CLAUDE.md | f9aa411 (debates repo) | `/home/services/debates/CLAUDE.md` |
| 2 | Inject into reforma/CLAUDE.md | n/a (not a git repo) | `/home/services/reforma/CLAUDE.md` |
| 2 | Inject Verbosity + Non-Programmer Contract into ynab/CLAUDE.md | 31918e0 (ynab repo) | `/home/services/ynab/CLAUDE.md` |
| 2 | Inject into KidAI/CLAUDE.md | 97c0fa8 (KidAI repo) | `/home/services/KidAI/CLAUDE.md` |
| 2 | Inject into zoho-todoist-sync/CLAUDE.md | 76aa335 (zoho-todoist-sync repo) | `/home/services/zoho-todoist-sync/CLAUDE.md` |

## Verification

All 5 project files confirmed to contain exactly 1 `GSD:non-programmer-contract-start` marker and 1 `GSD:non-programmer-contract-end` marker. Spot checks passed:
- `Global Env Editor` present in debates/CLAUDE.md
- `Deploy started` present in zoho-todoist-sync/CLAUDE.md
- `Verbosity Contract` backfilled in ynab/CLAUDE.md
- `SermonAudio` still present in debates/CLAUDE.md (existing content preserved)

## Deviations from Plan

### Auto-noted Discoveries

**1. [Rule 3 - Discovery] Template file and reforma/CLAUDE.md are not in git repositories**
- **Found during:** Task 1 (template commit) and Task 2 (reforma commit)
- **Issue:** `/home/claude/.claude/get-shit-done/templates/claude-md.md` and `/home/services/reforma/CLAUDE.md` are not tracked in any git repository. `git add` raised "outside repository" and "not a git repository" errors respectively.
- **Fix:** Both files were edited successfully on disk. Changes are saved and active. No commit was possible.
- **Impact:** Changes will survive as long as the files are not overwritten. No version history.
- **Files modified:** Both files contain the correct content on disk.

## Known Stubs

None. All content is concrete and complete.

## Threat Flags

None. All changes are plain-text append-only edits to local config files with no network surface, no secrets, and no trust-boundary crossings.

## Self-Check

- [x] `/home/claude/.claude/get-shit-done/templates/claude-md.md` contains `GSD:non-programmer-contract-start`
- [x] `/home/services/debates/CLAUDE.md` contains `GSD:non-programmer-contract-start`
- [x] `/home/services/reforma/CLAUDE.md` contains `GSD:non-programmer-contract-start`
- [x] `/home/services/ynab/CLAUDE.md` contains `GSD:non-programmer-contract-start`
- [x] `/home/services/KidAI/CLAUDE.md` contains `GSD:non-programmer-contract-start`
- [x] `/home/services/zoho-todoist-sync/CLAUDE.md` contains `GSD:non-programmer-contract-start`
- [x] debates commit f9aa411 exists
- [x] ynab commit 31918e0 exists
- [x] KidAI commit 97c0fa8 exists
- [x] zoho-todoist-sync commit 76aa335 exists

## Self-Check: PASSED
