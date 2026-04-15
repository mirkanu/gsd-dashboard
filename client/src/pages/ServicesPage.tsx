import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import type { CostEntry, CostsResponse, GsdProject } from "../lib/types";
import { CostsTable } from "../components/services/CostsTable";
import { AddCostDialog } from "../components/services/AddCostDialog";
import { NeedsReviewSection } from "../components/services/NeedsReviewSection";
import { MappingRulesSection } from "../components/services/MappingRulesSection";
import { CredentialsPanel } from "../components/services/CredentialsPanel";

interface ServiceStatus {
  name: string;
  status: "operational" | "degraded" | "outage" | "unknown";
  description: string;
}

interface ProjectServices {
  name: string;
  services: ServiceStatus[];
}

interface ServicesResponse {
  projects: ProjectServices[];
}

interface TmuxCost {
  rssGb: number;
  dailyCostUsd: number;
}

function StatusPill({ service }: { service: ServiceStatus }) {
  const configs = {
    operational: {
      dot: "bg-emerald-400",
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      label: "Operational",
    },
    degraded: {
      dot: "bg-yellow-400",
      text: "text-yellow-400",
      bg: "bg-yellow-500/10",
      label: "Degraded",
    },
    outage: {
      dot: "bg-red-400",
      text: "text-red-400",
      bg: "bg-red-500/10",
      label: "Outage",
    },
    unknown: {
      dot: "bg-gray-500",
      text: "text-gray-500",
      bg: "bg-gray-500/10",
      label: "Unknown",
    },
  };

  const cfg = configs[service.status] ?? configs.unknown;

  return (
    <div
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text} border border-current/20`}
      title={service.description}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      <span>{service.name}</span>
      <span className="opacity-70">·</span>
      <span>{cfg.label}</span>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-surface-1 border border-border rounded-lg p-4 animate-pulse h-24">
      <div className="h-4 bg-surface-2 rounded w-24 mb-3" />
      <div className="flex gap-2">
        <div className="h-6 bg-surface-2 rounded-full w-28" />
        <div className="h-6 bg-surface-2 rounded-full w-24" />
        <div className="h-6 bg-surface-2 rounded-full w-20" />
      </div>
    </div>
  );
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ServicesPage() {
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 45 state
  const [costsData, setCostsData] = useState<CostsResponse | null>(null);
  const [costsLoading, setCostsLoading] = useState(true);
  const [costsError, setCostsError] = useState<string | null>(null);
  const [costsMonth, setCostsMonth] = useState<string>(currentMonth());
  const [projects, setProjects] = useState<GsdProject[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<CostEntry | null>(null);

  // Phase 48: tmux $/day costs per project
  const [tmuxCosts, setTmuxCosts] = useState<Record<string, TmuxCost>>({});

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/services/status");
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const json: ServicesResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch service status");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCosts = useCallback(async (month: string) => {
    setCostsLoading(true);
    setCostsError(null);
    try {
      const json = await api.services.costs.get(month);
      setCostsData(json);
    } catch (err) {
      setCostsError(err instanceof Error ? err.message : "Failed to fetch costs");
    } finally {
      setCostsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    fetchCosts(costsMonth);
  }, [fetchCosts, costsMonth]);

  useEffect(() => {
    api.gsd
      .projects()
      .then(async (res) => {
        setProjects(res.projects);
        // Phase 48: fetch tmux $/day cost for each project
        const costResults = await Promise.allSettled(
          res.projects.map(async (p: GsdProject) => {
            const r = await fetch(`/api/gsd/projects/${encodeURIComponent(p.name)}/tmux-cost`);
            if (!r.ok) return null;
            return r.json();
          })
        );
        const costs: Record<string, TmuxCost> = {};
        for (const r of costResults) {
          if (r.status === 'fulfilled' && r.value?.ok) {
            costs[r.value.project] = { rssGb: r.value.rssGb, dailyCostUsd: r.value.dailyCostUsd };
          }
        }
        setTmuxCosts(costs);
      })
      .catch(() => setProjects([]));
  }, []);

  const handleAddClick = () => {
    setEditEntry(null);
    setDialogOpen(true);
  };

  const handleEdit = (entry: CostEntry) => {
    setEditEntry(entry);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this cost entry?")) return;
    try {
      await api.services.costs.delete(id);
      fetchCosts(costsMonth);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const refetchCosts = () => fetchCosts(costsMonth);

  const visibleProjects = data?.projects.filter((p) => p.services.length > 0) ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">External Services</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Live status, monthly costs, and credentials
          </p>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-surface-3 border border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh status"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Status section (Phase 40 — unchanged) */}
      {loading && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={fetchStatus}
            className="px-4 py-2 rounded-lg text-sm bg-surface-2 text-gray-300 hover:bg-surface-3 border border-border transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-3">
          {visibleProjects.length === 0 && (
            <p className="text-gray-500 text-sm">No services configured.</p>
          )}
          {visibleProjects.map((project) => {
            const cost = tmuxCosts[project.name];
            return (
              <div
                key={project.name}
                className="bg-surface-1 border border-border rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-gray-300 capitalize">
                    {project.name}
                  </h2>
                  {cost && cost.dailyCostUsd > 0 && (
                    <span className="text-xs text-orange-400 font-mono" title={`${cost.rssGb.toFixed(3)} GB RAM`}>
                      ~${cost.dailyCostUsd.toFixed(2)}/day
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {project.services.map((svc) => (
                    <StatusPill key={svc.name} service={svc} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Phase 45: Costs Table */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Monthly Costs</h2>
        {costsError ? (
          <div className="bg-surface-1 border border-red-500/30 rounded-lg p-4 text-sm text-red-400">
            {costsError}{" "}
            <button
              className="underline hover:text-red-300 ml-2"
              onClick={() => fetchCosts(costsMonth)}
            >
              Retry
            </button>
          </div>
        ) : (
          <CostsTable
            data={costsData}
            loading={costsLoading}
            month={costsMonth}
            onMonthChange={setCostsMonth}
            onAddClick={handleAddClick}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </section>

      {/* Phase 45: Needs Review */}
      {costsData && costsData.needs_review.length > 0 && (
        <section className="mt-8">
          <NeedsReviewSection
            rows={costsData.needs_review}
            projects={projects}
            onChanged={refetchCosts}
          />
        </section>
      )}

      {/* Phase 45: Mapping Rules */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Mapping Rules</h2>
        <MappingRulesSection projects={projects} />
      </section>

      {/* Phase 45: Credentials */}
      <section className="mt-8 mb-12">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Credentials</h2>
        <CredentialsPanel />
      </section>

      <AddCostDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={refetchCosts}
        projects={projects}
        entry={editEntry}
      />
    </div>
  );
}
