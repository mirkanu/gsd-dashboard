import { useState } from "react";
import { api } from "../lib/api";
import type { GsdProject } from "../lib/types";

interface KillArchiveModalProps {
  project: GsdProject;
  isOpen: boolean;
  onClose: () => void;
  onArchived: () => void;
  onDeleted: () => void;
}

export function KillArchiveModal({
  project,
  isOpen,
  onClose,
  onArchived,
  onDeleted,
}: KillArchiveModalProps) {
  const [step, setStep] = useState<"choose" | "delete-confirm">("choose");
  const [deleteInput, setDeleteInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setStep("choose");
    setDeleteInput("");
    setError(null);
    onClose();
  }

  async function handleArchive() {
    setIsLoading(true);
    setError(null);
    try {
      await api.gsd.archive(project.name);
      handleClose();
      onArchived();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete() {
    if (deleteInput.trim() !== "DELETE") return;
    setIsLoading(true);
    setError(null);
    try {
      await fetch(`/api/gsd/projects/${encodeURIComponent(project.name)}`, {
        method: "DELETE",
      });
      handleClose();
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleClose}
    >
      <div
        className="bg-surface-1 border border-[var(--border)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "choose" && (
          <>
            <h2 className="text-lg font-semibold mb-2">
              Archive {project.display_name ?? project.name}?
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              The project will be hidden from your active Dashboard. You can restore it
              anytime from settings. Files and GitHub repo stay intact.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleArchive}
                disabled={isLoading}
                className="px-4 py-2 rounded-md bg-surface-3 text-gray-200 hover:text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isLoading ? "Archiving..." : "Archive"}
              </button>
              <button
                onClick={() => setStep("delete-confirm")}
                disabled={isLoading}
                className="px-4 py-2 rounded-md text-red-400 hover:text-red-300 text-sm transition-colors disabled:opacity-50"
              >
                Delete permanently
              </button>
              <button
                onClick={handleClose}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
            {error && <div className="text-sm text-red-400 mt-3">{error}</div>}
          </>
        )}

        {step === "delete-confirm" && (
          <>
            <h2 className="text-lg font-semibold mb-2 text-red-400">
              Permanently delete {project.display_name ?? project.name}?
            </h2>
            <p className="text-sm text-gray-400 mb-4">This will:</p>
            <ul className="text-sm text-gray-400 mb-4 space-y-1 ml-2">
              <li>• Destroy the GitHub repo</li>
              <li>• Delete all local files from /data/home/{project.name}</li>
              <li>• Stop the tmux session</li>
              <li>• Remove from Dashboard</li>
            </ul>
            <p className="text-sm text-red-400 font-medium mb-4">
              This cannot be undone. Type DELETE to confirm.
            </p>
            <input
              type="text"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              placeholder="Type DELETE to confirm"
              autoFocus
              className="w-full px-3 py-2 rounded-md bg-surface-2 border border-[var(--border)] text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-red-500/50 mb-4"
            />
            {error && <div className="text-sm text-red-400 mb-4">{error}</div>}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setStep("choose");
                  setDeleteInput("");
                  setError(null);
                }}
                disabled={isLoading}
                className="flex-1 px-4 py-2 rounded-md bg-surface-3 text-gray-300 hover:text-white text-sm transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleDelete}
                disabled={isLoading || deleteInput.trim() !== "DELETE"}
                className="flex-1 px-4 py-2 rounded-md bg-red-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
