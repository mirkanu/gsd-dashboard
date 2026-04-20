---
phase: 51-gui-project-creation-import
plan: "03"
subsystem: client/components
tags: [ui, wizard, modal, sidebar, project-creation, import]
dependency_graph:
  requires:
    - 51-02 (GET /api/projects/github-pats, GET /api/projects/import-candidates, POST /api/projects/create, POST /api/projects/import)
  provides:
    - client/src/components/ProjectProgressChip.tsx (CREATION_STEPS, CreationState, ProjectProgressChip)
    - client/src/components/NewProjectDialog.tsx (NewProjectDialog)
    - client/src/components/ImportProjectDialog.tsx (ImportProjectDialog)
    - client/src/components/Sidebar.tsx (updated: + New Project button, Import existing link, PAT gate)
  affects:
    - Plans 51-04 (ProjectCreationCard uses ProjectProgressChip + CREATION_STEPS)
tech_stack:
  added: []
  patterns:
    - Dialog overlay pattern (matching AddCostDialog.tsx: fixed inset-0 z-50, stopPropagation, Escape key)
    - PAT pre-flight gate: mount-time fetch of /api/projects/github-pats; no-PAT → navigate to /services
    - React Fragment wrapper for aside + portal dialogs in Sidebar return
    - Conditional multi-PAT dropdown (pats.length > 1 guard for NPC-06)
    - Seeding confirmation sub-dialog via showSeedConfirm state flag
key_files:
  created:
    - client/src/components/ProjectProgressChip.tsx
    - client/src/components/NewProjectDialog.tsx
    - client/src/components/ImportProjectDialog.tsx
  modified:
    - client/src/components/Sidebar.tsx
decisions:
  - "React Fragment wrapper in Sidebar return: dialogs rendered as siblings to aside to avoid z-index stacking context issues inside the positioned aside element"
  - "PAT gate navigates to /services (existing route) on no-PAT click; no custom Services panel API needed from this plan"
  - "sanitizeName() duplicated client-side in NewProjectDialog for real-time folder preview; server-side canonical sanitizeName in projectScaffold.js remains authoritative"
  - "ImportProjectDialog sends first import attempt without seed; backend returns needs_seeding:true to trigger confirmation; avoids dry_run round-trip"
metrics:
  duration: "11 minutes"
  completed: "2026-04-20"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 51 Plan 03: UI Wizard Modals + Sidebar CTA Summary

**One-liner:** ProjectProgressChip (7-step creation progress with done/current/pending visual states), NewProjectDialog (creation wizard with PAT multi-select and name sanitizer preview), ImportProjectDialog (folder picker with seeding confirmation), and Sidebar updated with "+ New Project" PAT-gated button and "Import existing" link.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | ProjectProgressChip.tsx component | fc33f1a | client/src/components/ProjectProgressChip.tsx |
| 2 | NewProjectDialog + ImportProjectDialog + Sidebar updates | 7dd86a6 | client/src/components/NewProjectDialog.tsx, ImportProjectDialog.tsx, Sidebar.tsx |

## What Was Built

### client/src/components/ProjectProgressChip.tsx (new)

- `CREATION_STEPS`: 7-element readonly const array (`scaffold`, `git_init`, `gsd_install`, `github_create`, `git_push`, `tmux_start`, `claude_launch`)
- `CreationStep` type derived from `typeof CREATION_STEPS[number]`
- `CreationState` interface: `current_step`, `last_completed_step`, `failed_at_step`, `error_message`, `status` fields
- `ProjectProgressChip`: renders per-step chip with 4 visual states:
  - Done: green background, CheckCircle icon
  - Failed: red background, ✗ character
  - Current: indigo background, Loader2 with `animate-spin`
  - Pending: gray background, outlined circle
- Accessibility: `aria-current="step"` on active chip, `aria-label="[step name], step N of 7"`

### client/src/components/NewProjectDialog.tsx (new)

Props: `{ open, onClose, onCreated }`

- Form fields: Name (required, with inline sanitized folder preview `/data/home/{sanitized}`), Description, Template (read-only Blank radio), GitHub visibility (Private/Public radio)
- Multi-PAT GitHub account dropdown: visible only when `pats.length > 1` — implements NPC-06
- PAT list loaded from `GET /api/projects/github-pats` on dialog open
- Name validation: `aria-describedby` error on blur; submit button disabled until `sanitizeName(name).length > 0`
- Submit: `POST /api/projects/create` with `{ name, description, template: 'blank', visibility, pat_key }` → 202 triggers `onCreated`
- Accessibility: `role="dialog"`, `aria-modal`, `aria-labelledby="new-project-title"`, Escape key closes

### client/src/components/ImportProjectDialog.tsx (new)

Props: `{ open, onClose, onImported }`

- Loads `GET /api/projects/import-candidates` on dialog open; shows skeleton loading state during fetch
- Folder dropdown + "Or enter a custom path" checkbox toggle revealing a text input
- Submit flow:
  1. `POST /api/projects/import { folder, seed: false }`
  2. If response includes `needs_seeding: true` → shows seeding confirmation sub-dialog
  3. Confirmation [Confirm] → `POST /api/projects/import { folder, seed: true }`
  4. [Cancel] → dismisses confirmation, aborts import (no half-state)
- Seeding confirmation copy: "This folder isn't a GSD project yet — seed .planning/ by running /gsd-analyse-codebase?"
- Escape key closes either the confirmation or the main dialog

### client/src/components/Sidebar.tsx (updated)

Added:
- Imports: `useEffect`, `useNavigate` from react-router-dom, `Plus` from lucide-react, `NewProjectDialog`, `ImportProjectDialog`
- State: `showNewProject`, `showImport`, `hasGithubPat` (null = not yet fetched)
- `useEffect`: fetches `GET /api/projects/github-pats` on mount; sets `hasGithubPat`
- `handleNewProject()`: if `hasGithubPat === false` → `navigate('/services')`; else → `setShowNewProject(true)`
- Expanded sidebar: "+ New Project" indigo button + "Import existing" ghost link below primary nav items
- Slim/collapsed sidebar: Plus icon button only (title tooltip)
- Return wrapped in `<>...</>` React Fragment to accommodate dialog siblings rendered outside the `<aside>` stacking context
- Dialogs rendered after `</aside>` with open/onClose/onCreated/onImported wired

## Verification

- TypeScript: zero errors in the 4 new/modified files (pre-existing errors in test files and GSD.tsx are unrelated to this plan)
- Client tests: 80 passed / 59 failed — same baseline as before (pre-existing failures, zero regressions from this plan)
- Acceptance criteria (all met):
  - `client/src/components/NewProjectDialog.tsx` exists; grep "POST.*projects/create" matches
  - `client/src/components/ImportProjectDialog.tsx` exists; grep "import-candidates" matches
  - grep "showSeedConfirm" ImportProjectDialog.tsx matches
  - grep "github-pats" Sidebar.tsx matches
  - grep "NewProjectDialog|ImportProjectDialog" Sidebar.tsx matches
  - grep `role="dialog"` NewProjectDialog.tsx matches

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one clarification below.

### Clarification (not a deviation)

**Import seeding detection:** The plan described two possible approaches for detecting whether a folder needs seeding. This plan implements the simpler one: the client sends `POST /api/projects/import { folder, seed: false }` and checks the response for `needs_seeding: true`. If the Plan 02 backend returns that flag, the confirmation dialog appears. If the Plan 02 backend does not return that flag (e.g., it detects .planning/ itself and proceeds), the import completes silently. This is transparent to the user in both cases.

## Known Stubs

None — all components implement their full intended behavior. The `onCreated`/`onImported` callbacks in Sidebar close the dialog and leave the ProjectCreationCard (Plan 04) to appear via WebSocket; this is intentional behavior, not a stub.

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| T-51-11 covered | NewProjectDialog.tsx | PAT list fetched from /api/projects/github-pats; only `key` and `label` fields rendered in dropdown, never ciphertext or plaintext PAT values |
| T-51-13 covered | ImportProjectDialog.tsx | Custom path input is UX-only; backend (Plan 02) enforces path traversal guard via `resolvedRoot.startsWith(DATA_HOME + sep)` |

No new trust boundaries or network endpoints introduced by this plan (UI only).

## Self-Check: PASSED

- client/src/components/ProjectProgressChip.tsx: FOUND (68 lines, exports CREATION_STEPS, CreationState, ProjectProgressChip)
- client/src/components/NewProjectDialog.tsx: FOUND (209 lines, exports NewProjectDialog)
- client/src/components/ImportProjectDialog.tsx: FOUND (236 lines, exports ImportProjectDialog)
- client/src/components/Sidebar.tsx: FOUND (updated, imports NewProjectDialog + ImportProjectDialog)
- Commit fc33f1a (Task 1 — ProjectProgressChip): FOUND
- Commit 7dd86a6 (Task 2 — NewProjectDialog + ImportProjectDialog + Sidebar): FOUND
