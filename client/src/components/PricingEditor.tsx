import { useEffect, useState, useCallback } from "react";
import { Info, Save } from "lucide-react";
import { api } from "../lib/api";
import type { ModelPricing } from "../lib/types";

interface PricingEditorProps {
  onChange?: () => void;
}

interface RowDraft extends ModelPricing {
  dirty: boolean;
  saving: boolean;
}

export function PricingEditor({ onChange }: PricingEditorProps) {
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { pricing } = await api.pricing.list();
      setRows(pricing.map((p) => ({ ...p, dirty: false, saving: false })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load pricing rules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const updateField = (idx: number, field: keyof ModelPricing, value: number) => {
    setRows((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value, dirty: true } : r))
    );
  };

  const saveRow = async (idx: number) => {
    const row = rows[idx];
    if (!row || !row.dirty) return;
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: true } : r)));
    try {
      await api.pricing.upsert({
        model_pattern: row.model_pattern,
        display_name: row.display_name,
        input_per_mtok: row.input_per_mtok,
        output_per_mtok: row.output_per_mtok,
        cache_read_per_mtok: row.cache_read_per_mtok,
        cache_write_per_mtok: row.cache_write_per_mtok,
      });
      await fetchRules();
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, saving: false } : r)));
    }
  };

  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4">
      <div className="flex items-start gap-2 mb-4">
        <Info className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div>
          <h2 className="text-sm font-medium text-gray-200">Model Pricing</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Rates are per 1 million tokens. Cost per model ={" "}
            (input_tokens / 1M × input_rate) +{" "}
            (output_tokens / 1M × output_rate) +{" "}
            (cache_read_tokens / 1M × cache_read_rate) +{" "}
            (cache_write_tokens / 1M × cache_write_rate).
          </p>
          <ul className="text-xs text-gray-500 mt-2 space-y-0.5">
            <li>
              <span className="text-gray-300">Input</span> — tokens in prompts you send to Claude.
            </li>
            <li>
              <span className="text-gray-300">Output</span> — tokens Claude generates in its reply.
            </li>
            <li>
              <span className="text-gray-300">Cache read</span> — cached prompt prefix reused on
              follow-up turns (cheaper).
            </li>
            <li>
              <span className="text-gray-300">Cache write</span> — cost of writing a new prompt
              prefix into the cache (once).
            </li>
          </ul>
        </div>
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 bg-surface-2 rounded animate-pulse" />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="text-sm text-red-400 mb-3">
          {error}{" "}
          <button onClick={fetchRules} className="underline">
            Retry
          </button>
        </div>
      )}

      {!loading && rows.length === 0 && !error && (
        <p className="text-sm text-gray-500">No pricing rules configured.</p>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row, idx) => (
            <div key={row.model_pattern} className="border border-border rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-sm text-gray-100">{row.display_name}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{row.model_pattern}</div>
                </div>
                <button
                  onClick={() => saveRow(idx)}
                  disabled={!row.dirty || row.saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-accent/80 text-white hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Save className="w-3 h-3" />
                  {row.saving ? "Saving…" : "Save"}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {(
                  [
                    ["input_per_mtok", "Input / MTok"],
                    ["output_per_mtok", "Output / MTok"],
                    ["cache_read_per_mtok", "Cache read / MTok"],
                    ["cache_write_per_mtok", "Cache write / MTok"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="block">
                    <span className="text-[10px] text-gray-500 block mb-0.5">{label}</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row[field]}
                      onChange={(e) => updateField(idx, field, parseFloat(e.target.value) || 0)}
                      className="w-full bg-surface-2 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:border-accent"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
