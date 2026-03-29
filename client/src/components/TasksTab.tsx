import { useState, useEffect } from "react";
import { Archive, ArchiveRestore, ClipboardCopy, Plus } from "lucide-react";
import { api } from "../lib/api";
import type { GsdTask } from "../lib/types";

function TaskRow({
  task,
  showArchived,
  onArchive,
  onUnarchive,
}: {
  task: GsdTask;
  showArchived: boolean;
  onArchive: (id: number) => void;
  onUnarchive: (id: number) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-2 border-b border-border last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-200 break-words">{task.title}</p>
        {task.description && (
          <p className="text-xs text-gray-500 mt-0.5 break-words">{task.description}</p>
        )}
      </div>
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || submitting) return;
    setSubmitting(true);
    try {
      const newTask = await api.gsd.tasks.create(
        projectKey,
        trimmedTitle,
        description.trim() || undefined
      );
      setTasks((prev) => [newTask, ...prev]);
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

  return (
    <div className="space-y-4">
      {/* Add task form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <input
          type="text"
          placeholder="New task title..."
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-surface-3 border border-border rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full bg-surface-3 border border-border rounded px-3 py-1.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={title.trim() === "" || submitting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/10 border border-accent/20 text-accent rounded hover:bg-accent/20 disabled:opacity-40 transition-colors"
        >
          <Plus className="w-3 h-3" />
          {submitting ? "Adding..." : "Add"}
        </button>
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
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            title="Copy all open tasks as markdown"
          >
            <ClipboardCopy className="w-3 h-3" />
            {copied ? "Copied!" : "Copy all"}
          </button>
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
          <div>
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                showArchived={showArchived}
                onArchive={handleArchive}
                onUnarchive={handleUnarchive}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
