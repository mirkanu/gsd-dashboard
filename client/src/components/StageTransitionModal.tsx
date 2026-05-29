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

  // Phase 59: migration step state
  const [migrateTasks, setMigrateTasks] = useState(false); // toggle — unchecked by default
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);

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

  async function handleMigrateAndConfirm() {
    setIsMigrating(true);
    setMigrationError(null);
    try {
      const result = await api.gsd.migrateTasksToGithub(project.name);
      if (result.failed.length > 0) {
        setMigrationError(
          `Failed to export ${result.failed.length} tasks to GitHub. Check your PAT and repo access, then retry.`
        );
        setIsMigrating(false);
        return; // Don't proceed to stage transition on partial failure
      }
      // Full success: proceed to stage transition
      await handleConfirm();
    } catch (err) {
      setMigrationError(err instanceof Error ? err.message : 'Migration failed');
      setIsMigrating(false);
    }
  }

  if (!isOpen) return null;

  const canConfirm = !isValidating && gates !== null && gates.valid;
  const needsProvisioning =
    gates?.requiresProvisioning && gates.requiresProvisioning.length > 0;

  const showMigrationStep =
    targetStage === 'launched' &&
    project.stage === 'beta' &&
    Boolean(project.github_repo);

  const confirmLabel = isMigrating
    ? 'Confirming & Migrating…'
    : showMigrationStep && migrateTasks
      ? 'Confirm & Migrate'
      : isConfirming
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

        {showMigrationStep && (
          <div className="space-y-3 border border-[var(--border)] rounded-lg p-4 bg-surface-2 mb-4">
            <h3 className="text-sm font-semibold text-gray-200">Back up your tasks to GitHub?</h3>
            <p className="text-sm text-gray-400">
              Your Dashboard tasks will be exported as GitHub Issues, labeled{' '}
              <code className="text-xs bg-surface-3 px-1 rounded">source:dashboard-migration</code>.{' '}
              You can roll back within 7 days.
            </p>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={migrateTasks}
                onChange={e => setMigrateTasks(e.target.checked)}
                disabled={isMigrating || isConfirming}
                className="mt-0.5 rounded border-border accent-indigo-500"
              />
              <span className="text-sm text-gray-300">Migrate tasks to GitHub</span>
            </label>
            <p className="text-xs text-gray-500 ml-6">
              If unchecked, tasks stay in the Dashboard. You can migrate anytime later.
            </p>

            {migrationError && (
              <p role="alert" className="text-sm text-red-400">{migrationError}</p>
            )}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isConfirming || isMigrating}
            className="flex-1 px-4 py-2 rounded-md bg-surface-3 text-gray-300 hover:text-white text-sm transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={showMigrationStep && migrateTasks ? handleMigrateAndConfirm : handleConfirm}
            disabled={isConfirming || isMigrating || !canConfirm}
            className="flex-1 px-4 py-2 rounded-md bg-accent text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {!canConfirm && !isConfirming && !isMigrating ? "Cannot advance" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
