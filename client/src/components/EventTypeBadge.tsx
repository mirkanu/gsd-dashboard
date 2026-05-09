export type LandmarkEventType = 'plan_complete' | 'verify_passed' | 'verify_failed' | 'waiting_input' | 'phase_complete';

const EVENT_CONFIG: Record<LandmarkEventType, { label: string; className: string }> = {
  plan_complete:  { label: 'Plan done',     className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  verify_passed:  { label: 'Verify passed', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  verify_failed:  { label: 'Verify failed', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  waiting_input:  { label: 'Waiting',       className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  phase_complete: { label: 'Phase done',    className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
};

interface EventTypeBadgeProps {
  type: LandmarkEventType;
}

export function EventTypeBadge({ type }: EventTypeBadgeProps) {
  const config = EVENT_CONFIG[type] ?? EVENT_CONFIG.plan_complete;
  return (
    <span className={`badge ${config.className}`}>
      {config.label}
    </span>
  );
}
