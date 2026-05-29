// ─── Phase 45: Services Cost Tracking Types ──────────────────────────────────

export type CostSource = 'manual' | 'email' | 'recurring' | 'unparsed' | 'api';

export interface CostEntry {
  id: string;
  service: string;
  cost_usd: number;
  currency: string;
  project_key: string | null;
  source: CostSource;
  description: string;
  checked_at: string;
  message_id: string | null;
  notes: string | null;
}

export interface ServiceRollup {
  service: string;
  total_usd: number;
  source_breakdown: Record<string, number>;
}

export interface ProjectRollup {
  project_key: string | null;
  total_usd: number;
  services: Array<{ service: string; total_usd: number }>;
}

export interface NeedsReviewRow {
  id: string;
  service: string;
  cost_usd: number;
  raw_body: string | null;
  checked_at: string;
}

export interface CostsResponse {
  month: string;
  services: ServiceRollup[];
  projects: ProjectRollup[];
  needs_review: NeedsReviewRow[];
  entries: CostEntry[];
}

export interface CreateCostBody {
  service: string;
  project_key?: string | null;
  cost_usd: number;
  currency?: string;
  start_date?: string;
  recurring_monthly?: boolean;
  notes?: string;
  description?: string;
}

export interface MappingRule {
  id: number;
  pattern_type: 'sender' | 'subject_contains';
  pattern_value: string;
  project_key: string;
  service: string | null;
  created_at: string;
}

export interface SecretKey {
  key: string;
  updated_at: string;
  set: true;
}

// ─── GSD Types ────────────────────────────────────────────────────────────────

export type SessionState = "working" | "waiting" | "paused" | "archived";

export type ProjectStage = "draft" | "alpha" | "beta" | "launched" | "maintenance" | "retired";

/** Gate result from POST /stage/validate */
export interface GateResult {
  gate: string;
  label: string;
  pass: boolean;
}

/** Response from POST /stage/validate */
export interface StageValidationResult {
  valid: boolean;
  blocked?: boolean;
  reason?: string;
  hardGates: GateResult[];
  softGates: GateResult[];
  requiresProvisioning: string[];
}

export interface GsdPhase {
  name: string;
  plans_done: number | null;
  plans_total: number | null;
  status: string;
}

export interface GsdProgress {
  percent: number | null;
  completed_phases: number | null;
  total_phases: number | null;
  completed_plans: number | null;
  total_plans: number | null;
}

export interface GsdState {
  milestone: string | null;
  milestone_name: string | null;
  status: string | null;
  current_phase: string | null;
  last_activity: string | null;
  next_action: string | null;
  progress: GsdProgress;
  blockers: string[];
}

export interface GsdRequirements {
  total: number;
  checked: number;
  percent: number;
}

export interface GsdProject {
  name: string;
  root: string;
  display_name: string | null;
  state: GsdState | null;
  roadmap: { phases: GsdPhase[] } | null;
  requirements: GsdRequirements | null;
  version: string | null;
  liveUrl: string | null;
  velocity: number;
  streak: number;
  estimatedCompletion: string | null;
  tmuxActive: boolean;
  tmuxSession: string | null;
  contextTokens: number | null;
  sessionUpdatedAt: string | null;
  sessionState: SessionState;
  statusText: string | null;
  sessionCost: number | null;
  stateEnteredAt: string | null;
  currentTask: string | null;
  /**
   * Phase 49: present only when the tmux session is waiting on in-flight
   * background work (Bash run_in_background, Agent/Task, ScheduleWakeup).
   * Absence/undefined means no active markers.
   */
  busy_markers?: BusyMarkers;
  /**
   * Phase 53: verifyState is set when the verifyOrchestrator is active for this project.
   * Absence/undefined means no verify run is in progress or it passed.
   */
  verifyState?: 'verifying' | 'verify-passed' | 'verify-failed';
  /** Plain-English summary of why verification failed. Null when verifyState is not 'verify-failed'. */
  verifyFailureSummary?: string | null;
  /** Phase 58: project maturity stage. Undefined on older projects until backfill chip is used. */
  stage?: ProjectStage;
  /** ISO timestamp of last stage transition. */
  stageUpdatedAt?: string | null;
  /** Phase 58: true if a stage nudge has been dismissed for this project. */
  stageNudgeDismissed?: boolean;
  /** Phase 59: task backend source ('dashboard' or 'github'). Defaults to 'dashboard'. */
  task_backend?: 'dashboard' | 'github';
  /** Phase 59: GitHub repository URL (e.g. 'https://github.com/owner/repo'). Set after successful migration. */
  github_repo?: string | null;
  /** Phase 59: ISO timestamp of task migration to GitHub. Null until migrated. */
  taskMigratedAt?: string | null;
}

export interface BusyMarkers {
  count: number;
  kinds: Array<'bash_bg' | 'agent' | 'wakeup'>;
}

export interface ProjectStateChangeEvent {
  project: string;
  sessionState: SessionState;
  statusText: string | null;
  currentTask: string | null;
  stateEnteredAt: string;
  /** Phase 49: omitted by server when count===0 (absence = clear). */
  busy_markers?: BusyMarkers;
  /** Phase 53: verifyState omitted by server when verify is not active (absence = clear). */
  verifyState?: 'verifying' | 'verify-passed' | 'verify-failed';
  verifyFailureSummary?: string | null;
}

export interface UsageDay {
  date: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface UsageHistory {
  days: UsageDay[];
}

export interface ModelBreakdownEntry {
  model: string;
  model_pattern: string | null;
  display_name: string;
  cost: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface UsageWindow {
  daily: {
    cost: number;
    from: string;
    hours_until_reset: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    by_model: ModelBreakdownEntry[];
  };
  weekly: {
    cost: number;
    from: string;
    hours_until_reset: number;
    by_project?: Array<{ cwd: string; cost: number }>;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    by_model: ModelBreakdownEntry[];
  };
}

export interface GsdTask {
  id: number;
  project_key: string;
  title: string;
  description: string | null;
  archived: 0 | 1;
  created_at: string;
  sort_order?: number;
}

export type AutopilotRunStatus = 'running' | 'paused' | 'completed' | 'failed' | 'idle' | 'halted' | 'pending_confirmation' | 'queued' | 'queue_timeout';

export interface AutopilotRun {
  runId: string | null;
  status: AutopilotRunStatus;
  currentPhaseNum: number | null;
  projectName: string;
  pendingCommand?: string | null;
}

export interface AutopilotProgressEvent {
  projectName: string;
  phaseNum: number;
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'halted' | 'pending_confirmation' | 'queued' | 'queue_timeout' | 'started' | 'retrying';
  runId: string;
  pendingCommand?: string;
}

// ─── Config Types ────────────────────────────────────────────────────────────

export interface ProjectSettings {
  project_key: string;
  verbosity: 'verbose' | 'normal' | 'quiet';
  telegram_alerts: Record<string, boolean>;
  updated_at?: string;
  suppress_context_reask?: boolean;
  suppress_plan_ceremony?: boolean;
}

export interface FeedEntry {
  id: string;
  type: 'plan_complete' | 'verify_passed' | 'verify_failed' | 'waiting_input' | 'phase_complete'
      | 'stage_change' | 'stage_nudge';
  projectName: string;
  projectDisplayName: string;
  label: string;
  detectedAt: string; // ISO timestamp
}

export interface ClaudeMdResponse {
  content: string;
  path: string;
}

// ─── Agent/Session Types ──────────────────────────────────────────────────────

export type SessionStatus = "active" | "completed" | "error" | "abandoned";
export type AgentStatus = "idle" | "connected" | "working" | "completed" | "error";
export type AgentType = "main" | "subagent";

export interface Session {
  id: string;
  name: string | null;
  status: SessionStatus;
  cwd: string | null;
  model: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: string | null;
  agent_count?: number;
  last_activity?: string;
}

export interface Agent {
  id: string;
  session_id: string;
  name: string;
  type: AgentType;
  subagent_type: string | null;
  status: AgentStatus;
  task: string | null;
  current_tool: string | null;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
  parent_agent_id: string | null;
  metadata: string | null;
}

export interface DashboardEvent {
  id: number;
  session_id: string;
  agent_id: string | null;
  event_type: string;
  tool_name: string | null;
  summary: string | null;
  data: string | null;
  created_at: string;
}

export interface Stats {
  total_sessions: number;
  active_sessions: number;
  active_agents: number;
  total_agents: number;
  total_events: number;
  events_today: number;
  ws_connections: number;
  agents_by_status: Record<string, number>;
  sessions_by_status: Record<string, number>;
}

export interface Analytics {
  tokens: {
    total_input: number;
    total_output: number;
    total_cache_read: number;
    total_cache_write: number;
  };
  tool_usage: Array<{ tool_name: string; count: number }>;
  daily_events: Array<{ date: string; count: number }>;
  daily_sessions: Array<{ date: string; count: number }>;
  agent_types: Array<{ subagent_type: string; count: number }>;
  event_types: Array<{ event_type: string; count: number }>;
  avg_events_per_session: number;
  total_subagents: number;
  overview: {
    total_sessions: number;
    active_sessions: number;
    active_agents: number;
    total_agents: number;
    total_events: number;
  };
  agents_by_status: Record<string, number>;
  sessions_by_status: Record<string, number>;
}

export interface ModelPricing {
  model_pattern: string;
  display_name: string;
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_per_mtok: number;
  cache_write_per_mtok: number;
  updated_at: string;
}

export interface CostBreakdown {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost: number;
  matched_rule: string | null;
}

export interface CostResult {
  total_cost: number;
  breakdown: CostBreakdown[];
}

// ─── System Stats Types ───────────────────────────────────────────────────────

export interface SystemCpuStats {
  load1: number;
  load5: number;
  load15: number;
}

export interface SystemMemStats {
  total_mb: number;
  used_mb: number;
  free_mb: number;
  swap_total_mb: number;
  swap_used_mb: number;
}

export interface SystemDiskEntry {
  mount: string;
  size: string;
  used: string;
  avail: string;
  pct: string;
}

export interface SystemProcessEntry {
  user: string;
  pid: string;
  cpu: string;
  mem: string;
  command: string;
}

export interface SystemStats {
  cpu: SystemCpuStats;
  memory: SystemMemStats;
  disk: SystemDiskEntry[];
  processes: SystemProcessEntry[];
}

export interface DiskDetailEntry {
  dir: string;
  size: string | null;
  error: string | null;
}

export interface DiskWarningEvent {
  pct: number;
  level: "warning" | "critical" | "clear";
}

export interface CronJobStatus {
  name: string;
  schedule: string;
  lastRun: string | null;
  lastOutput: string | null;
  running: boolean;
}

export interface RunCronResult {
  ok: boolean;
  output: string;
  exitCode: number;
  error?: string;
}

export interface WSMessage {
  type:
    | "session_created"
    | "session_updated"
    | "agent_created"
    | "agent_updated"
    | "new_event"
    | "autopilot_progress"
    | "project_state_change"
    | "system:disk-warning"
    | "feed_event"
    | "project_stage_change";
  data: Session | Agent | DashboardEvent | AutopilotProgressEvent | ProjectStateChangeEvent | DiskWarningEvent | FeedEntry;
  timestamp: string;
}

export const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; bg: string; dot: string }
> = {
  idle: {
    label: "Idle",
    color: "text-gray-400",
    bg: "bg-gray-500/10 border-gray-500/20",
    dot: "bg-gray-400",
  },
  connected: {
    label: "Connected",
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20",
    dot: "bg-blue-400",
  },
  working: {
    label: "Working",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    dot: "bg-emerald-400",
  },
  completed: {
    label: "Completed",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
    dot: "bg-violet-400",
  },
  error: {
    label: "Error",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    dot: "bg-red-400",
  },
};

export const SESSION_STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; color: string; bg: string }
> = {
  active: {
    label: "Active",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  completed: {
    label: "Completed",
    color: "text-violet-400",
    bg: "bg-violet-500/10 border-violet-500/20",
  },
  error: { label: "Error", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  abandoned: {
    label: "Abandoned",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10 border-yellow-500/20",
  },
};
