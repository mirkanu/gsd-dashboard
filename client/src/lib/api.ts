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
  },
};
