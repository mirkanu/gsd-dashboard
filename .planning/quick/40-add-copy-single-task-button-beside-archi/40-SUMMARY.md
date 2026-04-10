# Quick Task 40: Add copy-single-task button beside Archive

## Change

Added a `ClipboardCopy` button to each `TaskRow` in `client/src/components/TasksTab.tsx`, positioned beside the Archive/Unarchive button. Clicking copies the task to the clipboard as `**title** — description` (mirrors the "Copy all" format). Shows a green checkmark state for 1.5s after copying.

## Files

- `client/src/components/TasksTab.tsx` — new per-row copy button with local `rowCopied` state

## Commit

- `feat(quick-40): add copy button to each task row`
