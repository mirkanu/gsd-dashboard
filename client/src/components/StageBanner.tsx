export function StageBanner({ content }: { content: string }) {
  return (
    <div className="flex items-center gap-3 py-3 px-4">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs font-semibold text-accent uppercase tracking-wide">
        {content}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}
