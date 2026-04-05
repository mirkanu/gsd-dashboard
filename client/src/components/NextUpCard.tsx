import { CommandChips } from "./CommandChips";

interface NextUpCardProps {
  content: string;
  onAction?: (cmd: string) => void;
}

export function NextUpCard({ content, onAction }: NextUpCardProps) {
  if (!content) return null;

  // Extract /gsd: commands from content
  const commands = Array.from(
    new Set(content.match(/\/gsd:\S+/g) || [])
  );

  // Strip backticks around commands for readability
  const displayContent = content.replace(/`(\/gsd:\S+)`/g, "$1");

  return (
    <div className="bg-surface-3 border border-accent/20 rounded-lg p-3">
      <div className="text-xs uppercase tracking-wider text-emerald-400 font-semibold mb-1">
        &#9654; Next Up
      </div>
      <div className="text-sm text-gray-300 whitespace-pre-wrap break-words">
        {displayContent}
      </div>
      {commands.length > 0 && onAction && (
        <div className="mt-2">
          <CommandChips commands={commands} onSelect={onAction} />
        </div>
      )}
    </div>
  );
}
