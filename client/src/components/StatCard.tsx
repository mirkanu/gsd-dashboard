import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  accentColor?: string;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  accentColor = "text-accent",
}: StatCardProps) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${accentColor}`} />
      </div>
      <div className="flex items-end gap-2 min-w-0">
        <span className="text-2xl font-semibold text-gray-100 truncate">{value}</span>
        {trend && <span className="text-xs text-gray-500 mb-1 flex-shrink-0">{trend}</span>}
      </div>
    </div>
  );
}
