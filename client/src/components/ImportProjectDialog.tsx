import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';

interface ImportProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (projectName: string) => void;
}

export function ImportProjectDialog({ open, onClose, onImported }: ImportProjectDialogProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [customPath, setCustomPath] = useState('');
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);
  const [pendingPath, setPendingPath] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Reset state on open
    setFolders([]);
    setSelectedFolder('');
    setCustomPath('');
    setUseCustomPath(false);
    setShowSeedConfirm(false);
    setPendingPath('');
    setSubmitting(false);
    setError(null);
    // Load unregistered candidate folders
    setLoadingFolders(true);
    fetch('/api/projects/import-candidates')
      .then(r => r.json())
      .then(data => {
        const candidates: string[] = data.candidates || [];
        setFolders(candidates);
        if (candidates.length > 0) {
          setSelectedFolder(candidates[0]);
        }
      })
      .catch(() => setFolders([]))
      .finally(() => setLoadingFolders(false));
  }, [open]);

  if (!open) return null;

  const getEffectivePath = () => (useCustomPath ? customPath.trim() : selectedFolder);

  const doImport = async (folder: string, seed: boolean) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder, seed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to import project');
        return;
      }
      // Backend may signal that seeding is needed
      if (data.needs_seeding) {
        setPendingPath(folder);
        setShowSeedConfirm(true);
        return;
      }
      const projectName = data.name || folder.split('/').pop() || folder;
      onImported(projectName);
      onClose();
    } catch {
      setError('Network error — check your connection and try again');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const folder = getEffectivePath();
    if (!folder) {
      setError('Please select a folder or enter a custom path');
      return;
    }
    await doImport(folder, false);
  };

  const handleSeedConfirm = async () => {
    setShowSeedConfirm(false);
    await doImport(pendingPath, true);
  };

  const handleSeedCancel = () => {
    setShowSeedConfirm(false);
    setPendingPath('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !submitting) {
      if (showSeedConfirm) {
        handleSeedCancel();
      } else {
        onClose();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !submitting && !showSeedConfirm && onClose()}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-project-title"
    >
      <div
        className="bg-surface-1 border border-border rounded-lg w-full max-w-[480px] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 id="import-project-title" className="text-base font-semibold text-gray-100">
            Import existing
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-1 rounded hover:bg-surface-2 text-gray-400 hover:text-gray-200 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Seeding confirmation */}
        {showSeedConfirm ? (
          <div className="px-5 py-6 space-y-4">
            <p className="text-sm text-gray-200">
              This folder isn&apos;t a GSD project yet &mdash; seed{' '}
              <span className="font-mono text-xs text-gray-400">.planning/</span> by running{' '}
              <span className="font-mono text-xs text-indigo-300">/gsd-analyse-codebase</span>?
            </p>
            <p className="text-xs text-gray-500">
              Claude will analyse your codebase and set up the planning structure automatically.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleSeedCancel}
                disabled={submitting}
                className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSeedConfirm}
                disabled={submitting}
                className="px-4 py-1.5 rounded text-sm bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm
              </button>
            </div>
          </div>
        ) : (
          /* Main import form */
          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
            {/* Folder picker */}
            <div>
              <label htmlFor="import-folder" className="block text-xs font-medium text-gray-400 mb-1">
                Folder
              </label>
              {loadingFolders ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-surface-2 border border-border rounded px-2 py-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Loading folders…
                </div>
              ) : (
                <select
                  id="import-folder"
                  value={selectedFolder}
                  onChange={e => setSelectedFolder(e.target.value)}
                  disabled={useCustomPath || submitting}
                  className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100 disabled:opacity-50"
                >
                  {folders.length === 0 ? (
                    <option value="">No unregistered folders found</option>
                  ) : (
                    folders.map(f => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))
                  )}
                </select>
              )}

              {/* Custom path toggle */}
              <div className="mt-2">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomPath}
                    onChange={e => { setUseCustomPath(e.target.checked); setError(null); }}
                    className="rounded border-border"
                  />
                  Or enter a custom path
                </label>
              </div>

              {useCustomPath && (
                <input
                  type="text"
                  value={customPath}
                  onChange={e => { setCustomPath(e.target.value); setError(null); }}
                  placeholder="/data/home/my-folder"
                  disabled={submitting}
                  className="mt-2 w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100 font-mono focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-3 py-1.5 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || (!getEffectivePath())}
                className="px-4 py-1.5 rounded text-sm bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Import
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
