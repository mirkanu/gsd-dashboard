import { useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Trash2, ChevronDown, ChevronRight as ChevronRightIcon } from "lucide-react";
import type { CostsResponse, CostEntry } from "../../lib/types";

interface CostsTableProps {
  data: CostsResponse | null;
  loading: boolean;
  month: string;
  onMonthChange: (month: string) => void;
  onAddClick: () => void;
  onEdit: (entry: CostEntry) => void;
  onDelete: (id: string) => void;
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function shiftMonth(month: string, delta: number): string {
  const [yStr, mStr] = month.split("-");
  const y = parseInt(yStr ?? "2026", 10);
  const m = parseInt(mStr ?? "01", 10);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fmtMonthLabel(month: string): string {
  const [yStr, mStr] = month.split("-");
  const y = parseInt(yStr ?? "2026", 10);
  const m = parseInt(mStr ?? "01", 10);
  const date = new Date(Date.UTC(y, m - 1, 1));
  return date.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border last:border-0 animate-pulse">
      <div className="h-4 bg-surface-2 rounded w-32" />
      <div className="h-4 bg-surface-2 rounded w-16" />
    </div>
  );
}

export function CostsTable({
  data,
  loading,
  month,
  onMonthChange,
  onAddClick,
  onEdit,
  onDelete,
}: CostsTableProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  const toggleProject = (key: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const services = data?.services ?? [];
  const projects = data?.projects ?? [];
  const entries = data?.entries ?? [];
  const grandTotal = services.reduce((sum, s) => sum + s.total_usd, 0);

  // Hide entries that came from email parsing (they're shown in Needs Review when unparsed,
  // and otherwise rolled up). Only manual + recurring are user-managed inline.
  const editableEntries = entries.filter((e) => e.source === "manual" || e.source === "recurring");

  return (
    <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
      {/* Header: month nav + add */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            className="p-1 rounded hover:bg-surface-2 text-gray-400 hover:text-gray-200 transition-colors"
            title="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-gray-200 min-w-[140px] text-center">
            {fmtMonthLabel(month)}
          </span>
          <button
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            className="p-1 rounded hover:bg-surface-2 text-gray-400 hover:text-gray-200 transition-colors"
            title="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            Total: <span className="text-gray-100 font-medium">{fmtUsd(grandTotal)}</span>
          </span>
          <button
            onClick={onAddClick}
            className="px-3 py-1.5 rounded-lg text-sm bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/30 transition-colors"
          >
            + Add Cost
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* By Service */}
          <div className="border-b md:border-b-0 md:border-r border-border">
            <div className="px-4 py-2 bg-surface-2/50 text-xs uppercase tracking-wide text-gray-400 font-medium">
              By Service
            </div>
            {services.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500 text-center">
                No costs recorded for this month.
              </div>
            ) : (
              services.map((s) => (
                <div
                  key={s.service}
                  className="flex items-center justify-between px-4 py-2 border-b border-border last:border-0 text-sm"
                >
                  <span className="text-gray-200">{s.service}</span>
                  <span className="text-gray-100 font-medium tabular-nums">
                    {fmtUsd(s.total_usd)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* By Project */}
          <div>
            <div className="px-4 py-2 bg-surface-2/50 text-xs uppercase tracking-wide text-gray-400 font-medium">
              By Project
            </div>
            {projects.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-500 text-center">
                No projects with costs.
              </div>
            ) : (
              projects.map((p) => {
                const key = p.project_key ?? "__unassigned__";
                const expanded = expandedProjects.has(key);
                return (
                  <div key={key} className="border-b border-border last:border-0 text-sm">
                    <button
                      onClick={() => toggleProject(key)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-surface-2/40 text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        {expanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                        ) : (
                          <ChevronRightIcon className="w-3.5 h-3.5 text-gray-500" />
                        )}
                        <span className="text-gray-200">
                          {p.project_key ?? <span className="italic text-gray-500">Unassigned</span>}
                        </span>
                      </span>
                      <span className="text-gray-100 font-medium tabular-nums">
                        {fmtUsd(p.total_usd)}
                      </span>
                    </button>
                    {expanded && (
                      <div className="px-8 pb-2 space-y-1">
                        {p.services.map((s) => (
                          <div
                            key={s.service}
                            className="flex items-center justify-between text-xs text-gray-400"
                          >
                            <span>{s.service}</span>
                            <span className="tabular-nums">{fmtUsd(s.total_usd)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Inline entries — manual + recurring (user-managed) */}
      {editableEntries.length > 0 && (
        <div className="border-t border-border">
          <div className="px-4 py-2 bg-surface-2/50 text-xs uppercase tracking-wide text-gray-400 font-medium">
            Manual & Recurring Entries
          </div>
          <div className="divide-y divide-border">
            {editableEntries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-surface-2/30"
              >
                <span className="text-gray-200 min-w-[80px]">{e.service}</span>
                <span className="text-gray-400 text-xs flex-1 truncate">
                  {e.description || "—"}
                  {e.source === "recurring" && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 text-[10px]">
                      recurring
                    </span>
                  )}
                </span>
                <span className="text-xs text-gray-500">
                  {e.project_key ?? <span className="italic">unassigned</span>}
                </span>
                <span className="text-gray-100 font-medium tabular-nums min-w-[60px] text-right">
                  {fmtUsd(e.cost_usd)}
                </span>
                <button
                  onClick={() => onEdit(e)}
                  className="p-1 rounded hover:bg-surface-2 text-gray-500 hover:text-gray-200"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(e.id)}
                  className="p-1 rounded hover:bg-surface-2 text-gray-500 hover:text-red-400"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
