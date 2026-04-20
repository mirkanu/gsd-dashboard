import { useState, useEffect, useCallback } from "react";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import type { SecretKey } from "../../lib/types";

interface CredentialDef {
  key: string;
  label: string;
  hint: string;
}

const CREDENTIALS: CredentialDef[] = [
  { key: "github_pat", label: "GitHub PAT", hint: "Personal access token from github.com → Settings → Developer settings → Tokens. Needs repo + workflow scope. Required to create projects from the Dashboard." },
  { key: "railway_pat", label: "Railway PAT", hint: "Personal access token from Railway → Account → Tokens" },
  { key: "openai_admin_key", label: "OpenAI Admin Key", hint: "Admin API key from platform.openai.com → Organization" },
  { key: "vercel_token", label: "Vercel Token", hint: "Token from vercel.com → Settings → Tokens" },
];

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "saved";
  const seconds = Math.floor((Date.now() - t) / 1000);
  if (seconds < 60) return "saved just now";
  if (seconds < 3600) return `saved ${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `saved ${Math.floor(seconds / 3600)}h ago`;
  return `saved ${Math.floor(seconds / 86400)}d ago`;
}

export function CredentialsPanel() {
  const [keys, setKeys] = useState<SecretKey[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [secretKeyMissing, setSecretKeyMissing] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const res = await api.appSettings.list();
      setKeys(res.keys);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credentials");
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const handleSave = async (key: string) => {
    if (!inputValue.trim()) return;
    setSavingKey(key);
    setError(null);
    try {
      await api.appSettings.set(key, inputValue);
      setInputValue("");
      setEditingKey(null);
      setSecretKeyMissing(false);
      await refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      // Detect server-side missing DASHBOARD_SECRET_KEY heuristically
      if (msg.toLowerCase().includes("secret") || msg.includes("500")) {
        setSecretKeyMissing(true);
      }
      setError(msg);
    } finally {
      setSavingKey(null);
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Delete the saved ${key}?`)) return;
    try {
      await api.appSettings.delete(key);
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const findKey = (k: string): SecretKey | undefined =>
    keys?.find((x) => x.key === k);

  return (
    <div className="bg-surface-1 border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-xs text-gray-400">
          Credentials are encrypted with AES-256-GCM using{" "}
          <code className="bg-surface-2 px-1 rounded">DASHBOARD_SECRET_KEY</code> and stored in
          SQLite. They survive Railway redeploys.
        </p>
      </div>

      {secretKeyMissing && (
        <div className="px-4 py-2 text-xs text-yellow-300 bg-yellow-500/10 border-b border-yellow-500/30 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>
            Server may be missing <code>DASHBOARD_SECRET_KEY</code> — check Railway env vars and PM2
            environment.
          </span>
        </div>
      )}

      {error && !secretKeyMissing && (
        <div className="px-4 py-2 text-xs text-red-400 bg-red-500/10 border-b border-red-500/30">
          {error}
        </div>
      )}

      <div className="divide-y divide-border">
        {CREDENTIALS.map((cred) => {
          const saved = findKey(cred.key);
          const editing = editingKey === cred.key;
          const isSaving = savingKey === cred.key;
          return (
            <div key={cred.key} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-gray-200 font-medium">{cred.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{cred.hint}</div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {saved ? (
                    <span className="text-xs text-emerald-300/80 font-mono">
                      •••• ({relativeTime(saved.updated_at)})
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500 italic">Not set</span>
                  )}
                  {!editing && (
                    <button
                      onClick={() => {
                        setEditingKey(cred.key);
                        setInputValue("");
                      }}
                      className="px-2 py-1 rounded text-xs text-indigo-300 hover:bg-indigo-500/10 border border-indigo-500/30"
                    >
                      {saved ? "Replace" : "Set"}
                    </button>
                  )}
                  {saved && !editing && (
                    <button
                      onClick={() => handleDelete(cred.key)}
                      className="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-surface-2"
                      title="Delete credential"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {editing && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="password"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="Paste value (will be encrypted)"
                    autoFocus
                    className="flex-1 bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100 font-mono"
                  />
                  <button
                    onClick={() => handleSave(cred.key)}
                    disabled={isSaving || !inputValue.trim()}
                    className="px-3 py-1.5 rounded text-xs bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 disabled:opacity-50 flex items-center gap-1"
                  >
                    {isSaving && <Loader2 className="w-3 h-3 animate-spin" />}
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingKey(null);
                      setInputValue("");
                    }}
                    className="px-3 py-1.5 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-surface-2"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
