import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileKey,
  RefreshCw,
  Save,
  Check,
  Loader2,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import { EnvTable, type EnvRow } from '../components/EnvTable';

// Add client-side stable ids to rows from the API (API rows have no id)
function withIds(rows: Omit<EnvRow, 'id'>[]): EnvRow[] {
  return rows.map((r) => ({ ...r, id: crypto.randomUUID() }));
}

// Strip ids before sending to server
function withoutIds(rows: EnvRow[]): Omit<EnvRow, 'id'>[] {
  return rows.map(({ id: _id, ...rest }) => rest);
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

export function EnvEditorPage() {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<EnvRow[]>([]); // last saved state
  const [rows, setRows] = useState<EnvRow[]>([]); // current in-memory state
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [permDenied, setPermDenied] = useState(false);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isUnsaved = JSON.stringify(rows) !== JSON.stringify(snapshot);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/env');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError((body as { message?: string }).message ?? `HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as { rows?: Omit<EnvRow, 'id'>[] };
      const loaded = withIds(data.rows ?? []);
      setSnapshot(loaded);
      setRows(loaded);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave() {
    setSaveState('saving');
    setSaveError(null);
    try {
      const res = await fetch('/api/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: withoutIds(rows) }),
      });
      if (res.status === 403) {
        setPermDenied(true);
        setSaveState('error');
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError((body as { error?: string }).error ?? `HTTP ${res.status}`);
        setSaveState('error');
        return;
      }
      // Success: update snapshot so isUnsaved becomes false
      setSnapshot(rows);
      setSaveState('success');
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setSaveState('idle'), 2500);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Network error');
      setSaveState('error');
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
          <FileKey className="w-5 h-5 text-accent" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-100">
            Global Environment
          </h1>
          <p className="text-sm text-gray-400">
            View and edit /home/services/.env.production
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        {loading ? (
          <span className="text-sm text-gray-500 font-mono">Loading…</span>
        ) : !loadError ? (
          <span className="text-xs font-mono text-gray-500">
            /home/services/.env.production
          </span>
        ) : null}

        {isUnsaved && !loading && !loadError && (
          <span className="px-2 py-0.5 rounded-full text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20">
            Unsaved changes
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="btn-ghost text-sm flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Reload
          </button>
        </div>
      </div>

      {/* Load error */}
      {loadError && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p>Could not read the env file — check server file permissions.</p>
            <button
              type="button"
              onClick={load}
              className="btn-ghost text-xs mt-2"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Write permission error */}
      {permDenied && (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <p>
            Permission denied — the server process cannot write to this file.
          </p>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 bg-surface-3 rounded" />
          ))}
        </div>
      )}

      {/* Editor card */}
      {!loading && !loadError && (
        <div className="bg-surface-2 rounded-xl border border-border p-4 space-y-4">
          <EnvTable rows={rows} onChange={setRows} />

          {/* Save bar */}
          <div className="pt-2 border-t border-border flex items-center gap-3 flex-wrap">
            {!permDenied && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saveState === 'saving' || !isUnsaved}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {saveState === 'saving' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                  </>
                ) : saveState === 'success' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />{' '}
                    <span className="text-emerald-400">Saved</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Save changes
                  </>
                )}
              </button>
            )}

            {saveState === 'error' && saveError && (
              <p className="text-xs text-red-400">
                Save failed: {saveError}. Your changes are still in the editor.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
