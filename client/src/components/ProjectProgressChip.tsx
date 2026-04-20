import { CheckCircle, Loader2 } from 'lucide-react';

export const CREATION_STEPS = [
  'scaffold',
  'git_init',
  'gsd_install',
  'github_create',
  'git_push',
  'tmux_start',
  'claude_launch',
] as const;

export type CreationStep = typeof CREATION_STEPS[number];

export interface CreationState {
  current_step: CreationStep | null;
  last_completed_step: CreationStep | null;
  failed_at_step: CreationStep | null;
  error_message: string | null;
  status: 'creating' | 'working' | 'error' | 'analyzing';
}

const STEP_LABELS: Record<CreationStep, string> = {
  scaffold: 'Creating folder',
  git_init: 'Initializing git',
  gsd_install: 'Installing GSD',
  github_create: 'Creating repo',
  git_push: 'Pushing to GitHub',
  tmux_start: 'Starting tmux',
  claude_launch: 'Launching Claude',
};

interface ProjectProgressChipProps {
  step: CreationStep;
  state: CreationState;
}

export function ProjectProgressChip({ step, state }: ProjectProgressChipProps) {
  const stepIndex = CREATION_STEPS.indexOf(step);
  const currentIndex = state.current_step ? CREATION_STEPS.indexOf(state.current_step) : -1;
  const completedIndex = state.last_completed_step ? CREATION_STEPS.indexOf(state.last_completed_step) : -1;
  const failedIndex = state.failed_at_step ? CREATION_STEPS.indexOf(state.failed_at_step) : -1;

  const isDone = completedIndex >= stepIndex;
  const isFailed = failedIndex === stepIndex;
  const isCurrent = !isFailed && currentIndex === stepIndex;
  const isPending = !isDone && !isFailed && !isCurrent;

  return (
    <div
      className={[
        'flex items-center gap-2 text-xs py-1 px-2 rounded',
        isDone ? 'bg-green-500/10 text-green-400' :
        isFailed ? 'bg-red-500/10 text-red-400' :
        isCurrent ? 'bg-indigo-500/15 text-indigo-200' :
        'bg-gray-500/10 text-gray-500',
      ].join(' ')}
      aria-current={isCurrent ? 'step' : undefined}
      aria-label={`${STEP_LABELS[step]}, step ${stepIndex + 1} of ${CREATION_STEPS.length}`}
    >
      {isDone && <CheckCircle className="w-3 h-3 shrink-0" />}
      {isFailed && <span className="w-3 h-3 shrink-0 text-red-400">✗</span>}
      {isCurrent && <Loader2 className="w-3 h-3 shrink-0 animate-spin" />}
      {isPending && <div className="w-3 h-3 shrink-0 rounded-full border border-gray-500/50" />}
      <span>{STEP_LABELS[step]}</span>
    </div>
  );
}
