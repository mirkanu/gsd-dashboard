---
phase: quick-5
plan: 01
subsystem: client/tasks-ui
tags: [task-editing, inline-edit, tasks-tab, react-state]
key_files:
  modified:
    - client/src/components/TasksTab.tsx
decisions:
  - "Pass description as empty string (not undefined) in edit PATCH so clearing the field explicitly clears stored description"
  - "Wrap task text area in a button element (type=button, text-left) to make the entire title+description region clickable without breaking layout"
  - "Pencil icon uses group-hover/edit pattern — invisible by default, visible on row hover, avoids cluttering the task list"
metrics:
  duration: "~2 minutes"
  completed: "2026-03-30"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 5: Add Task Editing (Click Task to Load into Form) Summary

Inline task editing added to TasksTab. Users can click any task title to load it into the existing add-task form, edit text, and save via PATCH — no page reload, no archiving needed.

## What Changed

**client/src/components/TasksTab.tsx** — single file modified.

### New state

```typescript
const [editingTask, setEditingTask] = useState<GsdTask | null>(null);
```

### New functions

- `handleEdit(task)` — loads task title/description into form fields and sets editingTask
- `handleCancelEdit()` — clears editingTask and resets form to create mode

### Modified: handleSubmit

Branches on `editingTask`:
- **Edit mode:** calls `api.gsd.tasks.update` (PATCH), replaces task in list via `setTasks` map, clears editingTask
- **Create mode:** unchanged — calls `api.gsd.tasks.create` (POST), prepends new task

### Modified: TaskRow

- Added `onEdit: (task: GsdTask) => void` prop
- Wrapped title/description block in `<button type="button" className="w-full text-left">` to make it clickable
- Added `<Pencil>` icon inside `group/edit` div — appears on hover only via `opacity-0 group-hover/edit:opacity-100`

### Modified: Submit button area

Replaced single button with a `<div className="flex items-center gap-2">` containing:
- Submit button with dynamic label: "Save" / "Saving..." (edit mode) vs "Add" / "Adding..." (create mode)
- Cancel button (only rendered when `editingTask !== null`)

## Verification

- `npm run test:client`: 99/101 tests pass (2 pre-existing Sidebar failures unrelated to this change)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `client/src/components/TasksTab.tsx` exists and contains `editingTask` state, `handleEdit`, `handleCancelEdit`, and branched `handleSubmit`
- Commit `293e932` exists: "feat(quick-5): add inline task editing to TasksTab"
