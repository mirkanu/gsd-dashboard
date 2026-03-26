import type {
  Agent,
  Analytics,
  CostResult,
  DashboardEvent,
  ModelPricing,
  Session,
  Stats,
} from "./types";

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

async function requestText(path: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `HTTP ${res.status}`);
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
    archive: (projectName: string) =>
      request<{ ok: boolean }>(`/gsd/projects/${encodeURIComponent(projectName)}/archive`, { method: 'POST' }),
    unarchive: (projectName: string) =>
      request<{ ok: boolean }>(`/gsd/projects/${encodeURIComponent(projectName)}/unarchive`, { method: 'POST' }),
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
    window: () =>
      request<{
        daily: { cost: number; from: string; hours_until_reset: number };
        weekly: { cost: number; from: string; hours_until_reset: number };
      }>("/pricing/window"),
  },
};
