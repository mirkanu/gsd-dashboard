import { useState, useEffect, useCallback } from "react";
import { RefreshCw } from "lucide-react";

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

export function ServicesPage() {
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const visibleProjects = data?.projects.filter((p) => p.services.length > 0) ?? [];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">External Services</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Live status for services used across projects
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

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button
            onClick={fetchStatus}
            className="px-4 py-2 rounded-lg text-sm bg-surface-2 text-gray-300 hover:bg-surface-3 border border-border transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Projects grid */}
      {!loading && !error && (
        <div className="space-y-3">
          {visibleProjects.length === 0 && (
            <p className="text-gray-500 text-sm">No services configured.</p>
          )}
          {visibleProjects.map((project) => (
            <div
              key={project.name}
              className="bg-surface-1 border border-border rounded-lg p-4"
            >
              <h2 className="text-sm font-medium text-gray-300 mb-3 capitalize">
                {project.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                {project.services.map((svc) => (
                  <StatusPill key={svc.name} service={svc} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
