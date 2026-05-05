import { useState } from "react";
import { api } from "../lib/api";
import type { GsdProject } from "../lib/types";

interface VerifyBadgeProps {
  project: GsdProject;
}

const VERIFY_STATE_STYLES = {
  verifying:       "bg-blue-500/10 text-blue-400 border-blue-500/20",
  'verify-failed': "bg-amber-500/10 text-amber-400 border-amber-500/20",
  'verify-passed': "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
} as const;

export function VerifyBadge({ project }: VerifyBadgeProps) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (!project.verifyState || project.verifyState === 'verify-passed') return null;

  const style = VERIFY_STATE_STYLES[project.verifyState];

  if (project.verifyState === 'verifying') {
    return (
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${style}`}>
        Verifying...
      </span>
    );
  }

  // verify-failed
  return (
    <div className="flex flex-col gap-1 mt-1">
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border self-start ${style}`}>
        Check failed
      </span>
      {project.verifyFailureSummary && (
        <p className="text-[10px] text-gray-400 leading-tight px-1 line-clamp-2">
          {project.verifyFailureSummary}
        </p>
      )}
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (retrying) return;
          setRetrying(true);
          setRetryError(null);
          try {
            await api.gsd.verify(project.name);
            setRetrying(false);
          } catch (err) {
            setRetryError(err instanceof Error ? err.message : 'Failed');
            setRetrying(false);
          }
        }}
        disabled={retrying}
        className="text-[10px] px-2 py-1 rounded border border-border text-gray-500 hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-50 self-start"
      >
        {retrying ? "Fixing..." : "Try to fix it?"}
      </button>
      {retryError && (
        <span className="text-[10px] text-red-400">{retryError}</span>
      )}
    </div>
  );
}
