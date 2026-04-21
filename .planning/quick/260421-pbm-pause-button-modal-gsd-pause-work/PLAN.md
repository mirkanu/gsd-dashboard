---
task: 260421-pbm
title: Pause button opens modal asking whether to run /gsd-pause-work first
type: quick
autonomous: true
created: 2026-04-21
---

# Objective

The Pause button currently hard-kills the tmux session immediately via `pauseSession()` → `api.gsd.pauseSession(name)`. Users often want a graceful handoff first (run `/gsd-pause-work` so Claude saves context before the session is killed). Intercept the click with a small confirmation modal that offers:

1. **Send /gsd-pause-work** — sends the slash-command into the tmux session via `api.gsd.send(name, "/gsd-pause-work")`. Does NOT kill the session. User can manually pause after Claude finishes the handoff.
2. **Just pause (kill)** — current hard-pause behavior (`api.gsd.pauseSession`).
3. **Cancel**.

# Tasks

## Task 1: Add `PauseConfirmDialog` component

New file: `client/src/components/PauseConfirmDialog.tsx`. Standard modal pattern matching `ImportProjectDialog.tsx` (fixed inset-0, bg-black/60, surface-1 panel, role=dialog).

## Task 2: Wire in GSD.tsx

- Add state `pauseTarget: string | null`.
- Replace the two inline `onPauseSession={() => pauseSession(name)}` callbacks with `onPauseSession={() => setPauseTarget(name)}`.
- Render `<PauseConfirmDialog />` at the page level; on "Just pause" it calls the existing `pauseSession(name)`; on "Send /gsd-pause-work" it calls `api.gsd.send(name, "/gsd-pause-work")`.
- Keep the ProjectCard/ProjectDetailsPanel/GsdDrawer signatures unchanged — they still receive `onPauseSession: () => void`.

## Task 3: Verify

Run `npm run test:client`. Manually verify on Railway build.

Commit: `feat(260421-pbm): confirm modal on Pause — offer /gsd-pause-work before hard kill`
