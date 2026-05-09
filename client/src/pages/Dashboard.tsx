import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FolderOpen,
  Bot,
  Zap,
  DollarSign,
  Activity,
  ArrowRight,
  RefreshCw,
  GitBranch,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import { StatCard } from "../components/StatCard";
import { AgentCard } from "../components/AgentCard";
import { EmptyState } from "../components/EmptyState";
import { EventTypeBadge } from "../components/EventTypeBadge";
import { timeAgo, fmt, fmtCost } from "../lib/format";
import type { Stats, Agent, FeedEntry, WSMessage } from "../lib/types";

export function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeAgents, setActiveAgents] = useState<Agent[]>([]);
  const [totalCost, setTotalCost] = useState<number | null>(null);
  const [allSubagents, setAllSubagents] = useState<Agent[]>([]);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [feedEvents, setFeedEvents] = useState<FeedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [statsRes, workingRes, connectedRes, idleRes, costRes] = await Promise.all([
        api.stats.get(),
        api.agents.list({ status: "working", limit: 20 }),
        api.agents.list({ status: "connected", limit: 20 }),
        api.agents.list({ status: "idle", limit: 20 }),
        api.pricing.totalCost(),
      ]);
      setStats(statsRes);
      const active = [...workingRes.agents, ...connectedRes.agents, ...idleRes.agents];
      setActiveAgents(active);
      setTotalCost(costRes.total_cost);
      setError(null);

      // Fetch all subagents for each active main agent's session
      const activeSessionIds = [
        ...new Set(active.filter((a) => a.type === "main").map((a) => a.session_id)),
      ];
      const subagentResults = await Promise.all(
        activeSessionIds.map((sid) => api.agents.list({ session_id: sid, limit: 100 }))
      );
      const subs = subagentResults.flatMap((r) => r.agents).filter((a) => a.type === "subagent");
      setAllSubagents(subs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  // Fetch portfolio feed on mount
  useEffect(() => {
    fetch('/api/feed')
      .then(r => r.json())
      .then(d => setFeedEvents((d.events ?? []).slice(0, 5)))
      .catch(() => {});
  }, []);

  // Auto-expand agents with active subagents
  useEffect(() => {
    const parentsWithActive = new Set<string>();
    for (const a of allSubagents) {
      if (a.parent_agent_id && (a.status === "working" || a.status === "connected")) {
        parentsWithActive.add(a.parent_agent_id);
      }
    }
    if (parentsWithActive.size > 0) {
      setExpandedAgents((prev) => new Set([...prev, ...parentsWithActive]));
    }
  }, [allSubagents]);

  useEffect(() => {
    return eventBus.subscribe((msg: WSMessage) => {
      if (
        msg.type === "agent_created" ||
        msg.type === "agent_updated" ||
        msg.type === "session_created" ||
        msg.type === "session_updated"
      ) {
        load();
      }
      if (msg.type === "feed_event") {
        setFeedEvents(prev => [msg.data as FeedEntry, ...prev].slice(0, 5));
      }
    });
  }, [load]);

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-2">Failed to connect to server</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button onClick={load} className="btn-primary mt-4">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-100 mb-1">Dashboard</h2>
          <p className="text-sm text-gray-500">Real-time overview of Claude Code agent activity</p>
        </div>
        <button onClick={load} className="btn-ghost flex-shrink-0">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          label="Total Sessions"
          value={stats ? fmt(stats.total_sessions) : "-"}
          raw={stats ? stats.total_sessions.toLocaleString() : undefined}
          icon={FolderOpen}
          trend={stats ? `${stats.active_sessions} active` : undefined}
        />
        <StatCard
          label="Active Agents"
          value={stats?.active_agents ?? "-"}
          icon={Bot}
          accentColor="text-emerald-400"
        />
        <StatCard
          label="Active Subagents"
          value={
            allSubagents.filter((a) => a.status === "working" || a.status === "connected").length
          }
          icon={GitBranch}
          accentColor="text-violet-400"
          trend={`${allSubagents.length} total`}
        />
        <StatCard
          label="Events Today"
          value={stats ? fmt(stats.events_today) : "-"}
          raw={stats ? stats.events_today.toLocaleString() : undefined}
          icon={Zap}
          accentColor="text-yellow-400"
        />
        <StatCard
          label="Total Events"
          value={stats ? fmt(stats.total_events) : "-"}
          raw={stats ? stats.total_events.toLocaleString() : undefined}
          icon={Activity}
          accentColor="text-violet-400"
        />
        <StatCard
          label="Total Cost"
          value={totalCost !== null ? fmtCost(totalCost) : "-"}
          raw={
            totalCost !== null
              ? `$${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : undefined
          }
          icon={DollarSign}
          accentColor="text-emerald-400"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active agents */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-300">Active Agents</h3>
            <button onClick={() => navigate("/kanban")} className="btn-ghost text-xs">
              View Board <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {activeAgents.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="No active agents"
              description="Agents will appear here when a Claude Code session is running."
            />
          ) : (
            <div className="space-y-2">
              {activeAgents
                .filter((a) => a.type === "main")
                .slice(0, 5)
                .map((main) => {
                  const children = allSubagents.filter((a) => a.parent_agent_id === main.id);
                  const isExpanded = expandedAgents.has(main.id);
                  const hasChildren = children.length > 0;
                  const activeCount = children.filter(
                    (c) => c.status === "working" || c.status === "connected"
                  ).length;

                  return (
                    <div key={main.id}>
                      <div className="flex items-center gap-1">
                        {hasChildren ? (
                          <button
                            onClick={() =>
                              setExpandedAgents((prev) => {
                                const next = new Set(prev);
                                if (next.has(main.id)) next.delete(main.id);
                                else next.add(main.id);
                                return next;
                              })
                            }
                            className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        ) : (
                          <span className="flex items-center justify-center w-6">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                          </span>
                        )}
                        <div className="flex-1">
                          <AgentCard agent={main} />
                        </div>
                      </div>

                      {hasChildren && isExpanded && (
                        <div className="ml-6 mt-1 space-y-1 border-l-2 border-violet-500/20 pl-3">
                          {children.map((sub) => (
                            <div key={sub.id} className="flex items-center gap-2">
                              <GitBranch className="w-3 h-3 text-violet-400 flex-shrink-0" />
                              <div className="flex-1">
                                <AgentCard agent={sub} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {hasChildren && !isExpanded && (
                        <button
                          onClick={() => setExpandedAgents((prev) => new Set([...prev, main.id]))}
                          className="ml-7 mt-1 text-[11px] text-violet-400 hover:text-violet-300 transition-colors"
                        >
                          {children.length} subagent{children.length !== 1 ? "s" : ""}
                          {activeCount > 0 && (
                            <span className="text-emerald-400 ml-1">({activeCount} active)</span>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              {/* Show active subagents without a main agent in the active list */}
              {activeAgents
                .filter((a) => a.type === "subagent")
                .map((agent) => (
                  <div key={agent.id} className="ml-7">
                    <AgentCard agent={agent} />
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Portfolio Feed preview */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-300">Portfolio Feed</h3>
            <button onClick={() => navigate("/feed")} className="btn-ghost text-xs flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {feedEvents.length === 0 ? (
            <EmptyState icon={Activity} title="No events yet" description="Landmark events from GSD sessions will appear here." />
          ) : (
            <div className="card divide-y divide-border">
              {feedEvents.slice(0, 5).map((event) => (
                <div key={event.id} className="px-4 py-3 flex items-center gap-3 hover:bg-surface-4 transition-colors">
                  <EventTypeBadge type={event.type} />
                  <span className="text-sm text-gray-300 truncate flex-1">{event.label}</span>
                  <span className="text-[11px] text-gray-600 flex-shrink-0">{timeAgo(event.detectedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
