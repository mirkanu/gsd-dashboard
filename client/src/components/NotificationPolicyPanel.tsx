import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, Check, Clock, Loader2, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
import type { NotificationPolicy } from "../lib/api";

// ─── Toggle switch ────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer group">
      <span className="text-sm text-gray-300 group-hover:text-gray-100 transition-colors">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
          checked ? "bg-accent" : "bg-surface-3"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform duration-200 ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

// ─── Event type registry ──────────────────────────────────────────────────────

const EVENT_TYPES = [
  { key: "waiting_input",       label: "Session waiting for user input",         defaultOn: true  },
  { key: "plan_complete",       label: "Plan/phase completed",                   defaultOn: true  },
  { key: "verify_failed",       label: "Verify-work failed",                     defaultOn: true  },
  { key: "verify_passed",       label: "Verify-work passed (after retry)",        defaultOn: false },
  { key: "idle_session_closed", label: "Idle session auto-closed",               defaultOn: true  },
  { key: "cost_anomaly",        label: "External service cost anomaly",           defaultOn: true  },
  { key: "github_issue_filed",  label: "New GitHub Issue filed (Launched only)", defaultOn: false },
  { key: "session_started",     label: "Session started",                        defaultOn: false },
  { key: "tool_use",            label: "Individual tool-use events",             defaultOn: false },
  { key: "turn_complete",       label: "Claude finished responding (per turn)",  defaultOn: false },
];

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_POLICY: NotificationPolicy = {
  enabled: true,
  quiet_hours_from: null,
  quiet_hours_to: null,
  rate_limit_per_hour: 5,
  event_toggles: {},
};

// ─── Component ────────────────────────────────────────────────────────────────

export function NotificationPolicyPanel() {
  const [policy, setPolicy] = useState<NotificationPolicy>(DEFAULT_POLICY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testState, setTestState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const loadPolicy = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.notifications.getPolicy();
      setPolicy(data.policy);
    } catch {
      setPolicy(DEFAULT_POLICY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPolicy();
  }, [loadPolicy]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.notifications.savePolicy(policy);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTestState("sending");
    try {
      await api.notifications.sendTest();
      setTestState("ok");
      setTimeout(() => setTestState("idle"), 3000);
    } catch {
      setTestState("error");
      setTimeout(() => setTestState("idle"), 3000);
    }
  };

  const getToggle = (key: string) =>
    key in policy.event_toggles
      ? policy.event_toggles[key]
      : (EVENT_TYPES.find((e) => e.key === key)?.defaultOn ?? false);

  const setToggle = (key: string, value: boolean) =>
    setPolicy((p) => ({ ...p, event_toggles: { ...p.event_toggles, [key]: value } }));

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-4 w-32 bg-surface-3 rounded" />
        <div className="h-10 w-full bg-surface-3 rounded-lg" />
      </div>
    );
  }

  const allDisabled = !policy.enabled;

  return (
    <div className="space-y-4">
      {/* Global enable */}
      <div className="bg-surface-2 border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          {policy.enabled ? (
            <Bell className="w-4 h-4 text-gray-400" />
          ) : (
            <BellOff className="w-4 h-4 text-gray-400" />
          )}
          <h2 className="text-sm font-semibold text-gray-200">Notifications</h2>
        </div>
        <Toggle
          checked={policy.enabled}
          onChange={(v) => setPolicy((p) => ({ ...p, enabled: v }))}
          label="Enable Telegram notifications"
        />
        <p className="text-xs text-gray-500 mt-1">
          Receive filtered Telegram messages for selected events.
        </p>
      </div>

      {/* Quiet hours */}
      <div
        className={`bg-surface-2 border border-border rounded-xl p-4 space-y-3 ${
          allDisabled ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <Clock className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-200">Quiet Hours</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">From</label>
            <input
              type="time"
              value={policy.quiet_hours_from || ""}
              onChange={(e) =>
                setPolicy((p) => ({ ...p, quiet_hours_from: e.target.value || null }))
              }
              className="bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">To</label>
            <input
              type="time"
              value={policy.quiet_hours_to || ""}
              onChange={(e) =>
                setPolicy((p) => ({ ...p, quiet_hours_to: e.target.value || null }))
              }
              className="bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500">
          No notifications outside this window except high-priority. Times are UTC.
        </p>
      </div>

      {/* Rate limit */}
      <div
        className={`bg-surface-2 border border-border rounded-xl p-4 space-y-2 ${
          allDisabled ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <h2 className="text-sm font-semibold text-gray-200">Rate Limit</h2>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-300">Max</label>
          <input
            type="number"
            min={1}
            max={100}
            value={policy.rate_limit_per_hour}
            onChange={(e) =>
              setPolicy((p) => ({
                ...p,
                rate_limit_per_hour: Math.max(1, Math.min(100, Number(e.target.value))),
              }))
            }
            className="w-20 bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <span className="text-sm text-gray-300">notifications per hour</span>
        </div>
        <p className="text-xs text-gray-500">
          Excess events are deduplicated or queued for later delivery.
        </p>
      </div>

      {/* Event toggles */}
      <div
        className={`bg-surface-2 border border-border rounded-xl p-4 space-y-1 ${
          allDisabled ? "opacity-50 pointer-events-none" : ""
        }`}
      >
        <h2 className="text-sm font-semibold text-gray-200 mb-2">Event Types</h2>
        {EVENT_TYPES.map(({ key, label }) => (
          <Toggle
            key={key}
            checked={getToggle(key)}
            onChange={(v) => setToggle(key, v)}
            label={label}
            disabled={allDisabled}
          />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Action row */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={handleTest}
          disabled={testState === "sending"}
          className="bg-surface-3 text-gray-300 hover:bg-surface-3/80 px-4 py-2 rounded-lg text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {testState === "sending" && <Loader2 className="w-3 h-3 animate-spin" />}
          {testState === "ok" && <Check className="w-3 h-3 text-emerald-400" />}
          {testState === "error" ? "Send failed" : testState === "ok" ? "Sent!" : "Send Test"}
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : saved ? (
            <Check className="w-3 h-3" />
          ) : null}
          {saved ? "Saved!" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
