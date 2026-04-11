import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import { api } from "../../lib/api";
import type { CostEntry, CreateCostBody, GsdProject } from "../../lib/types";

interface AddCostDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  projects: GsdProject[];
  entry?: CostEntry | null; // edit mode if set
}

const KNOWN_SERVICES = ["Railway", "OpenAI", "Anthropic", "Vercel", "GitHub", "Cloudflare", "Other"];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AddCostDialog({ open, onClose, onSaved, projects, entry }: AddCostDialogProps) {
  const isEdit = !!entry;
  const [service, setService] = useState("");
  const [serviceCustom, setServiceCustom] = useState("");
  const [projectKey, setProjectKey] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [startDate, setStartDate] = useState(todayIso());
  const [recurring, setRecurring] = useState(false);
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (entry) {
      const known = KNOWN_SERVICES.includes(entry.service);
      setService(known ? entry.service : "Other");
      setServiceCustom(known ? "" : entry.service);
      setProjectKey(entry.project_key ?? "");
      setAmount(String(entry.cost_usd));
      setCurrency(entry.currency || "USD");
      setStartDate(entry.checked_at?.slice(0, 10) || todayIso());
      setRecurring(entry.source === "recurring");
      setDescription(entry.description || "");
      setNotes("");
    } else {
      setService("");
      setServiceCustom("");
      setProjectKey("");
      setAmount("");
      setCurrency("USD");
      setStartDate(todayIso());
      setRecurring(false);
      setDescription("");
      setNotes("");
    }
    setError(null);
    setSubmitting(false);
  }, [open, entry]);

  if (!open) return null;

  const resolvedService = service === "Other" ? serviceCustom.trim() : service;
  const amountNum = parseFloat(amount);
  const valid = resolvedService.length > 0 && !Number.isNaN(amountNum) && amountNum > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: CreateCostBody = {
        service: resolvedService,
        project_key: projectKey || null,
        cost_usd: amountNum,
        currency,
        start_date: startDate,
        recurring_monthly: recurring,
        description,
        notes,
      };
      if (isEdit && entry) {
        await api.services.costs.update(entry.id, body);
      } else {
        await api.services.costs.create(body);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-1 border border-border rounded-lg w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-base font-semibold text-gray-100">
            {isEdit ? "Edit Cost" : "Add Cost"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-surface-2 text-gray-400 hover:text-gray-200"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Service</label>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100"
              required
            >
              <option value="">Select…</option>
              {KNOWN_SERVICES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {service === "Other" && (
              <input
                type="text"
                value={serviceCustom}
                onChange={(e) => setServiceCustom(e.target.value)}
                placeholder="Service name"
                className="mt-2 w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100"
              />
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Project</label>
            <select
              value={projectKey}
              onChange={(e) => setProjectKey(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100"
            >
              <option value="">Unassigned</option>
              {projects.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.display_name || p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">Currency</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Hobby plan"
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              disabled={isEdit}
              className="rounded border-border"
            />
            <span>Recurring monthly</span>
            {isEdit && <span className="text-xs text-gray-500">(can&apos;t change after create)</span>}
          </label>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!valid || submitting}
              className="px-4 py-1.5 rounded text-sm bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEdit ? "Save" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
