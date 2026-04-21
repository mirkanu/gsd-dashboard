import { useState } from "react";
import { X, Loader2 } from "lucide-react";

interface PauseConfirmDialogProps {
  projectName: string | null;
  onClose: () => void;
  onSendPauseWork: (name: string) => Promise<void> | void;
  onJustPause: (name: string) => Promise<void> | void;
}

export function PauseConfirmDialog({
  projectName,
  onClose,
  onSendPauseWork,
  onJustPause,
}: PauseConfirmDialogProps) {
  const [busy, setBusy] = useState<null | "handoff" | "kill">(null);

  if (!projectName) return null;

  const run = async (mode: "handoff" | "kill") => {
    if (busy) return;
    setBusy(mode);
    try {
      if (mode === "handoff") await onSendPauseWork(projectName);
      else await onJustPause(projectName);
      onClose();
    } finally {
      setBusy(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !busy) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !busy && onClose()}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-confirm-title"
    >
      <div
        className="bg-surface-1 border border-border rounded-lg w-full max-w-[440px] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 id="pause-confirm-title" className="text-base font-semibold text-gray-100">
            Pause session
          </h2>
          <button
            onClick={onClose}
            disabled={!!busy}
            className="p-1 rounded hover:bg-surface-2 text-gray-400 hover:text-gray-200 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-gray-200">
            Run{" "}
            <span className="font-mono text-xs text-indigo-300">/gsd-pause-work</span>{" "}
            first so Claude can save a handoff before the session is killed?
          </p>
          <p className="text-xs text-gray-500">
            Project: <span className="font-mono text-gray-400">{projectName}</span>
          </p>

          <div className="flex flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => run("handoff")}
              disabled={!!busy}
              className="w-full px-4 py-2 rounded text-sm bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {busy === "handoff" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Send /gsd-pause-work
            </button>
            <button
              type="button"
              onClick={() => run("kill")}
              disabled={!!busy}
              className="w-full px-4 py-2 rounded text-sm bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {busy === "kill" && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Just pause (kill session)
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={!!busy}
              className="w-full px-4 py-2 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-2 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
