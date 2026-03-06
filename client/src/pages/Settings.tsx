import { useEffect, useState, useCallback } from "react";
import { DollarSign, Plus, Pencil, Trash2, Check, X, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type { ModelPricing } from "../lib/types";

interface EditRow {
  model_pattern: string;
  display_name: string;
  input_per_mtok: string;
  output_per_mtok: string;
  cache_read_per_mtok: string;
  cache_write_per_mtok: string;
}

const emptyRow: EditRow = {
  model_pattern: "",
  display_name: "",
  input_per_mtok: "0",
  output_per_mtok: "0",
  cache_read_per_mtok: "0",
  cache_write_per_mtok: "0",
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso + (iso.endsWith("Z") ? "" : "Z"));
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Settings() {
  const [pricing, setPricing] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPattern, setEditingPattern] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<EditRow>(emptyRow);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [pricingRes, costRes] = await Promise.all([
        api.pricing.list(),
        api.pricing.totalCost(),
      ]);
      setPricing(pricingRes.pricing);
      setTotalCost(costRes.total_cost);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (rule: ModelPricing) => {
    setAdding(false);
    setEditingPattern(rule.model_pattern);
    setEditRow({
      model_pattern: rule.model_pattern,
      display_name: rule.display_name,
      input_per_mtok: String(rule.input_per_mtok),
      output_per_mtok: String(rule.output_per_mtok),
      cache_read_per_mtok: String(rule.cache_read_per_mtok),
      cache_write_per_mtok: String(rule.cache_write_per_mtok),
    });
  };

  const startAdd = () => {
    setEditingPattern(null);
    setAdding(true);
    setEditRow({ ...emptyRow });
  };

  const cancelEdit = () => {
    setEditingPattern(null);
    setAdding(false);
    setError(null);
  };

  const saveEdit = async () => {
    if (!editRow.model_pattern.trim() || !editRow.display_name.trim()) {
      setError("Pattern and display name are required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.pricing.upsert({
        model_pattern: editRow.model_pattern.trim(),
        display_name: editRow.display_name.trim(),
        input_per_mtok: parseFloat(editRow.input_per_mtok) || 0,
        output_per_mtok: parseFloat(editRow.output_per_mtok) || 0,
        cache_read_per_mtok: parseFloat(editRow.cache_read_per_mtok) || 0,
        cache_write_per_mtok: parseFloat(editRow.cache_write_per_mtok) || 0,
      });
      setEditingPattern(null);
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (pattern: string) => {
    try {
      await api.pricing.delete(pattern);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const lastUpdated =
    pricing.length > 0
      ? pricing.reduce(
          (latest, p) => (p.updated_at > latest ? p.updated_at : latest),
          pricing[0]!.updated_at
        )
      : null;

  const isEditing = editingPattern !== null || adding;

  const renderEditCells = () => (
    <>
      <td className="px-4 py-3">
        <input
          type="text"
          value={editRow.model_pattern}
          onChange={(e) => setEditRow((r) => ({ ...r, model_pattern: e.target.value }))}
          placeholder="claude-opus-4%"
          disabled={editingPattern !== null}
          className="input w-full text-sm font-mono disabled:opacity-50"
          autoFocus={adding}
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="text"
          value={editRow.display_name}
          onChange={(e) => setEditRow((r) => ({ ...r, display_name: e.target.value }))}
          placeholder="Claude Opus 4"
          className="input w-full text-sm"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          step="0.01"
          min="0"
          value={editRow.input_per_mtok}
          onChange={(e) => setEditRow((r) => ({ ...r, input_per_mtok: e.target.value }))}
          className="input w-full text-sm text-right font-mono"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          step="0.01"
          min="0"
          value={editRow.output_per_mtok}
          onChange={(e) => setEditRow((r) => ({ ...r, output_per_mtok: e.target.value }))}
          className="input w-full text-sm text-right font-mono"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          step="0.01"
          min="0"
          value={editRow.cache_read_per_mtok}
          onChange={(e) => setEditRow((r) => ({ ...r, cache_read_per_mtok: e.target.value }))}
          className="input w-full text-sm text-right font-mono"
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          step="0.01"
          min="0"
          value={editRow.cache_write_per_mtok}
          onChange={(e) => setEditRow((r) => ({ ...r, cache_write_per_mtok: e.target.value }))}
          className="input w-full text-sm text-right font-mono"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={saveEdit}
            disabled={saving}
            className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
            title="Save"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={cancelEdit}
            className="p-1.5 rounded-md text-gray-400 hover:bg-surface-4 transition-colors"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </td>
    </>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">Loading settings...</div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-100 mb-1">Settings</h2>
          <p className="text-sm text-gray-500">Manage model pricing for cost calculations</p>
        </div>
        <button onClick={load} className="btn-ghost">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Cost summary card */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Estimated Cost</p>
              <p className="text-2xl font-semibold text-gray-100">
                ${totalCost !== null ? totalCost.toFixed(2) : "-.--"}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-gray-500">
            <p>Across all tracked sessions</p>
            <p>Based on per-model token usage</p>
          </div>
        </div>
      </div>

      {/* Pricing table */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-gray-300">Model Pricing</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Rates per million tokens (USD). Use <code className="text-gray-400">%</code> as
              wildcard in patterns.
            </p>
          </div>
          <button
            onClick={startAdd}
            disabled={isEditing}
            className="btn-primary text-xs disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" /> Add Model
          </button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Pattern
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Display Name
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Input
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Output
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Cache Read
                </th>
                <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider text-right">
                  Cache Write
                </th>
                <th className="w-24 px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pricing.map((rule) =>
                editingPattern === rule.model_pattern ? (
                  <tr key={rule.model_pattern} className="bg-surface-3">
                    {renderEditCells()}
                  </tr>
                ) : (
                  <tr
                    key={rule.model_pattern}
                    className="hover:bg-surface-4 transition-colors group"
                  >
                    <td className="px-4 py-3 text-sm font-mono text-gray-300">
                      {rule.model_pattern}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-300">{rule.display_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-right font-mono">
                      ${rule.input_per_mtok}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-right font-mono">
                      ${rule.output_per_mtok}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-right font-mono">
                      ${rule.cache_read_per_mtok}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400 text-right font-mono">
                      ${rule.cache_write_per_mtok}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => startEdit(rule)}
                          disabled={isEditing}
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-30"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteRule(rule.model_pattern)}
                          disabled={isEditing}
                          className="p-1.5 rounded-md text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
              {adding && <tr className="bg-surface-3">{renderEditCells()}</tr>}
            </tbody>
          </table>
        </div>

        {lastUpdated && (
          <p className="text-xs text-gray-600 mt-3">Last updated: {formatTimestamp(lastUpdated)}</p>
        )}
      </div>
    </div>
  );
}
