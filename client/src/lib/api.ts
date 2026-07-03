import type {
  Agent,
  Analytics,
  ClaudeMdResponse,
  CostResult,
  CostsResponse,
  CreateCostBody,
  CronJobStatus,
  DashboardEvent,
  DiskAttribution,
  DiskDetailEntry,
  DockerDf,
  GsdProject,
  GsdTask,
  MappingRule,
  ModelPricing,
  OomStatus,
  OpenRouterModel,
  ProjectSettings,
  ProjectStage,
  RunCronResult,
  SecretKey,
  Session,
  StageValidationResult,
  Stats,
  SystemStats,
  UsageHistory,
  UsageWindow,
  ZramStats,
} from "./types";

export interface NotificationPolicy {
  enabled: boolean;
  quiet_hours_from: string | null;
  quiet_hours_to: string | null;
  rate_limit_per_hour: number;
  event_toggles: Record<string, boolean>;
}

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new HttpError(body?.error || `HTTP ${res.status}`, res.status);
  }
  return res.text();
}

export const api = {
  stats: {
    get: () => request<Stats>("/stats"),
  },

  sessions: {
    list: (params?: { status?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const q = qs.toString();
      return request<{ sessions: Session[] }>(`/sessions${q ? `?${q}` : ""}`);
    },
    get: (id: string) =>
      request<{ session: Session; agents: Agent[]; events: DashboardEvent[] }>(
        `/sessions/${encodeURIComponent(id)}`
      ),
  },

  agents: {
    list: (params?: { status?: string; session_id?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.status) qs.set("status", params.status);
      if (params?.session_id) qs.set("session_id", params.session_id);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const q = qs.toString();
      return request<{ agents: Agent[] }>(`/agents${q ? `?${q}` : ""}`);
    },
  },

  events: {
    list: (params?: { session_id?: string; limit?: number; offset?: number }) => {
      const qs = new URLSearchParams();
      if (params?.session_id) qs.set("session_id", params.session_id);
      if (params?.limit) qs.set("limit", String(params.limit));
      if (params?.offset) qs.set("offset", String(params.offset));
      const q = qs.toString();
      return request<{ events: DashboardEvent[] }>(`/events${q ? `?${q}` : ""}`);
    },
  },

  analytics: {
    get: () => request<Analytics>("/analytics"),
  },

  settings: {
    info: () =>
      request<{
        db: { path: string; size: number; counts: Record<string, number> };
        hooks: { installed: boolean; path: string; hooks: Record<string, boolean> };
        server: { uptime: number; node_version: string; platform: string; ws_connections: number };
      }>("/settings/info"),
    clearData: () =>
      request<{ ok: boolean; cleared: Record<string, number> }>("/settings/clear-data", {
        method: "POST",
      }),
    reimport: () =>
      request<{ ok: boolean; imported: number; skipped: number; errors: number }>(
        "/settings/reimport",
        { method: "POST" }
      ),
    reinstallHooks: () =>
      request<{ ok: boolean; hooks: { installed: boolean; hooks: Record<string, boolean> } }>(
        "/settings/reinstall-hooks",
        { method: "POST" }
      ),
    resetPricing: () =>
      request<{ ok: boolean; pricing: ModelPricing[] }>("/settings/reset-pricing", {
        method: "POST",
      }),
    exportData: () => `${BASE}/settings/export`,
    cleanup: (params: { abandon_hours?: number; purge_days?: number }) =>
      request<{
        ok: boolean;
        abandoned: number;
        purged_sessions: number;
        purged_events: number;
        purged_agents: number;
      }>("/settings/cleanup", { method: "POST", body: JSON.stringify(params) }),
    getLLMProvider: () =>
      request<{ provider: string; config: { base_url: string | null; auth_token: string | null } }>(
        "/settings/llm-provider"
      ),
    setLLMProvider: (provider: string, model?: string) =>
      request<{ ok: true; previous: string; current: string }>("/settings/llm-provider", {
        method: "PUT",
        body: JSON.stringify({ provider, model }),
      }),
    testLLMProvider: (provider: string, model?: string) =>
      request<{ ok: boolean; latency_ms?: number; model?: string; models?: string[]; detail?: string; error?: string }>("/settings/llm-provider/test", {
        method: "POST",
        body: JSON.stringify({ provider, model }),
      }),
  },

  gsd: {
    projects: () => request<{ projects: import("./types").GsdProject[]; rateLimit: { active: boolean; resetAt: string | null } }>("/gsd/projects"),
    file: (projectName: string, fileId: "state" | "roadmap" | "requirements" | "plan") =>
      requestText(`/gsd/projects/${encodeURIComponent(projectName)}/files/${fileId}`),
    send: (projectName: string, text: string) =>
      request<{ ok: boolean }>(`/gsd/projects/${encodeURIComponent(projectName)}/send`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    wsBase: () => request<{ wsBase: string | null }>("/gsd/ws-base"),
    create: (name: string) =>
      request<{ ok: boolean; project: { name: string; root: string; tmux_session: string } }>(
        "/gsd/projects/create",
        { method: "POST", body: JSON.stringify({ name }) }
      ),
    archive: (projectName: string) =>
      request<{ ok: boolean }>(`/gsd/projects/${encodeURIComponent(projectName)}/archive`, { method: 'POST' }),
    unarchive: (projectName: string) =>
      request<{ ok: boolean }>(`/gsd/projects/${encodeURIComponent(projectName)}/unarchive`, { method: 'POST' }),
    reopenTmux: (projectName: string) =>
      request<{ ok: boolean }>(`/gsd/projects/${encodeURIComponent(projectName)}/reopen-tmux`, { method: 'POST' }),
    pauseSession: (projectName: string) =>
      request<{ ok: boolean }>(`/gsd/projects/${encodeURIComponent(projectName)}/pause-session`, { method: 'POST' }),
    killSession: (projectName: string) =>
      request<{ ok: boolean }>(`/gsd/projects/${encodeURIComponent(projectName)}/kill-session`, { method: 'POST' }),
    verify: (name: string) =>
      request<{ ok: boolean; started: boolean }>(
        `/gsd/projects/${encodeURIComponent(name)}/verify`,
        { method: 'POST' }
      ),
    stageTransition: (projectName: string, targetStage: ProjectStage) =>
      request<{ success: boolean; stage: ProjectStage; project: GsdProject }>(
        `/gsd/projects/${encodeURIComponent(projectName)}/stage`,
        { method: 'PATCH', body: JSON.stringify({ to: targetStage }) }
      ),

    validateStageTransition: (projectName: string, targetStage: ProjectStage) =>
      request<StageValidationResult>(
        `/gsd/projects/${encodeURIComponent(projectName)}/stage/validate`,
        { method: 'POST', body: JSON.stringify({ to: targetStage }) }
      ),

    migrateTasksToGithub: (projectName: string) =>
      request<{
        success: boolean;
        exported: number;
        failed: Array<{ task_id: number; error: string }>;
        snapshotPath: string;
      }>(
        `/gsd/projects/${encodeURIComponent(projectName)}/migrate`,
        { method: 'POST', body: JSON.stringify({}) }
      ),

    rollbackTaskMigration: (projectName: string) =>
      request<{ success: boolean; task_backend: 'dashboard' }>(
        `/gsd/projects/${encodeURIComponent(projectName)}/rollback-migration`,
        { method: 'POST', body: JSON.stringify({}) }
      ),

    enableStaging: (projectName: string) =>
      request<{ stagingUrl: string; stagingPort: number }>(
        `/gsd/projects/${encodeURIComponent(projectName)}/staging/enable`,
        { method: 'POST' }
      ),

    disableStaging: (projectName: string) =>
      request<{ success: boolean }>(
        `/gsd/projects/${encodeURIComponent(projectName)}/staging/disable`,
        { method: 'POST' }
      ),

    tasks: {
      list: (projectKey: string, archived = false) =>
        request<{ tasks: GsdTask[] }>(
          `/gsd/projects/${encodeURIComponent(projectKey)}/tasks${archived ? "?archived=true" : ""}`
        ),
      create: (projectKey: string, title: string, description?: string) =>
        request<GsdTask>(`/gsd/projects/${encodeURIComponent(projectKey)}/tasks`, {
          method: "POST",
          body: JSON.stringify({ title, description }),
        }),
      update: (
        projectKey: string,
        taskId: number,
        patch: { title?: string; description?: string; archived?: 0 | 1 }
      ) =>
        request<GsdTask>(`/gsd/projects/${encodeURIComponent(projectKey)}/tasks/${taskId}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      reorder: (projectKey: string, ids: number[]) =>
        request<{ ok: boolean }>(`/gsd/projects/${encodeURIComponent(projectKey)}/tasks/reorder`, {
          method: "PATCH",
          body: JSON.stringify({ ids }),
        }),
    },

  },

  autopilot: {
    start: (projectName: string, mode: 'execute' | 'plan-all' = 'execute') =>
      request<{ runId: string; status: string }>('/autopilot/start', {
        method: 'POST',
        body: JSON.stringify({ projectName, mode }),
      }),
    pause: (projectName: string) =>
      request<{ ok: boolean }>('/autopilot/pause', {
        method: 'POST',
        body: JSON.stringify({ projectName }),
      }),
    resume: (projectName: string) =>
      request<{ ok: boolean }>('/autopilot/resume', {
        method: 'POST',
        body: JSON.stringify({ projectName }),
      }),
    status: (projectName: string) =>
      request<import('./types').AutopilotRun>(`/autopilot/status/${encodeURIComponent(projectName)}`),
    planAll: (projectName: string) =>
      request<{ runId: string; status: string }>('/autopilot/plan-all', {
        method: 'POST',
        body: JSON.stringify({ projectName }),
      }),
    confirm: (projectName: string) =>
      request<{ ok: boolean }>('/autopilot/confirm', {
        method: 'POST',
        body: JSON.stringify({ projectName }),
      }),
  },

  notifications: {
    getPolicy: () =>
      request<{ policy: NotificationPolicy }>('/notifications/policy'),
    savePolicy: (policy: Partial<NotificationPolicy>) =>
      request<{ ok: boolean; policy: NotificationPolicy }>('/notifications/policy', {
        method: 'PUT',
        body: JSON.stringify(policy),
      }),
    sendTest: () =>
      request<{ ok: boolean }>('/notifications/test', { method: 'POST' }),
  },

  config: {
    getClaudeMd: (project: string) =>
      request<ClaudeMdResponse>(`/config/claude-md?project=${encodeURIComponent(project)}`),
    saveClaudeMd: (project: string, content: string) =>
      request<{ ok: boolean; path: string }>('/config/claude-md', {
        method: 'PUT',
        body: JSON.stringify({ project, content }),
      }),
    getProjectSettings: (project: string) =>
      request<ProjectSettings>(`/config/project-settings/${encodeURIComponent(project)}`),
    saveProjectSettings: (project: string, settings: Partial<ProjectSettings>) =>
      request<{ ok: boolean; settings: ProjectSettings }>(
        `/config/project-settings/${encodeURIComponent(project)}`,
        { method: 'PUT', body: JSON.stringify(settings) },
      ),
    listProjectSettings: () => request<ProjectSettings[]>('/config/project-settings'),
    applyGlobalSettings: () =>
      request<{ ok: boolean; updated: number }>('/config/project-settings/apply-global', {
        method: 'POST',
      }),
  },

  services: {
    costs: {
      get: (month?: string) =>
        request<CostsResponse>(`/services/costs${month ? `?month=${month}` : ""}`),
      create: (body: CreateCostBody) =>
        request<{ ok: true; id: string | null; manual_id: string }>(`/services/costs`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      update: (id: string, body: Partial<CreateCostBody> & { source?: string }) =>
        request<{ ok: true }>(`/services/costs/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      delete: (id: string) =>
        request<{ ok: true; deleted: number }>(`/services/costs/${encodeURIComponent(id)}`, {
          method: "DELETE",
        }),
    },
    rules: {
      list: () => request<{ rules: MappingRule[] }>(`/services/rules`),
      create: (body: Omit<MappingRule, "id" | "created_at">) =>
        request<{ id: number }>(`/services/rules`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      update: (id: number, body: Partial<Omit<MappingRule, "id" | "created_at">>) =>
        request<{ ok: true }>(`/services/rules/${id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      delete: (id: number) =>
        request<{ ok: true }>(`/services/rules/${id}`, { method: "DELETE" }),
    },
  },

  appSettings: {
    list: () => request<{ keys: SecretKey[] }>(`/app-settings`),
    get: (key: string) =>
      request<{ key: string; set: true; updated_at: string }>(
        `/app-settings/${encodeURIComponent(key)}`
      ),
    getValue: (key: string) =>
      request<{ key: string; value: string }>(
        `/app-settings/${encodeURIComponent(key)}/value`
      ),
    set: (key: string, value: string) =>
      request<{ ok: true }>(`/app-settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    delete: (key: string) =>
      request<{ ok: true }>(`/app-settings/${encodeURIComponent(key)}`, {
        method: "DELETE",
      }),
    getOpenRouterModels: async () => {
      try {
        const data = await api.appSettings.getValue("openrouter_models");
        return JSON.parse(data.value) as OpenRouterModel[];
      } catch {
        return null; // Not set yet
      }
    },
    setOpenRouterModels: (models: OpenRouterModel[]) =>
      api.appSettings.set("openrouter_models", JSON.stringify(models)),
  },

  system: {
    get: () => request<SystemStats>("/system"),
    diskDetail: () => request<DiskDetailEntry[]>("/system/disk-detail"),
    cronStatus: () => request<CronJobStatus[]>("/system/cron-status"),
    runCron: (name: string) =>
      request<RunCronResult>(`/system/run-cron/${encodeURIComponent(name)}`, {
        method: "POST",
      }),
    dockerDf: () => request<DockerDf>("/system/docker-df"),
    oomStatus: () => request<OomStatus>("/system/oom-status"),
    zram: () => request<ZramStats>("/system/zram"),
    diskAttribution: () => request<DiskAttribution>("/system/disk-attribution"),
  },

  pricing: {
    list: () => request<{ pricing: ModelPricing[] }>("/pricing"),
    upsert: (data: Omit<ModelPricing, "updated_at">) =>
      request<{ pricing: ModelPricing }>("/pricing", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (pattern: string) =>
      request<{ ok: boolean }>(`/pricing/${encodeURIComponent(pattern)}`, {
        method: "DELETE",
      }),
    totalCost: () => request<CostResult>("/pricing/cost"),
    sessionCost: (sessionId: string) =>
      request<CostResult>(`/pricing/cost/${encodeURIComponent(sessionId)}`),
    window: () => request<UsageWindow>("/pricing/window"),
    usageHistory: () => request<UsageHistory>("/pricing/usage-history"),
  },
};
