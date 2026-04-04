import { useState } from "react";
import { api } from "../lib/api";
import { AutopilotControls } from "./AutopilotControls";
import type { GsdProject, AutopilotRun } from "../lib/types";

interface ProjectControlsProps {
  project: GsdProject;
  autopilotRun: AutopilotRun | null;
  onPauseSession: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onOpenTerminal: () => void;
  onReopenTmux: () => void;
}

export function ProjectControls({
  project,
  autopilotRun,
  onPauseSession,
  onArchive,
  onUnarchive,
  onOpenTerminal,
  onReopenTmux,
}: ProjectControlsProps) {
  const [reopening, setReopening] = useState(false);

  return (
    <div className="px-4 py-2 space-y-2">
      {/* Autopilot controls -- non-archived projects only */}
      {project.sessionState !== "archived" && (
        <AutopilotControls project={project} autopilotRun={autopilotRun} />
      )}

      {/* Divider between autopilot and action buttons */}
      <div className="border-t border-border/50" />

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {/* Terminal buttons */}
        {project.tmuxActive ? (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenTerminal(); }}
            className="text-[10px] px-2 py-1 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            Open Terminal
          </button>
        ) : project.tmuxSession && (
          <button
            onClick={async (e) => {
              e.stopPropagation();
              if (reopening) return;
              setReopening(true);
              try { await api.gsd.reopenTmux(project.name); }
              catch { /* silent */ }
              setReopening(false);
              onReopenTmux();
            }}
            disabled={reopening}
            className="text-[10px] px-2 py-1 rounded border border-border text-gray-500 hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-50"
          >
            {reopening ? "Starting..." : "Re-open Tmux"}
          </button>
        )}

        {/* Pause / Archive / Unarchive */}
        {project.sessionState !== "archived" ? (
          <>
            {project.sessionState !== "paused" && (
              <button
                onClick={(e) => { e.stopPropagation(); onPauseSession(); }}
                className="text-[10px] text-red-600 hover:text-red-400 transition-colors"
              >
                Pause
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(); }}
              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Archive
            </button>
          </>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onUnarchive(); }}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Unarchive
          </button>
        )}
      </div>
    </div>
  );
}
