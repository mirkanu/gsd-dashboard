import { useState } from 'react';
import { Trash2, Eye, EyeOff, Plus } from 'lucide-react';

const SECRET_PATTERN = /(_KEY|_SECRET|_TOKEN|_PASSWORD|_PAT|_PASS)$/i;

export type EnvRow = {
  type: 'entry' | 'comment' | 'blank';
  key?: string;
  value?: string;
  raw: string;
  id: string;
};

interface EnvTableProps {
  rows: EnvRow[];
  onChange: (rows: EnvRow[]) => void;
}

export function EnvTable({ rows, onChange }: EnvTableProps) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  function updateRow(id: string, patch: Partial<EnvRow>) {
    onChange(
      rows.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        // Keep raw in sync for entry rows
        if (updated.type === 'entry') {
          updated.raw = `${updated.key ?? ''}=${updated.value ?? ''}`;
        }
        return updated;
      })
    );
  }

  function deleteRow(id: string) {
    onChange(rows.filter((r) => r.id !== id));
  }

  function addRow() {
    const id = crypto.randomUUID();
    onChange([...rows, { type: 'entry', key: '', value: '', raw: '', id }]);
  }

  const hasContent = rows.some(
    (r) => r.type !== 'blank' || r.raw.trim() !== ''
  );

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-xs text-gray-500 uppercase tracking-wider w-56 flex-shrink-0">
          Key
        </span>
        <span className="text-xs text-gray-500 uppercase tracking-wider flex-1">
          Value
        </span>
        <span className="w-16 flex-shrink-0" /> {/* actions column spacer */}
      </div>

      {/* Empty state */}
      {!hasContent && (
        <div className="py-8 text-center text-gray-500">
          <p className="text-sm font-medium">No variables yet</p>
          <p className="text-xs mt-1">
            This file is empty. Add your first key below.
          </p>
        </div>
      )}

      {/* Rows */}
      {rows.map((row) => {
        if (row.type === 'comment' || row.type === 'blank') {
          return (
            <div
              key={row.id}
              className="flex items-center px-1 py-1 min-h-[40px]"
            >
              <span className="text-xs font-mono text-gray-500 italic">
                {row.raw || ' '}
              </span>
            </div>
          );
        }

        const isSecret = Boolean(row.key && SECRET_PATTERN.test(row.key));
        const visible = revealed[row.id] ?? false;

        return (
          <div key={row.id} className="flex items-center gap-2">
            <input
              className="input font-mono text-xs w-56 flex-shrink-0"
              value={row.key ?? ''}
              placeholder="KEY"
              onChange={(e) => updateRow(row.id, { key: e.target.value })}
            />
            <input
              className="input font-mono text-xs flex-1"
              type={isSecret && !visible ? 'password' : 'text'}
              value={row.value ?? ''}
              placeholder="value"
              onChange={(e) => updateRow(row.id, { value: e.target.value })}
            />
            {isSecret && (
              <button
                type="button"
                title={visible ? 'Hide value' : 'Show value'}
                onClick={() =>
                  setRevealed((r) => ({ ...r, [row.id]: !r[row.id] }))
                }
                className="text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
              >
                {visible ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            )}
            {!isSecret && <span className="w-4 flex-shrink-0" />}
            <button
              type="button"
              title="Delete row"
              onClick={() => deleteRow(row.id)}
              className="text-gray-500 hover:text-red-400 transition-colors flex-shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        );
      })}

      {/* Add row */}
      <div className="pt-1">
        <button
          type="button"
          onClick={addRow}
          className="btn-ghost text-sm flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add row
        </button>
      </div>
    </div>
  );
}
