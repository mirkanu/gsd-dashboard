import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { GsdProject, ProjectStage, StageValidationResult } from "../lib/types";
import { StageBadge } from "./StageBadge";

interface StageTransitionModalProps {
  project: GsdProject;
  targetStage: ProjectStage;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newStage: ProjectStage) => void;
}

export function StageTransitionModal({
  project,
  targetStage,
  isOpen,
  onClose,
  onSuccess,
}: StageTransitionModalProps) {
  const [gates, setGates] = useState<StageValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setGates(null);
    setError(null);
    setIsValidating(true);
    api.gsd
      .validateStageTransition(project.name, targetStage)
      .then((result) => {
        if (!cancelled) {
          setGates(result);
          setIsValidating(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setIsValidating(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, project.name, targetStage]);

  // Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  async function handleConfirm() {
    setIsConfirming(true);
    setError(null);
    try {
      await api.gsd.stageTransition(project.name, targetStage);
      onSuccess(targetStage);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stage transition failed");
    } finally {
      setIsConfirming(false);
    }
  }

  if (!isOpen) return null;

  const canConfirm = !isValidating && gates !== null && gates.valid;
  const needsProvisioning =
    gates?.requiresProvisioning && gates.requiresProvisioning.length > 0;
  const confirmLabel = isConfirming
    ? "Advancing..."
    : needsProvisioning
      ? "Confirm & Auto-Create"
      : "Confirm";

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-[var(--border)] rounded-lg p-6 max-w-sm w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          Advance to <StageBadge stage={targetStage} />?
        </h2>
        <p className="text-sm text-gray-400 mb-4">
          {project.display_name ?? project.name}
        </p>

        {isValidating && (
          <div className="text-sm text-gray-400 mb-4">Checking prerequisites...</div>
        )}

        {gates && (
          <div className="space-y-2 mb-4">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Prerequisites
            </div>
            {gates.hardGates.map((g) => (
              <div key={g.gate} className="flex items-start gap-2 text-sm">
                <span className="text-red-400 flex-shrink-0 mt-0.5">✗</span>
                <span className="text-gray-300">{g.label}</span>
              </div>
            ))}
            {gates.softGates
              .filter((g) => !g.pass)
              .map((g) => (
                <div key={g.gate} className="flex items-start gap-2 text-sm">
                  <span className="text-yellow-400 flex-shrink-0 mt-0.5">⚠</span>
                  <span className="text-gray-400">{g.label}</span>
                </div>
              ))}
            {needsProvisioning && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-md p-3 mt-2">
                <div className="text-xs text-blue-300 font-medium mb-1">
                  Will be automatically created:
                </div>
                <ul className="text-xs text-blue-300/80 space-y-1">
                  {gates.requiresProvisioning.includes("betterStackMonitor") && (
                    <li>• Uptime monitor via BetterStack</li>
                  )}
                  {gates.requiresProvisioning.includes("r2Bucket") && (
                    <li>• Backup bucket via Cloudflare R2</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {error && <div className="text-sm text-red-400 mb-4">{error}</div>}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isConfirming}
            className="flex-1 px-4 py-2 rounded-md bg-surface-3 text-gray-300 hover:text-white text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirming || !canConfirm}
            className="flex-1 px-4 py-2 rounded-md bg-accent text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!canConfirm && !isConfirming ? "Cannot advance" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
