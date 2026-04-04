import { useEffect, useState } from "react";

interface WorkingIndicatorProps {
  sessionUpdatedAt: string | null;
  contextTokens: number | null;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const CONTEXT_WINDOW = 200_000;

export function WorkingIndicator({ sessionUpdatedAt, contextTokens }: WorkingIndicatorProps) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!sessionUpdatedAt) return;

    const update = () => {
      const diff = Date.now() - new Date(sessionUpdatedAt).getTime();
      setElapsed(formatElapsed(Math.max(0, diff)));
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sessionUpdatedAt]);

  const pct = contextTokens != null ? Math.min(contextTokens / CONTEXT_WINDOW, 1) : 0;
  const hue = Math.round(120 * (1 - pct)); // green (120) -> red (0)

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/20 shrink-0">
      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      <span className="text-xs text-emerald-400">Working... {elapsed}</span>
      {contextTokens != null && (
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-16 h-2 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(pct * 100)}%`,
                backgroundColor: `hsl(${hue}, 80%, 50%)`,
              }}
            />
          </div>
          <span className="text-[10px] text-gray-500">{Math.round(pct * 100)}%</span>
        </div>
      )}
    </div>
  );
}
