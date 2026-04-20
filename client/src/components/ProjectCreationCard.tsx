import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import {
  useProjectCreationState,
  clearCreationState,
} from '../hooks/useProjectCreationState';
import { ProjectProgressChip, CREATION_STEPS } from './ProjectProgressChip';

interface ProjectCreationCardProps {
  projectName: string;
  onDismiss?: () => void;
}

export function ProjectCreationCard({ projectName, onDismiss }: ProjectCreationCardProps) {
  const state = useProjectCreationState(projectName);
  const [resuming, setResuming] = useState(false);

  // When creation is complete (status === 'working'), clear creation state so the
  // real project card from the state broadcaster takes over.
  useEffect(() => {
    if (state?.status === 'working') {
      // Brief delay so the user sees the final "all steps done" state
      const timer = setTimeout(() => {
        clearCreationState(projectName);
        onDismiss?.();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state?.status, projectName, onDismiss]);

  if (!state) return null;

  const isFailed = state.status === 'error';
  const isAnalyzing = state.status === 'analyzing';

  const handleResume = async () => {
    setResuming(true);
    try {
      await fetch(`/api/projects/resume/${encodeURIComponent(projectName)}`, { method: 'POST' });
    } catch {
      // Resume attempt — error handled by backend; state updates via WebSocket
    } finally {
      setResuming(false);
    }
  };

  const handleDismiss = () => {
    clearCreationState(projectName);
    onDismiss?.();
  };

  return (
    <div className="card border border-border rounded-lg p-4 space-y-3 mx-2 mb-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-100 truncate">{projectName}</h3>
        {!isFailed && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            {isAnalyzing ? 'Analyzing' : 'Creating'}
          </span>
        )}
        {isFailed && (
          <span className="shrink-0 text-xs px-2 py-0.5 rounded bg-red-500/15 text-red-300">
            Setup incomplete
          </span>
        )}
      </div>

      {/* Progress chips — all 7 CREATION_STEPS */}
      <div className="space-y-1">
        {CREATION_STEPS.map(step => (
          <ProjectProgressChip key={step} step={step} state={state} />
        ))}
      </div>

      {/* Error message + Resume button */}
      {isFailed && (
        <div className="space-y-2">
          {state.error_message && (
            <p className="text-xs text-red-400">
              {state.failed_at_step && (
                <>
                  Failed at <span className="font-medium">{state.failed_at_step}</span>:{' '}
                </>
              )}
              {state.error_message}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleDismiss}
              className="px-2.5 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleResume}
              disabled={resuming}
              className="px-3 py-1 rounded text-xs bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/40 disabled:opacity-50 flex items-center gap-1"
            >
              {resuming && <Loader2 className="w-3 h-3 animate-spin" />}
              Resume
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
