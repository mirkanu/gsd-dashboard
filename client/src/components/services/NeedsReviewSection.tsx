import { useState } from "react";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../../lib/api";
import type { GsdProject, NeedsReviewRow } from "../../lib/types";

interface NeedsReviewSectionProps {
  rows: NeedsReviewRow[];
  projects: GsdProject[];
  onChanged: () => void;
}

interface RowDraft {
  service: string;
  cost_usd: string;
  project_key: string;
  description: string;
}

export function NeedsReviewSection({ rows, projects, onChanged }: NeedsReviewSectionProps) {
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) return null;

  const getDraft = (row: NeedsReviewRow): RowDraft => {
    return (
      drafts[row.id] ?? {
        service: row.service,
        cost_usd: String(row.cost_usd),
        project_key: "",
        description: "",
      }
    );
  };

  const setDraft = (id: string, patch: Partial<RowDraft>) => {
    setDrafts((prev) => {
      const cur = prev[id] ?? { service: "", cost_usd: "", project_key: "", description: "" };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async (row: NeedsReviewRow) => {
    const d = getDraft(row);
    const amt = parseFloat(d.cost_usd);
    if (!d.service.trim() || Number.isNaN(amt) || amt <= 0) {
      setError("Service and a positive amount are required.");
      return;
    }
    setBusyId(row.id);
    setError(null);
    try {
      await api.services.costs.update(row.id, {
        service: d.service.trim(),
        cost_usd: amt,
        project_key: d.project_key || null,
        description: d.description,
        source: "email",
      });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to promote");
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (row: NeedsReviewRow) => {
    if (!confirm("Dismiss this entry? It will be deleted.")) return;
    setBusyId(row.id);
    setError(null);
    try {
      await api.services.costs.delete(row.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-yellow-500/30 bg-yellow-500/10">
        <h3 className="text-sm font-semibold text-yellow-200">
          Needs Review ({rows.length})
        </h3>
        <p className="text-xs text-yellow-300/70 mt-0.5">
          The parser couldn&apos;t extract these. Edit fields and Save to promote, or Dismiss to drop.
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/30">
          {error}
        </div>
      )}

      <div className="divide-y divide-yellow-500/20">
        {rows.map((row) => {
          const d = getDraft(row);
          const busy = busyId === row.id;
          const isExpanded = expanded.has(row.id);
          return (
            <div key={row.id} className="px-4 py-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <button
                  onClick={() => toggleExpand(row.id)}
                  className="flex items-center gap-1 hover:text-gray-200"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                  Raw body
                </button>
                <span className="text-gray-600">·</span>
                <span>{new Date(row.checked_at).toLocaleString()}</span>
              </div>

              {isExpanded && (
                <pre className="text-[10px] text-gray-500 bg-surface-2/40 rounded p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all">
                  {(row.raw_body ?? "(empty)").slice(0, 500)}
                  {row.raw_body && row.raw_body.length > 500 ? "…" : ""}
                </pre>
              )}

              <div className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  value={d.service}
                  onChange={(e) => setDraft(row.id, { service: e.target.value })}
                  placeholder="Service"
                  className="col-span-3 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-100"
                />
                <input
                  type="number"
                  step="0.01"
                  value={d.cost_usd}
                  onChange={(e) => setDraft(row.id, { cost_usd: e.target.value })}
                  placeholder="Amount"
                  className="col-span-2 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-100"
                />
                <select
                  value={d.project_key}
                  onChange={(e) => setDraft(row.id, { project_key: e.target.value })}
                  className="col-span-3 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-100"
                >
                  <option value="">Unassigned</option>
                  {projects.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.display_name || p.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={d.description}
                  onChange={(e) => setDraft(row.id, { description: e.target.value })}
                  placeholder="Description"
                  className="col-span-4 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-100"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleDismiss(row)}
                  disabled={busy}
                  className="px-3 py-1 rounded text-xs text-gray-400 hover:text-red-400 hover:bg-surface-2 disabled:opacity-50"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => handleSave(row)}
                  disabled={busy}
                  className="px-3 py-1 rounded text-xs bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 disabled:opacity-50 flex items-center gap-1"
                >
                  {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
