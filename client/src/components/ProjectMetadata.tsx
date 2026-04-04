import type { GsdProject } from "../lib/types";

const SESSION_STATE_STYLE: Record<string, string> = {
  working: "bg-emerald-500/20 text-emerald-400",
  waiting: "bg-amber-400/20 text-amber-400",
  paused: "bg-red-500/20 text-red-400",
  archived: "bg-gray-600/20 text-gray-500",
};

const CONTEXT_WINDOW = 200_000;

function ContextGauge({ tokens }: { tokens: number }) {
  const pct = Math.min(tokens / CONTEXT_WINDOW, 1);
  const hue = Math.round(120 * (1 - pct));
  return (
    <div>
      <div className="flex justify-between items-center mb-0.5">
        <span className="text-[10px] text-gray-500">Context</span>
        <span className="text-[10px]" style={{ color: `hsl(${hue}, 70%, 55%)` }}>
          {Math.round(pct * 100)}%
        </span>
      </div>
      <div className="w-full h-1 rounded-full bg-surface-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct * 100}%`, backgroundColor: `hsl(${hue}, 70%, 45%)` }}
        />
      </div>
    </div>
  );
}

export function ProjectMetadata({ project }: { project: GsdProject }) {
  const { state } = project;
  const progress = state?.progress;
  const hasPhaseProgress = progress?.percent != null && progress.percent > 0;
  const milestoneName = state?.milestone_name && state.milestone_name !== "milestone"
    ? state.milestone_name
    : null;

  return (
    <div className="px-4 py-2 space-y-1.5">
      {/* Top row: session state badge + version + current phase */}
      <div className="flex items-center gap-2 flex-wrap">
        {project.sessionState && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            SESSION_STATE_STYLE[project.sessionState] || SESSION_STATE_STYLE.archived
          }`}>
            {project.sessionState}
          </span>
        )}
        {project.version && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 text-gray-400 border border-border">
            {project.version}
          </span>
        )}
        {state?.current_phase && (
          <span className="text-[10px] text-gray-500">
            Phase {state.current_phase}
          </span>
        )}
        {milestoneName && (
          <span className="text-[10px] text-gray-600 truncate">
            {milestoneName}
          </span>
        )}
      </div>

      {/* Context window gauge */}
      {project.contextTokens != null && project.contextTokens > 0 && (
        <ContextGauge tokens={project.contextTokens} />
      )}

      {/* Phase progress bar */}
      {hasPhaseProgress && (
        <div>
          <div className="flex justify-between items-center mb-0.5">
            <span className="text-[10px] text-gray-500">Phase progress</span>
            <span className="text-[10px] text-gray-400">{progress!.percent}%</span>
          </div>
          <div className="w-full h-1 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${progress!.percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
