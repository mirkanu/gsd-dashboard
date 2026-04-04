import { useState } from "react";
import { AlertTriangle } from "lucide-react";

export function ErrorCard({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines = content.split("\n");
  const collapsible = lines.length > 3;

  return (
    <div className="mx-4 my-1 p-3 rounded-lg border border-red-500/30 bg-red-500/5">
      <div className="flex items-start gap-2">
        <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono leading-relaxed">
            {collapsible && !expanded
              ? lines.slice(0, 3).join("\n") + "\n..."
              : content}
          </pre>
          {collapsible && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
            >
              {expanded ? "Show less" : `Show all ${lines.length} lines`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
