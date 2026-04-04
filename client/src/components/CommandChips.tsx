interface CommandChipsProps {
  commands: string[];
  onSelect: (cmd: string) => void;
}

export function CommandChips({ commands, onSelect }: CommandChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-2">
      {commands.map((cmd) => (
        <button
          key={cmd}
          onClick={() => onSelect(cmd)}
          className="px-3 py-1 rounded-full border border-accent/20 bg-accent/5 text-xs text-accent hover:bg-accent/10 active:scale-[0.98] transition-all"
        >
          {cmd}
        </button>
      ))}
    </div>
  );
}
