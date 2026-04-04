import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, Clock, FolderOpen, Cpu, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import { AgentCard } from "../components/AgentCard";
import { SessionStatusBadge, AgentStatusBadge } from "../components/StatusBadge";
import { formatDateTime, formatDuration, timeAgo } from "../lib/format";
import type { Session, Agent, DashboardEvent, SessionStatus } from "../lib/types";

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await api.sessions.get(id);
      setSession(data.session);
      setAgents(data.agents);
      setEvents(data.events);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (
        msg.type === "agent_created" ||
        msg.type === "agent_updated" ||
        msg.type === "session_updated" ||
        msg.type === "new_event"
      ) {
        load();
      }
    });
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">Loading session...</div>
    );
  }

  if (error || !session) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 mb-2">{error || "Session not found"}</p>
        <button onClick={() => navigate("/sessions")} className="btn-ghost mt-4">
          <ArrowLeft className="w-4 h-4" /> Back to Sessions
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate("/sessions")} className="btn-ghost mt-1">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-semibold text-gray-100">
              {session.name || `Session ${session.id.slice(0, 8)}`}
            </h2>
            <SessionStatusBadge status={session.status as SessionStatus} />
          </div>
          <div className="flex items-center gap-5 text-sm text-gray-500">
            <span className="flex items-center gap-1.5 font-mono text-xs">
              {session.id.slice(0, 16)}
            </span>
            {session.cwd && (
              <span className="flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" />
                {session.cwd}
              </span>
            )}
            {session.model && (
              <span className="flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" />
                {session.model}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formatDateTime(session.started_at)}
              {session.ended_at && ` - ${formatDuration(session.started_at, session.ended_at)}`}
            </span>
          </div>
        </div>
        <button onClick={load} className="btn-ghost">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Agents */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
          <Bot className="w-4 h-4" />
          Agents ({agents.length})
        </h3>
        {agents.length === 0 ? (
          <p className="text-sm text-gray-500">No agents recorded.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>

      {/* Event Timeline */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-4">Event Timeline ({events.length})</h3>
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">No events recorded.</p>
        ) : (
          <div className="card overflow-hidden">
            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {events.map((event, i) => (
                <div
                  key={event.id ?? i}
                  className="px-5 py-3 flex items-center gap-4 hover:bg-surface-4 transition-colors"
                >
                  <div className="w-16 text-[11px] text-gray-600 font-mono flex-shrink-0">
                    {timeAgo(event.created_at)}
                  </div>
                  <AgentStatusBadge
                    status={
                      event.event_type === "Stop"
                        ? "completed"
                        : event.event_type === "PreToolUse"
                          ? "working"
                          : event.event_type === "error"
                            ? "error"
                            : "connected"
                    }
                  />
                  <span className="text-sm text-gray-300 flex-1 truncate">
                    {event.summary || event.event_type}
                  </span>
                  {event.tool_name && (
                    <span className="text-[11px] px-2 py-0.5 bg-surface-2 rounded text-gray-500 font-mono">
                      {event.tool_name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
