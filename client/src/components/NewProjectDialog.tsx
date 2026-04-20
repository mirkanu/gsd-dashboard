import { useState, useEffect, useRef } from 'react';
import { X, Loader2 } from 'lucide-react';
import { handleCreationStateMessage } from '../hooks/useProjectCreationState';

interface Pat {
  key: string;
  label: string;
}

interface NewProjectDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (projectName: string) => void;
}

function sanitizeName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [pats, setPats] = useState<Pat[]>([]);
  const [selectedPat, setSelectedPat] = useState('github_pat');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // Reset form
    setName('');
    setDescription('');
    setVisibility('private');
    setSubmitting(false);
    setError(null);
    setNameError(null);
    setSelectedPat('github_pat');
    // Load PATs for multi-PAT selector
    fetch('/api/projects/github-pats')
      .then(r => r.json())
      .then(data => {
        const loaded: Pat[] = data.pats || [];
        setPats(loaded);
        if (loaded.length > 0) {
          setSelectedPat(loaded[0].key);
        }
      })
      .catch(() => setPats([]));
    // Focus name input on open
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [open]);

  if (!open) return null;

  const sanitized = sanitizeName(name);
  const nameValid = sanitized.length > 0;

  const handleNameBlur = () => {
    if (!name.trim()) {
      setNameError('Name is required');
    } else {
      setNameError(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !submitting) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sanitized,
          description,
          template: 'blank',
          visibility,
          pat_key: selectedPat,
        }),
      });
      if (res.status === 202) {
        // Optimistic: inject initial creation state so the card appears
        // immediately in ChatListView before the first WebSocket update arrives.
        handleCreationStateMessage({
          project: sanitized,
          status: 'creating',
          current_step: 'scaffold',
        });
        onCreated(sanitized);
        onClose();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to create project');
    } catch {
      setError('Network error — check your connection and try again');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => !submitting && onClose()}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-project-title"
    >
      <div
        className="bg-surface-1 border border-border rounded-lg w-full max-w-[480px] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 id="new-project-title" className="text-base font-semibold text-gray-100">
            + New Project
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label htmlFor="new-project-name" className="block text-xs font-medium text-gray-400 mb-1">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              ref={nameInputRef}
              id="new-project-name"
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setNameError(null); }}
              onBlur={handleNameBlur}
              placeholder="my-project"
              required
              aria-describedby={nameError ? 'new-project-name-error' : undefined}
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500/50"
            />
            <p className="mt-1 text-xs text-gray-500">Lowercase, dashes, no spaces</p>
            {nameError && (
              <p id="new-project-name-error" className="mt-1 text-xs text-red-400">
                {nameError}
              </p>
            )}
            {sanitized && (
              <p className="mt-1 text-xs text-gray-600 font-mono">
                Folder: /data/home/{sanitized}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="new-project-description" className="block text-xs font-medium text-gray-400 mb-1">
              Description
            </label>
            <input
              id="new-project-description"
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this do?"
              className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100 focus:outline-none focus:border-indigo-500/50"
            />
          </div>

          {/* Template */}
          <div>
            <p className="block text-xs font-medium text-gray-400 mb-1">Template</p>
            <label className="flex items-center gap-2 text-sm text-gray-300 cursor-default">
              <input type="radio" checked readOnly className="text-indigo-500" />
              <span>Blank</span>
              <span className="text-xs text-gray-500">(only option in v5.0)</span>
            </label>
          </div>

          {/* GitHub visibility */}
          <div>
            <p className="block text-xs font-medium text-gray-400 mb-1">GitHub visibility</p>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="private"
                  checked={visibility === 'private'}
                  onChange={() => setVisibility('private')}
                  className="text-indigo-500"
                />
                Private
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                <input
                  type="radio"
                  name="visibility"
                  value="public"
                  checked={visibility === 'public'}
                  onChange={() => setVisibility('public')}
                  className="text-indigo-500"
                />
                Public
              </label>
            </div>
          </div>

          {/* GitHub account selector — only when >1 PAT configured */}
          {pats.length > 1 && (
            <div>
              <label htmlFor="new-project-pat" className="block text-xs font-medium text-gray-400 mb-1">
                GitHub account
              </label>
              <select
                id="new-project-pat"
                value={selectedPat}
                onChange={e => setSelectedPat(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded px-2 py-1.5 text-sm text-gray-100"
              >
                {pats.map(pat => (
                  <option key={pat.key} value={pat.key}>
                    {pat.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Generic error */}
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
              disabled={!nameValid || submitting}
              className="px-4 py-1.5 rounded text-sm bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-500/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
