---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/components/TasksTab.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "Clicking a task title/description loads its content into the form fields"
    - "The submit button label changes to 'Save' when editing, 'Add' when creating"
    - "Submitting while editing calls PATCH and updates the task in the list"
    - "Cancelling or clearing the form returns to create mode"
    - "Saving an edit replaces the task in the list without a full reload"
  artifacts:
    - path: "client/src/components/TasksTab.tsx"
      provides: "Inline task editing via editingTask state"
  key_links:
    - from: "TaskRow (click handler)"
      to: "TasksTab editingTask state"
      via: "onEdit callback prop"
    - from: "handleSubmit"
      to: "api.gsd.tasks.update"
      via: "editingTask !== null branch"
---

<objective>
Add inline task editing to TasksTab. Clicking a task's title or description loads it into the existing add-task form. Submitting calls PATCH to update instead of POST to create. Cancelling clears the editing state and returns to create mode.

Purpose: Allow task text to be corrected without archiving and re-creating.
Output: Modified TasksTab.tsx with editingTask state, onEdit prop on TaskRow, branched handleSubmit.
</objective>

<execution_context>
@/data/home/gsddashboard/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@/data/home/gsddashboard/client/src/components/TasksTab.tsx
@/data/home/gsddashboard/client/src/lib/api.ts
@/data/home/gsddashboard/client/src/lib/types.ts

<interfaces>
<!-- Key types the executor needs. No codebase exploration required. -->

From client/src/lib/types.ts:
```typescript
export interface GsdTask {
  id: number;
  project_key: string;
  title: string;
  description: string | null;
  archived: 0 | 1;
  created_at: string;
}
```

From client/src/lib/api.ts:
```typescript
api.gsd.tasks.update(
  projectKey: string,
  taskId: number,
  patch: { title?: string; description?: string; archived?: 0 | 1 }
): Promise<GsdTask>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add editingTask state and wire inline edit flow in TasksTab</name>
  <files>client/src/components/TasksTab.tsx</files>
  <action>
Modify TasksTab.tsx as follows. No other files change.

**1. Add `Pencil` to lucide-react imports** (alongside Archive, ArchiveRestore, ClipboardCopy, Plus).

**2. Add `onEdit` prop to TaskRow:**
```typescript
function TaskRow({
  task,
  showArchived,
  onArchive,
  onUnarchive,
  onEdit,
}: {
  task: GsdTask;
  showArchived: boolean;
  onArchive: (id: number) => void;
  onUnarchive: (id: number) => void;
  onEdit: (task: GsdTask) => void;
}) {
```

**3. Make the task text area clickable (inside TaskRow's `<div className="min-w-0 flex-1">`)**:
- Wrap the title/description block in a `<button>` element with `onClick={() => onEdit(task)}`.
- Style it so it looks like plain text, not a button: `type="button" className="w-full text-left"`.
- Keep the existing `<p>` tags inside untouched.
- Add a small edit icon next to the title that only appears on hover:
  ```tsx
  <div className="flex items-center gap-1 group/edit">
    <p className="text-sm font-medium text-gray-200 break-words">{task.title}</p>
    <Pencil className="w-3 h-3 text-gray-600 opacity-0 group-hover/edit:opacity-100 transition-opacity flex-shrink-0" />
  </div>
  ```

**4. Add `editingTask` state in TasksTab:**
```typescript
const [editingTask, setEditingTask] = useState<GsdTask | null>(null);
```

**5. Add `handleEdit` function:**
```typescript
function handleEdit(task: GsdTask) {
  setEditingTask(task);
  setTitle(task.title);
  setDescription(task.description ?? "");
}
```

**6. Add `handleCancelEdit` function:**
```typescript
function handleCancelEdit() {
  setEditingTask(null);
  setTitle("");
  setDescription("");
}
```

**7. Modify `handleSubmit` to branch on `editingTask`:**
```typescript
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  const trimmedTitle = title.trim();
  if (!trimmedTitle || submitting) return;
  setSubmitting(true);
  try {
    if (editingTask) {
      // Edit mode: PATCH existing task
      const updated = await api.gsd.tasks.update(projectKey, editingTask.id, {
        title: trimmedTitle,
        description: description.trim() || undefined,
      });
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setEditingTask(null);
    } else {
      // Create mode: POST new task
      const newTask = await api.gsd.tasks.create(
        projectKey,
        trimmedTitle,
        description.trim() || undefined
      );
      setTasks((prev) => [newTask, ...prev]);
    }
    setTitle("");
    setDescription("");
  } finally {
    setSubmitting(false);
  }
}
```

**8. Update the submit button label and add a Cancel button when editing:**

Replace the single submit button with:
```tsx
<div className="flex items-center gap-2">
  <button
    type="submit"
    disabled={title.trim() === "" || submitting}
    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 border border-accent/20 text-accent rounded hover:bg-accent/20 disabled:opacity-40 transition-colors"
  >
    <Plus className="w-3 h-3" />
    {submitting ? (editingTask ? "Saving..." : "Adding...") : (editingTask ? "Save" : "Add")}
  </button>
  {editingTask && (
    <button
      type="button"
      onClick={handleCancelEdit}
      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
    >
      Cancel
    </button>
  )}
</div>
```

**9. Pass `onEdit={handleEdit}` to every `<TaskRow>` in the task list render.**

**Note on description PATCH behavior:** When description is cleared in the edit form, pass `description: ""` (not `undefined`) so the PATCH explicitly clears it. The server accepts an empty string and stores null via `description?.trim() || null`. Adjust the description field in handleSubmit edit branch: `description: description.trim()` (always pass the value, even empty string).
  </action>
  <verify>
    <automated>cd /data/home/gsddashboard && npm run test:client 2>&1 | tail -20</automated>
  </verify>
  <done>
- Clicking a task title loads its title and description into the form inputs.
- The submit button reads "Save" and a "Cancel" link appears.
- Saving updates the task text in-place in the list.
- Cancel clears the form and returns the button to "Add".
- Creating a new task still works normally when no task is being edited.
- Client tests pass.
  </done>
</task>

</tasks>

<verification>
Manual smoke-test (after implementation):
1. Open a project drawer, go to Tasks tab.
2. Create a task titled "Test task".
3. Click the task title — form should populate with "Test task".
4. Change the title to "Edited task", click Save.
5. The task in the list should now read "Edited task" (no page reload).
6. Click the task again, click Cancel — form clears, button reads "Add".
</verification>

<success_criteria>
- editingTask state drives form population and submit branching.
- PATCH is called (not POST) when saving an edit.
- Task list updates in-place via setTasks map (no refetch required).
- Cancel discards edits and resets to create mode.
- No backend changes required — PATCH /api/gsd/projects/:key/tasks/:id already handles title/description updates.
</success_criteria>

<output>
After completion, create `/data/home/gsddashboard/.planning/quick/5-add-task-editing-click-task-to-load-into/5-SUMMARY.md` with a brief summary of what was changed.
</output>
