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
} from "lucide-react";
import { api } from "../lib/api";
import type { ProjectSettings, GsdProject } from "../lib/types";

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

const ALERT_TYPES: { key: string; label: string }[] = [
  { key: "state_change", label: "Session state changes" },
  { key: "error", label: "Error notifications" },
  { key: "completion", label: "Session completed" },
  { key: "waiting_input", label: "Waiting for input" },
];

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

  const isGlobal = selectedProject === "global";

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
    if (project === "global") {
      setSettings(null);
      return;
    }
    setSettingsLoading(true);
    try {
      const data = await api.config.getProjectSettings(project);
      setSettings(data);
    } catch {
      setSettings({
        project_key: project,
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
      const result = await api.config.saveProjectSettings(
        selectedProject,
        patch
      );
      setSettings(result.settings);
      setSettingsSaved(feedbackKey);
      setTimeout(() => setSettingsSaved(null), 2000);
    } catch {
      // Silently fail -- settings will retry on next change
    }
  };

  const handleVerbosityChange = (v: ProjectSettings["verbosity"]) => {
    if (!settings) return;
    setSettings({ ...settings, verbosity: v });
    saveSettings({ verbosity: v }, "verbosity");
  };

  const handleAlertToggle = (key: string, value: boolean) => {
    if (!settings) return;
    const newAlerts = { ...settings.telegram_alerts, [key]: value };
    setSettings({ ...settings, telegram_alerts: newAlerts });
    saveSettings({ telegram_alerts: newAlerts }, key);
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

      {/* Project Settings -- only for non-global */}
      {!isGlobal && (
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

          {/* Telegram Alerts */}
          <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Bell className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-200">
                Telegram Alerts
              </h2>
            </div>

            {settingsLoading ? (
              <SettingsSkeleton />
            ) : (
              <div className="space-y-1">
                {ALERT_TYPES.map(({ key, label }) => (
                  <div key={key} className="flex items-center">
                    <Toggle
                      checked={settings?.telegram_alerts?.[key] ?? false}
                      onChange={(v) => handleAlertToggle(key, v)}
                      label={label}
                    />
                    {settingsSaved === key && (
                      <span className="flex items-center gap-1 text-emerald-400 text-xs ml-2 flex-shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                ))}
                <p className="text-xs text-gray-600 mt-3">
                  Requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment
                  variables to be set on the server.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
