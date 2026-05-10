import { useState, useEffect, useRef } from "react";
import { Archive, ArchiveRestore, ClipboardCopy, GripVertical, Pencil, Plus } from "lucide-react";
import { api } from "../lib/api";
import type { GsdTask } from "../lib/types";

function TaskRow({
  task,
  showArchived,
  isDragOver,
  onArchive,
  onUnarchive,
  onEdit,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  task: GsdTask;
  showArchived: boolean;
  isDragOver: boolean;
  onArchive: (id: number) => void;
  onUnarchive: (id: number) => void;
  onEdit: (task: GsdTask) => void;
  onDragStart: (id: number) => void;
  onDragOver: (id: number) => void;
  onDrop: () => void;
}) {
  const [rowCopied, setRowCopied] = useState(false);
  async function handleCopyRow() {
    const text = task.description
      ? `**${task.title}** — ${task.description}`
      : `**${task.title}**`;
    await navigator.clipboard.writeText(text);
    setRowCopied(true);
    setTimeout(() => setRowCopied(false), 1500);
  }
  return (
    <div
      draggable={!showArchived}
      onDragStart={() => onDragStart(task.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(task.id); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      className={`flex items-start justify-between gap-2 py-2 border-b border-border last:border-0 transition-colors ${
        isDragOver ? "bg-accent/10 rounded" : ""
      } ${!showArchived ? "cursor-default" : ""}`}
    >
      {!showArchived && (
        <div
          className="flex-shrink-0 mt-0.5 text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}
      <button
        type="button"
        className="w-full text-left min-w-0 flex-1"
        onClick={() => onEdit(task)}
      >
        <div className="flex items-center gap-1 group/edit">
          <p className="text-sm font-medium text-gray-200 break-words">{task.title}</p>
          <Pencil className="w-3 h-3 text-gray-600 opacity-0 group-hover/edit:opacity-100 transition-opacity flex-shrink-0" />
        </div>
        {task.description && (
          <p className="text-xs text-gray-500 mt-0.5 break-words">{task.description}</p>
        )}
      </button>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={handleCopyRow}
          aria-label="Copy task"
          className={`flex-shrink-0 transition-colors ${rowCopied ? "text-green-400" : "text-gray-500 hover:text-gray-300"}`}
          title={rowCopied ? "Copied!" : "Copy task"}
        >
          <ClipboardCopy className="w-3.5 h-3.5" />
        </button>
        {!showArchived ? (
          <button
            onClick={() => onArchive(task.id)}
            aria-label="Archive task"
            className="text-gray-500 hover:text-gray-300 flex-shrink-0 transition-colors"
            title="Archive"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={() => onUnarchive(task.id)}
            aria-label="Unarchive task"
            className="text-gray-500 hover:text-gray-300 flex-shrink-0 transition-colors"
            title="Unarchive"
          >
            <ArchiveRestore className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function TasksTab({ projectKey }: { projectKey: string }) {
  const [tasks, setTasks] = useState<GsdTask[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingTask, setEditingTask] = useState<GsdTask | null>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const dragIdRef = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.gsd.tasks
      .list(projectKey, showArchived)
      .then(({ tasks }) => {
        if (!cancelled) {
          setTasks(tasks);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectKey, showArchived]);

  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = "auto";
      descRef.current.style.height = `${descRef.current.scrollHeight}px`;
    }
  }, [description]);

  function handleEdit(task: GsdTask) {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description ?? "");
  }

  function handleCancelEdit() {
    setEditingTask(null);
    setTitle("");
    setDescription("");
  }

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
          description: description.trim(),
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

  async function handleCopyAll() {
    const lines = tasks
      .map((t) => (t.description ? `- **${t.title}** — ${t.description}` : `- **${t.title}**`))
      .join("\n");
    await navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleArchiveAll() {
    if (tasks.length === 0) return;
    const ids = tasks.map((t) => t.id);
    // Optimistic clear
    setTasks([]);
    try {
      await Promise.all(
        ids.map((id) => api.gsd.tasks.update(projectKey, id, { archived: 1 }))
      );
    } catch {
      // Revert on failure by re-fetching
      api.gsd.tasks.list(projectKey, false).then(({ tasks }) => setTasks(tasks)).catch(() => {});
    }
  }

  async function handleArchive(taskId: number) {
    // Optimistic removal
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await api.gsd.tasks.update(projectKey, taskId, { archived: 1 });
    } catch {
      // Revert on failure by re-fetching
      api.gsd.tasks.list(projectKey, false).then(({ tasks }) => setTasks(tasks)).catch(() => {});
    }
  }

  async function handleUnarchive(taskId: number) {
    // Optimistic removal from archived list
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    try {
      await api.gsd.tasks.update(projectKey, taskId, { archived: 0 });
    } catch {
      // Revert on failure by re-fetching
      api.gsd.tasks.list(projectKey, true).then(({ tasks }) => setTasks(tasks)).catch(() => {});
    }
  }

  function handleDragStart(id: number) {
    dragIdRef.current = id;
  }

  function handleDragOver(id: number) {
    if (dragIdRef.current !== null && dragIdRef.current !== id) {
      setDragOverId(id);
    }
  }

  function handleDrop() {
    const fromId = dragIdRef.current;
    const toId = dragOverId;
    dragIdRef.current = null;
    setDragOverId(null);
    if (fromId === null || toId === null || fromId === toId) return;

    setTasks((prev) => {
      const next = [...prev];
      const fromIdx = next.findIndex((t) => t.id === fromId);
      const toIdx = next.findIndex((t) => t.id === toId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const moved = next.splice(fromIdx, 1)[0];
      if (!moved) return prev;
      next.splice(toIdx, 0, moved);
      const ids = next.map((t) => t.id);
      api.gsd.tasks.reorder(projectKey, ids).catch(() => {
        // Revert on failure
        api.gsd.tasks.list(projectKey, false).then(({ tasks }) => setTasks(tasks)).catch(() => {});
      });
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Add / Edit task form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          placeholder="New task title..."
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-surface-3 border border-border rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
        />
        <textarea
          ref={descRef}
          placeholder="Description (optional)"
          value={description}
          rows={1}
          onChange={(e) => {
            setDescription(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          className="w-full bg-surface-3 border border-border rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent resize-none overflow-y-auto"
          style={{ maxHeight: "10rem" }}
        />
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
      </form>

      {/* Toggle + Copy all */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          {showArchived ? "Show open" : "Show archived"}
        </button>
        {!showArchived && !loading && tasks.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span>All:</span>
            <button
              onClick={handleCopyAll}
              aria-label="Copy all open tasks"
              className={`transition-colors ${copied ? "text-green-400" : "hover:text-gray-300"}`}
              title={copied ? "Copied!" : "Copy all tasks as markdown"}
            >
              <ClipboardCopy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleArchiveAll}
              aria-label="Archive all open tasks"
              className="hover:text-gray-300 transition-colors"
              title="Archive all open tasks"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Task list */}
      <div>
        {loading ? (
          <p className="text-sm text-gray-500 py-4">Loading tasks...</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-gray-600 py-4">
            {showArchived ? "No archived tasks." : "No open tasks yet."}
          </p>
        ) : (
          <div onDragLeave={() => setDragOverId(null)}>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                showArchived={showArchived}
                isDragOver={dragOverId === task.id}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
                onEdit={handleEdit}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
