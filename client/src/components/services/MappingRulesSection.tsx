import { useState, useEffect, useCallback } from "react";
import { Trash2, Plus, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import type { GsdProject, MappingRule } from "../../lib/types";

interface MappingRulesSectionProps {
  projects: GsdProject[];
}

interface DraftRule {
  pattern_type: "sender" | "subject_contains";
  pattern_value: string;
  service: string;
  project_key: string;
}

const EMPTY_DRAFT: DraftRule = {
  pattern_type: "sender",
  pattern_value: "",
  service: "",
  project_key: "",
};

export function MappingRulesSection({ projects }: MappingRulesSectionProps) {
  const [rules, setRules] = useState<MappingRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftRule>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await api.services.rules.list();
      setRules(res.rules);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules");
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleSave = async () => {
    if (!draft.pattern_value.trim() || !draft.project_key) {
      setError("Pattern value and project are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.services.rules.create({
        pattern_type: draft.pattern_type,
        pattern_value: draft.pattern_value.trim(),
        project_key: draft.project_key,
        service: draft.service.trim() || null,
      });
      setDraft(EMPTY_DRAFT);
      setAdding(false);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this rule?")) return;
    try {
      await api.services.rules.delete(id);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete rule");
    }
  };

  return (
    <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs text-gray-400">
          Rules run in order — first match wins. <span className="text-gray-500">sender</span>{" "}
          matches the email address; <span className="text-gray-500">subject_contains</span>{" "}
          matches a subject substring. Optional service filter scopes the rule.
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/30">
          {error}
        </div>
      )}

      {rules === null ? (
        <div className="divide-y divide-border">
          <div className="px-4 py-3 animate-pulse">
            <div className="h-3 bg-surface-2 rounded w-2/3" />
          </div>
          <div className="px-4 py-3 animate-pulse">
            <div className="h-3 bg-surface-2 rounded w-1/2" />
          </div>
          <div className="px-4 py-3 animate-pulse">
            <div className="h-3 bg-surface-2 rounded w-3/4" />
          </div>
        </div>
      ) : rules.length === 0 && !adding ? (
        <div className="px-4 py-6 text-sm text-gray-500 text-center">No rules defined.</div>
      ) : (
        <div className="divide-y divide-border">
          {rules.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-12 gap-2 items-center px-4 py-2 text-sm"
            >
              <span className="col-span-2 text-xs text-gray-400">{r.pattern_type}</span>
              <span className="col-span-4 text-gray-200 truncate" title={r.pattern_value}>
                {r.pattern_value}
              </span>
              <span className="col-span-2 text-xs text-gray-500 truncate">
                {r.service ?? <span className="italic">any</span>}
              </span>
              <span className="col-span-3 text-gray-300 truncate" title={r.project_key}>
                → {r.project_key}
              </span>
              <button
                onClick={() => handleDelete(r.id)}
                className="col-span-1 justify-self-end p-1 rounded hover:bg-surface-2 text-gray-500 hover:text-red-400"
                title="Delete rule"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="grid grid-cols-12 gap-2 items-center px-4 py-3 bg-surface-2/30 border-t border-border">
          <select
            value={draft.pattern_type}
            onChange={(e) =>
              setDraft({ ...draft, pattern_type: e.target.value as DraftRule["pattern_type"] })
            }
            className="col-span-2 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-100"
          >
            <option value="sender">sender</option>
            <option value="subject_contains">subject_contains</option>
          </select>
          <input
            type="text"
            value={draft.pattern_value}
            onChange={(e) => setDraft({ ...draft, pattern_value: e.target.value })}
            placeholder="e.g., billing@railway.app"
            className="col-span-4 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-100"
          />
          <input
            type="text"
            value={draft.service}
            onChange={(e) => setDraft({ ...draft, service: e.target.value })}
            placeholder="service (opt)"
            className="col-span-2 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-100"
          />
          <select
            value={draft.project_key}
            onChange={(e) => setDraft({ ...draft, project_key: e.target.value })}
            className="col-span-3 bg-surface-2 border border-border rounded px-2 py-1 text-xs text-gray-100"
          >
            <option value="">Select project…</option>
            {projects.map((p) => (
              <option key={p.name} value={p.name}>
                {p.display_name || p.name}
              </option>
            ))}
          </select>
          <div className="col-span-1 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
              title="Save"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "✓"}
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-2 border-t border-border bg-surface-2/20 flex justify-between">
        {adding ? (
          <button
            onClick={() => {
              setAdding(false);
              setDraft(EMPTY_DRAFT);
              setError(null);
            }}
            className="text-xs text-gray-400 hover:text-gray-200"
          >
            Cancel
          </button>
        ) : (
          <span />
        )}
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 text-xs text-indigo-300 hover:text-indigo-200"
          >
            <Plus className="w-3 h-3" />
            Add Rule
          </button>
        )}
      </div>
    </div>
  );
}
