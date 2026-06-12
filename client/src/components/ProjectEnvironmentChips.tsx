import { ExternalLink } from 'lucide-react';
import type { GsdProject } from '../lib/types';

const STATUS_DOT: Record<string, string> = {
  running: 'bg-green-500',
  stopped: 'bg-red-500',
  unknown: 'bg-gray-400',
};

function UrlChip({ label, href, status }: { label: string; href: string; status?: string }) {
  const dotColor = STATUS_DOT[status ?? 'unknown'] ?? STATUS_DOT.unknown;
  return (
    <a
      href={href.startsWith('http') ? href : `https://${href}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent/80 hover:underline"
    >
      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
      <ExternalLink className="w-3 h-3 flex-shrink-0" />
      {label}
    </a>
  );
}

export function ProjectEnvironmentChips({ project }: { project: GsdProject }) {
  const hasProduction = Boolean(project.liveUrl);
  const hasStaging = Boolean(project.stagingEnabled && project.stagingUrl);

  if (!hasProduction && !hasStaging) return null;

  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 pl-6 mt-0.5">
      {hasProduction && (
        <UrlChip label="Production" href={project.liveUrl!} status="running" />
      )}
      {hasStaging && (
        <UrlChip label="Staging" href={project.stagingUrl!} status={project.stagingStatus} />
      )}
    </div>
  );
}
