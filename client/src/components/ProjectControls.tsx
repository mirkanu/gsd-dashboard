import { useState } from "react";
import { api } from "../lib/api";
import { AutopilotControls } from "./AutopilotControls";
import { StageBadge } from "./StageBadge";
import { StageBackfillChip } from "./StageBackfillChip";
import { StageTransitionModal } from "./StageTransitionModal";
import { KillArchiveModal } from "./KillArchiveModal";
import type { GsdProject, AutopilotRun, ProjectStage } from "../lib/types";

interface ProjectControlsProps {
  project: GsdProject;
  autopilotRun: AutopilotRun | null;
  onPauseSession: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onOpenTerminal: () => void;
  onReopenTmux: () => void;
  hideOpenTerminal?: boolean;
}

export function ProjectControls({
  project,
  autopilotRun,
  onPauseSession,
  onArchive,
  onUnarchive,
  onOpenTerminal,
  onReopenTmux,
  hideOpenTerminal = false,
}: ProjectControlsProps) {
  const [reopening, setReopening] = useState(false);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [targetStage, setTargetStage] = useState<ProjectStage | null>(null);
  const [showKillModal, setShowKillModal] = useState(false);

  const NEXT_STAGE: Partial<Record<ProjectStage, ProjectStage>> = {
    alpha: 'beta', beta: 'launched', launched: 'maintenance'
  };

  return (
    <div className="px-4 py-2 space-y-2">
      {/* Autopilot controls -- non-archived projects only */}
      {project.sessionState !== "archived" && (
        <AutopilotControls project={project} autopilotRun={autopilotRun} />
      )}

      {/* Divider between autopilot and action buttons */}
      <div className="border-t border-border/50" />

      {/* Stage badge + backfill chip */}
      <div className="flex items-center gap-1.5 mb-1">
        {project.stage ? (
          <StageBadge stage={project.stage} size="sm" />
        ) : (
          <StageBackfillChip projectName={project.name} onAssigned={() => { /* parent will refresh via WebSocket */ }} />
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {/* Terminal buttons */}
        {project.tmuxActive && !hideOpenTerminal ? (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenTerminal(); }}
            className="text-[10px] px-2 py-1 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            Open Terminal
          </button>
        ) : !project.tmuxActive && project.tmuxSession && (
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

        {/* Advance stage button — non-draft, non-retired projects with a stage set */}
        {project.stage && project.stage !== 'draft' && project.stage !== 'retired' && (() => {
          const next = NEXT_STAGE[project.stage!];
          return next ? (
            <button
              onClick={(e) => { e.stopPropagation(); setTargetStage(next); setShowTransitionModal(true); }}
              className="text-[10px] text-accent hover:text-accent/80 transition-colors"
            >
              ⬆ Advance to {next}
            </button>
          ) : null;
        })()}

        {/* Kill / Archive button — Draft stage only */}
        {(project.stage ?? 'draft') === 'draft' && (
          <button
            onClick={(e) => { e.stopPropagation(); setShowKillModal(true); }}
            className="text-[10px] text-red-600 hover:text-red-400 transition-colors"
          >
            Kill / Archive
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

      {/* Modals */}
      {showTransitionModal && targetStage && (
        <StageTransitionModal
          project={project}
          targetStage={targetStage}
          isOpen={showTransitionModal}
          onClose={() => setShowTransitionModal(false)}
          onSuccess={() => setShowTransitionModal(false)}
        />
      )}
      {showKillModal && (
        <KillArchiveModal
          project={project}
          isOpen={showKillModal}
          onClose={() => setShowKillModal(false)}
          onArchived={() => setShowKillModal(false)}
          onDeleted={() => setShowKillModal(false)}
        />
      )}
    </div>
  );
}
