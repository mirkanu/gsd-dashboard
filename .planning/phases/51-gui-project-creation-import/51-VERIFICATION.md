---
phase: 51-gui-project-creation-import
verified: 2026-04-20T23:59:59Z
status: gaps_found
score: 5/6 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Import flow auto-detects missing .planning/ and triggers seeding confirmation"
    status: failed
    reason: "Backend POST /api/projects/import does not check for .planning/ directory. Client dialog expects needs_seeding response field to trigger confirmation flow, but backend never sets it. Without this check, import will silently proceed without offering to seed, breaking NPC-04 requirement."
    artifacts:
      - path: "server/routes/projects.js"
        issue: "POST /api/projects/import route (line 517-611) lacks .planning/ detection. Should check fs.existsSync(path.join(folder, '.planning')) and return { needs_seeding: true } when missing."
    missing:
      - "Add .planning/ check in backend import route"
      - "Return { needs_seeding: true } when .planning/ is absent and seed=false"
      - "Document the protocol change in route comments"
---

# Phase 51: GUI Project Creation + Import — Verification Report

**Phase Goal:** Create a new GSD project — or import an existing folder as a GSD project — from the Dashboard with zero SSH and zero manual file edits. Includes GitHub repo creation on day one.

**Verified:** 2026-04-20
**Status:** GAPS FOUND (1 gap blocking goal)
**Re-verification:** No (initial verification)

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | "New Project" button opens a guided wizard with name, description, template, and visibility fields | ✓ VERIFIED | `client/src/components/NewProjectDialog.tsx` lines 27-208: form with required fields, PAT selector, submit disabled until name valid |
| 2 | Wizard creates folder, git init, GSD symlink, GitHub repo, commits, pushes, starts tmux, launches Claude, and auto-sends /gsd-new-project | ✓ VERIFIED | `server/routes/projects.js` runCreationPipeline() implements all 7 STEP_SEQUENCE steps (scaffold→git_init→gsd_install→github_create→git_push→tmux_start→claude_launch); claude_launch sends /gsd-new-project after polling for Claude ready prompt |
| 3 | Project appears on Dashboard within 5 seconds in "working" state with GitHub URL visible | ✓ VERIFIED | `client/src/hooks/useProjectCreationState.ts` handleCreationStateMessage() updates module-level state on 202 response (optimistic); ProjectCreationCard renders immediately; clears after 1.5s when status='working' to let real card take over |
| 4 | Import flow auto-detects unregistered folders and offers to seed with /gsd-analyse-codebase if .planning/ missing | ✗ FAILED | Backend POST /api/projects/import (line 517) lacks .planning/ detection. Client ImportProjectDialog expects needs_seeding response (line 66), but backend never sets it. Import proceeds silently without offering seeding. |
| 5 | Failure modes produce plain-English errors (no stack traces) | ✓ VERIFIED | `server/routes/projects.js` defines PLAIN_ERRORS mapping; toPlainError() translates Node errors to user-friendly messages; all error responses use toPlainError() |
| 6 | Supports multiple GitHub PAT accounts/orgs; wizard shows dropdown when >1 PAT configured | ✓ VERIFIED | `client/src/components/NewProjectDialog.tsx` lines 48-58 load pats from /api/projects/github-pats; lines 35-36 render dropdown only when pats.length > 1; `server/routes/projects.js` listSecretKeys() filters for github_pat* keys |

**Score:** 5/6 truths verified

## Required Artifacts

| Artifact | Expected Presence | Status | Details |
|----------|------------------|--------|---------|
| `server/gsd/projectScaffold.js` | sanitizeName(), scaffoldProject(), STEP_SEQUENCE const | ✓ VERIFIED | Lines 21-72; exports all three; used by projects.js via lazy-load pattern |
| `server/gsd/projectDetector.js` | isProject(), detectUnregisteredFolders(), MANIFEST_FILES | ✓ VERIFIED | Lines 19-65; detects projects via .git/package.json/pyproject.toml/Cargo.toml/go.mod; filters dotfiles and registered projects |
| `server/db.js` | creation_state table migration (idempotent) | ✓ VERIFIED | Appended try/catch migration creating table with project_name PK, step tracking, error logging |
| `server/routes/projects.js` | POST/GET endpoints for creation, import, resume, candidates, pats | ✓ VERIFIED | 698 lines; five endpoints fully implemented with 202 async response and WebSocket broadcast via broadcast() |
| `server/routes/proxy.js` | /api/projects in PROXY_PREFIXES | ✓ VERIFIED | Added to array (Plan 02, Commit d6adfa7) to prevent Railway proxy shadowing |
| `client/src/components/NewProjectDialog.tsx` | Modal wizard with form fields, PAT selector, submit | ✓ VERIFIED | 209 lines; all required fields present; form validation; submit disabled until name valid; calls POST /api/projects/create on submit |
| `client/src/components/ImportProjectDialog.tsx` | Folder picker, custom path input, seeding confirmation modal | ✓ VERIFIED | 236 lines; dropdown auto-populated from /api/projects/import-candidates; custom path checkbox; seeding confirmation sub-dialog (lines 140-169) |
| `client/src/components/ProjectProgressChip.tsx` | CREATION_STEPS const, ProjectProgressChip component | ✓ VERIFIED | Lines 3-11 export CREATION_STEPS; ProjectProgressChip renders per-step chips with done/failed/current/pending visual states |
| `client/src/components/ProjectCreationCard.tsx` | Live card with 7 progress chips, error state, Resume button | ✓ VERIFIED | Lines 70-74 render CREATION_STEPS.map(ProjectProgressChip); error state (lines 78-88); Resume button calls POST /api/projects/resume/:name |
| `client/src/components/ChatListView.tsx` | Renders ProjectCreationCard above project list | ✓ VERIFIED | Lines 33-65 call useActiveCreationProjects(), render ProjectCreationCard for each active creation, filter working status |
| `client/src/components/Sidebar.tsx` | "+ New Project" button, Import link, PAT pre-flight gate | ✓ VERIFIED | Lines 103-120 render "+ New Project" button; handleNewProject() checks hasGithubPat (line 118); navigates to /services if false |
| `client/src/hooks/useProjectCreationState.ts` | Module-level state map, handleCreationStateMessage, useProjectCreationState, useActiveCreationProjects | ✓ VERIFIED | Lines 5-94 implement full hook suite; eventBus subscription via useProjectCreationStateSubscriber; optimistic card injection |
| `client/src/pages/GSD.tsx` | Mounts useProjectCreationStateSubscriber hook | ✓ VERIFIED | Lines 25, 1045 import and call hook for eventBus subscription |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| NewProjectDialog → Backend | POST /api/projects/create | fetch with 202 response | ✓ WIRED | Submit triggers creation; immediate 202 response with sanitized name |
| Sidebar → NewProjectDialog | showNewProject state + onCreated callback | handleNewProject() opens dialog; onCreated callback closes | ✓ WIRED | Button click opens dialog; successful creation closes dialog and fires onCreated |
| NewProjectDialog → useProjectCreationState | Optimistic state injection | handleCreationStateMessage() called on 202 (line 102) | ✓ WIRED | Card appears ~200ms after user submits (before WebSocket update) |
| useProjectCreationState → ChatListView | useActiveCreationProjects hook | Module-level creationStates map + listener Set | ✓ WIRED | ChatListView subscribes to creation state changes; renders cards immediately |
| ProjectCreationCard → Resume | POST /api/projects/resume/:name | Resume button fetch (line 39) | ✓ WIRED | Resume button calls endpoint with project name from state |
| ProjectCreationCard → Dismiss | clearCreationState() | 1.5s timeout after status='working' (line 24) | ✓ WIRED | Card auto-dismisses when pipeline completes; real project card takes over |
| ImportProjectDialog → Backend | POST /api/projects/import with folder path | fetch on line 55 | ✓ WIRED | Import button sends folder + seed flag |
| ImportProjectDialog → Import Candidates | GET /api/projects/import-candidates | fetch on dialog open (line 34) | ✓ WIRED | Dialog loads candidate folders on mount; populates dropdown |
| Sidebar → GitHub PAT check | GET /api/projects/github-pats | useEffect on Sidebar mount (line 111) | ✓ WIRED | Checks for PAT presence; gates New Project button; navigates to /services if missing |
| Backend → WebSocket Broadcast | eventBus.subscribe pattern | broadcast() called on each step (Plan 02) | ✓ WIRED | Projects.js broadcasts project_creation_state messages; GSD.tsx subscribes via eventBus |

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| NPC-01: New Project button opens wizard | ✓ SATISFIED | Sidebar.tsx "+ New Project" button (line 122) → handleNewProject() → setShowNewProject(true) → NewProjectDialog renders with all form fields |
| NPC-02: Wizard creates folder, git, GSD, GitHub repo, push, tmux, Claude | ✓ SATISFIED | server/routes/projects.js runCreationPipeline() implements all 7 steps; github_create uses gh CLI; git_push uses GH_TOKEN env; tmux_start registers in gsd-projects.json; claude_launch polls and sends /gsd-new-project |
| NPC-03: Project appears within 5s in working state | ✓ SATISFIED | Optimistic injection in NewProjectDialog line 102 (handleCreationStateMessage); ProjectCreationCard renders <200ms; clears after 1.5s when working status transitions to real card |
| NPC-04: Import with auto-detect .planning/ and optional seeding | ✗ NOT SATISFIED | Backend lacks .planning/ detection. Client dialog expects needs_seeding response (ImportProjectDialog line 66) but backend POST /api/projects/import never sets it. Import proceeds silently. |
| NPC-05: Plain-English error messages | ✓ SATISFIED | PLAIN_ERRORS map (line 90-95); toPlainError() applied throughout; no stack traces in responses |
| NPC-06: Multi-PAT support | ✓ SATISFIED | GET /api/projects/github-pats lists all github_pat* keys; NewProjectDialog renders multi-PAT dropdown only when pats.length > 1 (line 34-35) |

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server/routes/projects.js | 603-610 | Import endpoint returns { ok: true, project: { ... } } but never checks for .planning/ or sets needs_seeding | 🛑 Blocker | NPC-04 acceptance fails: seeding flow broken |
| None | - | No other stubs or incomplete implementations detected | - | - |

## Gaps Summary

**One critical gap blocks NPC-04 (Import flow with seeding):**

The import endpoint must detect when `.planning/` is missing and signal to the client via `needs_seeding: true`. This allows the client to show a confirmation dialog offering to seed via `/gsd-analyse-codebase`.

**Current behavior:** Import always succeeds silently, even if `.planning/` is absent. The seeding confirmation modal in ImportProjectDialog.tsx (lines 140-169) is unreachable code.

**Required fix:**
1. In `server/routes/projects.js` POST /api/projects/import, add check: if `!fs.existsSync(path.join(folder, '.planning'))` return `{ needs_seeding: true }` instead of `{ ok: true }`
2. Update client side: when first attempt returns needs_seeding=true, show confirmation; on confirm, retry with `{ folder, seed: true }`
3. When seed=true, trigger the existing seeding flow (lines 577-600)

This aligns with the Plan 02 summary claim: "backend returns needs_seeding:true to trigger confirmation" — currently unimplemented.

---

_Verified: 2026-04-20T23:59:59Z_
_Verifier: Claude (gsd-verifier)_
