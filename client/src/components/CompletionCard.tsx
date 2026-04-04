import { CheckCircle } from "lucide-react";

export function CompletionCard({ content }: { content: string }) {
  return (
    <div className="mx-4 my-1 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
      <div className="flex items-start gap-2">
        <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-emerald-300">
          {content}
        </pre>
      </div>
    </div>
  );
}
