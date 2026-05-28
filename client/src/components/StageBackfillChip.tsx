import { useState } from "react";
import { Pencil } from "lucide-react";
import { api } from "../lib/api";
import type { ProjectStage } from "../lib/types";

const STAGE_OPTIONS: { value: ProjectStage; label: string; description: string }[] = [
  { value: "draft", label: "Draft", description: "Idea exploring, might get killed" },
  { value: "alpha", label: "Alpha", description: "Real structure, single env, single user" },
  { value: "beta", label: "Beta", description: "Shared with ≥1 outsider" },
  { value: "launched", label: "Launched", description: "Real users / real reliance" },
  { value: "maintenance", label: "Maintenance", description: "Live but low velocity" },
  { value: "retired", label: "Retired", description: "Not actively developed" },
];

interface StageBackfillChipProps {
  projectName: string;
  onAssigned: (stage: ProjectStage) => void;
}

export function StageBackfillChip({ projectName, onAssigned }: StageBackfillChipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(stage: ProjectStage) {
    setIsLoading(true);
    setError(null);
    try {
      await api.gsd.stageTransition(projectName, stage);
      setIsOpen(false);
      onAssigned(stage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to assign stage");
    } finally {
      setIsLoading(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-full bg-surface-3 border border-[var(--border)] text-gray-400 hover:text-gray-200 transition-colors"
        aria-label="Assign stage to project"
      >
        <Pencil size={10} />
        Assign stage
      </button>
    );
  }

  return (
    <div
      className="flex flex-col gap-1 p-2 bg-surface-2 border border-[var(--border)] rounded-lg shadow-lg z-10 min-w-[200px]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-xs font-semibold text-gray-400 mb-1">
        What stage is this project in?
      </div>
      {STAGE_OPTIONS.map(({ value, label, description }) => (
        <button
          key={value}
          onClick={() => handleSelect(value)}
          disabled={isLoading}
          className="text-left px-2 py-1.5 rounded hover:bg-surface-3 disabled:opacity-50 transition-colors"
        >
          <div className="text-xs font-medium text-gray-200">{label}</div>
          <div className="text-[10px] text-gray-500">{description}</div>
        </button>
      ))}
      {error && <div className="text-[10px] text-red-400 mt-1">{error}</div>}
      <button
        onClick={() => setIsOpen(false)}
        className="text-xs text-gray-500 hover:text-gray-300 mt-1 text-left"
      >
        Cancel
      </button>
    </div>
  );
}
