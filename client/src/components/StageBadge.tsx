import type { ProjectStage } from "../lib/types";

const STAGE_LABELS: Record<ProjectStage, string> = {
  draft: "📝 Draft",
  alpha: "🔬 Alpha",
  beta: "🧪 Beta",
  launched: "🚀 Launched",
  maintenance: "🔧 Maintenance",
  retired: "📦 Retired",
};

const STAGE_STYLES: Record<ProjectStage, string> = {
  draft: "bg-gray-500/20 text-gray-400",
  alpha: "bg-yellow-500/20 text-yellow-400",
  beta: "bg-blue-500/20 text-blue-400",
  launched: "bg-emerald-500/20 text-emerald-400",
  maintenance: "bg-orange-500/20 text-orange-400",
  retired: "bg-gray-600/20 text-gray-500",
};

interface StageBadgeProps {
  stage: ProjectStage | undefined | null;
  size?: "sm" | "md";
}

export function StageBadge({ stage, size = "md" }: StageBadgeProps) {
  if (!stage) return null;
  const sizeClasses =
    size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1";
  return (
    <span
      className={`rounded-full font-semibold inline-flex items-center gap-1 ${sizeClasses} ${STAGE_STYLES[stage] ?? "bg-gray-500/20 text-gray-400"}`}
      aria-label={`Project is in ${stage} stage`}
    >
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}
