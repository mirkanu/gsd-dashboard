interface CheckpointPromptProps {
  content: string;
  metadata?: Record<string, unknown> | null;
  onAction?: (text: string) => void;
}

export function CheckpointPrompt({ content, metadata, onAction }: CheckpointPromptProps) {
  // Extract options from metadata or parse numbered lines from content
  let options: string[] = [];
  if (metadata?.options && Array.isArray(metadata.options)) {
    options = metadata.options as string[];
  } else {
    const pattern = /^\s*(\d+)[.)]\s+(.+)/gm;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      options.push(match[2].trim());
    }
  }

  return (
    <div className="mx-4 my-1 p-3 rounded-lg border border-amber-400/30 bg-amber-400/5">
      <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-amber-300">
        {content}
      </pre>
      {options.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {options.map((opt, i) => (
            <button
              key={i}
              onClick={() => onAction?.(String(i + 1))}
              className="text-left px-3 py-1.5 rounded border border-amber-400/20 bg-amber-400/5 text-sm text-amber-300 hover:bg-amber-400/10 active:scale-[0.98] transition-all"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
