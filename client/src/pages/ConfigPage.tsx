import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  Volume2,
  Bell,
  Wrench,
  Save,
  Check,
  AlertCircle,
  Loader2,
  Timer,
} from "lucide-react";
import { api } from "../lib/api";
import type { ProjectSettings, GsdProject } from "../lib/types";
import { NotificationPolicyPanel } from "../components/NotificationPolicyPanel";

// ─── Skeleton components ─────────────────────────────────────────────────────

function TextAreaSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-4 w-48 bg-surface-3 rounded" />
      <div className="h-[320px] bg-surface-3 rounded-lg" />
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-4 w-32 bg-surface-3 rounded" />
      <div className="h-10 w-48 bg-surface-3 rounded-lg" />
      <div className="h-4 w-40 bg-surface-3 rounded mt-6" />
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-8 bg-surface-3 rounded" />
        ))}
      </div>
    </div>
  );
}

// ─── Toggle switch ───────────────────────────────────────────────────────────

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

// ─── Alert type definitions ──────────────────────────────────────────────────

// ─── Main component ─────────────────────────────────────────────────────────

export function ConfigPage() {
  // Project list
  const [projects, setProjects] = useState<GsdProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("global");
  const [loadingProjects, setLoadingProjects] = useState(true);

  // CLAUDE.md editor
  const [mdContent, setMdContent] = useState("");
  const [mdPath, setMdPath] = useState("");
  const [mdDirty, setMdDirty] = useState(false);
  const [mdLoading, setMdLoading] = useState(false);
  const [mdError, setMdError] = useState<string | null>(null);
  const [mdNotFound, setMdNotFound] = useState(false);
  const [mdSaving, setMdSaving] = useState(false);
  const [mdSaved, setMdSaved] = useState(false);

  // Project settings
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState<string | null>(null);

  // Apply-to-all confirmation dialog (Global tab only)
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  // Idle Auto-Close settings (Phase 48)
  const [idleThresholdMinutes, setIdleThresholdMinutes] = useState<number>(120);
  const [ramRate, setRamRate] = useState<number>(10.0);
  const [idleEnabled, setIdleEnabled] = useState<boolean>(true);
  const [idleSaving, setIdleSaving] = useState<boolean>(false);
  const [idleSaved, setIdleSaved] = useState<boolean>(false);

  const isGlobal = selectedProject === "global";

  // The reserved DB key for global defaults — distinct from the UI tab id "global"
  const GLOBAL_KEY = "__global__";
  const settingsProjectKey = isGlobal ? GLOBAL_KEY : selectedProject;

  // ─── Load projects ───────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    api.gsd
      .projects()
      .then(({ projects: p }) => {
        if (!cancelled) {
          setProjects(p.filter((proj) => !proj.name.startsWith(".")));
          setLoadingProjects(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadingProjects(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Hydrate Idle Auto-Close settings from the server on mount ───────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [idleResp, ramResp] = await Promise.allSettled([
          api.appSettings.getValue("idle_timeout_minutes"),
          api.appSettings.getValue("railway_ram_rate_monthly"),
        ]);
        if (cancelled) return;
        if (idleResp.status === "fulfilled") {
          const mins = parseInt(idleResp.value.value, 10);
          if (!isNaN(mins)) {
            if (mins === 0) {
              setIdleEnabled(false);
              // Keep idleThresholdMinutes at default 120 so re-enabling has a sane value.
            } else {
              setIdleEnabled(true);
              setIdleThresholdMinutes(mins);
            }
          }
        }
        if (ramResp.status === "fulfilled") {
          const rate = parseFloat(ramResp.value.value);
          if (!isNaN(rate)) setRamRate(rate);
        }
      } catch (e) {
        console.warn("Failed to hydrate idle settings", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Load CLAUDE.md when project changes ─────────────────────────────────

  const loadClaudeMd = useCallback(async (project: string) => {
    setMdLoading(true);
    setMdError(null);
    setMdNotFound(false);
    setMdDirty(false);
    setMdSaved(false);
    try {
      const data = await api.config.getClaudeMd(project);
      setMdContent(data.content);
      setMdPath(data.path);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("404") || msg.toLowerCase().includes("not found")) {
        setMdNotFound(true);
        setMdContent("");
        setMdPath("");
      } else {
        setMdError(msg);
      }
    } finally {
      setMdLoading(false);
    }
  }, []);

  // ─── Load project settings when project changes ──────────────────────────

  const loadSettings = useCallback(async (project: string) => {
    // For the "global" UI tab, load the reserved __global__ DB row.
    const apiKey = project === "global" ? GLOBAL_KEY : project;
    setSettingsLoading(true);
    try {
      const data = await api.config.getProjectSettings(apiKey);
      setSettings(data);
    } catch {
      setSettings({
        project_key: apiKey,
        verbosity: "normal",
        telegram_alerts: {},
      });
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClaudeMd(selectedProject);
    loadSettings(selectedProject);
  }, [selectedProject, loadClaudeMd, loadSettings]);

  // ─── Save CLAUDE.md ──────────────────────────────────────────────────────

  const handleSaveClaudeMd = async () => {
    setMdSaving(true);
    setMdSaved(false);
    setMdError(null);
    try {
      const result = await api.config.saveClaudeMd(selectedProject, mdContent);
      setMdPath(result.path);
      setMdDirty(false);
      setMdSaved(true);
      setMdNotFound(false);
      setTimeout(() => setMdSaved(false), 2500);
    } catch (err: unknown) {
      setMdError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setMdSaving(false);
    }
  };

  // ─── Save project settings ───────────────────────────────────────────────

  const saveSettings = async (
    patch: Partial<ProjectSettings>,
    feedbackKey: string
  ) => {
    if (!settings) return;
    try {
      // Build the merged payload so PUT carries both fields (server validates both).
      const merged: Partial<ProjectSettings> = {
        verbosity: patch.verbosity ?? settings.verbosity,
        telegram_alerts:
          patch.telegram_alerts ?? settings.telegram_alerts ?? {},
        suppress_context_reask: patch.suppress_context_reask ?? settings.suppress_context_reask,
        suppress_plan_ceremony: patch.suppress_plan_ceremony ?? settings.suppress_plan_ceremony,
      };
      const result = await api.config.saveProjectSettings(
        settingsProjectKey,
        merged
      );
      setSettings(result.settings);
      setSettingsSaved(feedbackKey);
      setTimeout(() => setSettingsSaved(null), 2000);

      // On the Global tab, prompt to apply to all existing projects after save.
      if (isGlobal) {
        // Coalesce: if dialog is already open, just leave it open with the new
        // values already saved as the new global defaults.
        setApplyDialogOpen(true);
      }
    } catch {
      // Silently fail -- settings will retry on next change
    }
  };

  const handleApplyToAll = async () => {
    setApplying(true);
    setApplyResult(null);
    try {
      const res = await api.config.applyGlobalSettings();
      setApplyResult(`Applied to ${res.updated} projects`);
      setTimeout(() => setApplyResult(null), 3000);
      setApplyDialogOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to apply";
      setApplyResult(msg);
      setTimeout(() => setApplyResult(null), 4000);
    } finally {
      setApplying(false);
    }
  };

  const handleCancelApply = () => {
    setApplyDialogOpen(false);
  };

  // ─── Idle Auto-Close helpers ─────────────────────────────────────────────

  const saveIdleSetting = async (key: string, value: string) => {
    setIdleSaving(true);
    try {
      await api.appSettings.set(key, value);
      setIdleSaved(true);
      setTimeout(() => setIdleSaved(false), 2000);
    } catch (e) {
      console.error('Failed to save idle setting', e);
    } finally {
      setIdleSaving(false);
    }
  };

  const handleIdleToggle = (enabled: boolean) => {
    setIdleEnabled(enabled);
    saveIdleSetting('idle_timeout_minutes', enabled ? idleThresholdMinutes.toString() : '0');
  };

  const handleVerbosityChange = (v: ProjectSettings["verbosity"]) => {
    if (!settings) return;
    setSettings({ ...settings, verbosity: v });
    saveSettings({ verbosity: v }, "verbosity");
  };

  const handleGsdToggle = (key: 'suppress_context_reask' | 'suppress_plan_ceremony', value: boolean) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: value });
    saveSettings({ [key]: value }, key);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
          <Wrench className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Configuration</h1>
          <p className="text-sm text-gray-500">
            CLAUDE.md editor and project settings
          </p>
        </div>
      </div>

      {/* Project Selector */}
      <div className="bg-surface-2 border border-border rounded-xl p-4">
        <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
          Project
        </label>
        {loadingProjects ? (
          <div className="h-10 w-48 bg-surface-3 rounded-lg animate-pulse" />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedProject("global")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                isGlobal
                  ? "bg-accent/20 text-accent border-accent/30"
                  : "bg-surface-3 text-gray-400 border-border hover:text-gray-200 hover:bg-surface-3/80"
              }`}
            >
              Global
            </button>
            {projects.map((p) => (
              <button
                key={p.name}
                onClick={() => setSelectedProject(p.name)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  selectedProject === p.name
                    ? "bg-accent/20 text-accent border-accent/30"
                    : "bg-surface-3 text-gray-400 border-border hover:text-gray-200 hover:bg-surface-3/80"
                }`}
              >
                {p.display_name || p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* CLAUDE.md Editor */}
      <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-200">CLAUDE.md</h2>
        </div>

        {mdLoading ? (
          <TextAreaSkeleton />
        ) : mdError ? (
          <div className="flex items-center gap-2 text-red-400 text-sm py-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{mdError}</span>
          </div>
        ) : mdNotFound ? (
          <div className="text-sm text-gray-500 py-4">
            <p>
              No CLAUDE.md found for{" "}
              <span className="text-gray-300">{selectedProject}</span>.
            </p>
            <button
              onClick={() => {
                setMdNotFound(false);
                setMdContent("# Project Instructions\n\n");
                setMdDirty(true);
              }}
              className="mt-2 text-accent hover:text-accent/80 text-sm font-medium transition-colors"
            >
              + Create one
            </button>
          </div>
        ) : (
          <>
            {mdPath && (
              <p className="text-xs text-gray-500 font-mono truncate">
                {mdPath}
              </p>
            )}
            <textarea
              value={mdContent}
              onChange={(e) => {
                setMdContent(e.target.value);
                setMdDirty(true);
                setMdSaved(false);
              }}
              spellCheck={false}
              className="w-full h-80 bg-surface-1 border border-border rounded-lg p-3 text-sm text-gray-200 font-mono resize-y focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveClaudeMd}
                disabled={!mdDirty || mdSaving}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  mdDirty && !mdSaving
                    ? "bg-accent text-white hover:bg-accent/90"
                    : "bg-surface-3 text-gray-500 cursor-not-allowed"
                }`}
              >
                {mdSaving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>
              {mdSaved && (
                <span className="flex items-center gap-1 text-emerald-400 text-sm">
                  <Check className="w-3.5 h-3.5" />
                  Saved
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Apply-to-all status pill */}
      {applyResult && (
        <div className="text-sm text-emerald-400 px-2">{applyResult}</div>
      )}

      {/* Project Settings -- shown for both global and per-project tabs */}
      {(
        <>
          {/* Verbosity */}
          <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Volume2 className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-200">
                Claude Session Verbosity
              </h2>
              {settingsSaved === "verbosity" && (
                <span className="flex items-center gap-1 text-emerald-400 text-xs ml-auto">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
            </div>

            {settingsLoading ? (
              <SettingsSkeleton />
            ) : (
              <select
                value={settings?.verbosity ?? "normal"}
                onChange={(e) =>
                  handleVerbosityChange(
                    e.target.value as ProjectSettings["verbosity"]
                  )
                }
                className="bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50"
              >
                <option value="verbose">Verbose</option>
                <option value="normal">Normal</option>
                <option value="quiet">Quiet</option>
              </select>
            )}
          </div>

          {/* GSD Verbosity Overrides */}
          <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-200">GSD Verbosity Overrides</h2>
              {(settingsSaved === 'suppress_context_reask' || settingsSaved === 'suppress_plan_ceremony') && (
                <span className="flex items-center gap-1 text-emerald-400 text-xs ml-auto">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">Per-project only. Has no effect on the Global tab.</p>

            {isGlobal ? (
              <p className="text-sm text-gray-500 italic">Select a project to configure GSD verbosity overrides.</p>
            ) : settingsLoading ? (
              <SettingsSkeleton />
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Toggle
                    checked={settings?.suppress_context_reask ?? false}
                    onChange={(v) => handleGsdToggle('suppress_context_reask', v)}
                    label="Skip CONTEXT.md re-asking when file already exists"
                  />
                  <p className="text-xs text-gray-600">When on, GSD skips the discuss-phase interview if CONTEXT.md is already present.</p>
                </div>
                <div className="space-y-1">
                  <Toggle
                    checked={settings?.suppress_plan_ceremony ?? false}
                    onChange={(v) => handleGsdToggle('suppress_plan_ceremony', v)}
                    label="Suppress plan preamble and postamble narration"
                  />
                  <p className="text-xs text-gray-600">When on, GSD omits the opening and closing narration around each plan execution.</p>
                </div>
              </div>
            )}
          </div>

          {/* Idle Auto-Close */}
          <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-200">
                Idle Auto-Close
              </h2>
              {idleSaved && (
                <span className="flex items-center gap-1 text-emerald-400 text-xs ml-auto">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              {idleSaving && (
                <Loader2 className="w-3 h-3 animate-spin text-gray-400 ml-auto" />
              )}
            </div>
            <p className="text-xs text-gray-400">
              Automatically close idle Claude sessions via /gsd-pause-work handoff.
              Set threshold to 0 to disable.
            </p>

            <Toggle
              checked={idleEnabled}
              onChange={handleIdleToggle}
              label="Auto-close idle sessions"
            />

            {idleEnabled && (
              <div className="space-y-4 pt-1">
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">
                    Idle threshold (minutes)
                    <span className="ml-1 text-gray-500">Default: 120 (2 hours)</span>
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={1}
                      value={idleThresholdMinutes}
                      onChange={(e) => setIdleThresholdMinutes(Number(e.target.value))}
                      className="w-24 bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
                    />
                    <button
                      onClick={() => saveIdleSetting('idle_timeout_minutes', idleThresholdMinutes.toString())}
                      className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors active:scale-95"
                    >
                      Save
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400">
                    Railway RAM rate ($/GB-month)
                    <span className="ml-1 text-gray-500">Default: 10.0</span>
                  </label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={ramRate}
                      onChange={(e) => setRamRate(Number(e.target.value))}
                      className="w-24 bg-surface-1 border border-border rounded px-2 py-1 text-sm text-gray-100 focus:outline-none focus:ring-1 focus:ring-accent/50"
                    />
                    <button
                      onClick={() => saveIdleSetting('railway_ram_rate_monthly', ramRate.toString())}
                      className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors active:scale-95"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Notification Policy */}
      <div className="bg-surface-2 border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bell className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-200">Notification Policy</h2>
        </div>
        <NotificationPolicyPanel />
      </div>

      {/* Apply-to-all confirmation dialog */}
      {applyDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="dialog"
          aria-modal="true"
          aria-labelledby="apply-dialog-title"
        >
          <div className="bg-surface-2 border border-border rounded-xl p-5 max-w-md w-full mx-4 shadow-2xl">
            <h3
              id="apply-dialog-title"
              className="text-base font-semibold text-gray-100 mb-2"
            >
              Apply to all existing projects?
            </h3>
            <p className="text-sm text-gray-400 mb-5">
              This will override the current verbosity settings for every
              existing project with your new global defaults.
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelApply}
                disabled={applying}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-surface-3 text-gray-300 hover:bg-surface-3/80 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyToAll}
                disabled={applying}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {applying && <Loader2 className="w-4 h-4 animate-spin" />}
                Apply to all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
