import { useEffect, useState } from "react";
import { eventBus } from "../lib/eventBus";
import { api } from "../lib/api";
import type { GsdProject, AutopilotRun, AutopilotProgressEvent } from "../lib/types";

export function AutopilotControls({ project, autopilotRun }: {
  project: GsdProject;
  autopilotRun: AutopilotRun | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCommand, setPendingCommand] = useState<string | null>(null);
  const status = autopilotRun?.status ?? 'idle';

  // Seed pendingCommand from status API response (e.g. on page load)
  useEffect(() => {
    if (autopilotRun?.status === 'pending_confirmation' && autopilotRun.pendingCommand) {
      setPendingCommand(autopilotRun.pendingCommand);
    }
  }, [autopilotRun]);

  const showError = (err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Request failed';
    setError(msg);
    setTimeout(() => setError(null), 4000);
  };

  // Subscribe to autopilot_progress to capture pendingCommand label
  useEffect(() => {
    const unsub = eventBus.subscribe((msg) => {
      if (msg.type === 'autopilot_progress') {
        const evt = msg.data as AutopilotProgressEvent;
        if (evt.projectName !== project.name) return;
        if (evt.status === 'pending_confirmation' && evt.pendingCommand) {
          setPendingCommand(evt.pendingCommand);
        } else if (evt.status !== 'pending_confirmation') {
          setPendingCommand(null);
        }
      }
    });
    return unsub;
  }, [project.name]);

  const handlePlanAll = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!window.confirm(`Plan all remaining phases for "${project.name}"?`)) return;
    setBusy(true);
    try { await api.autopilot.planAll(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handleStart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    if (!window.confirm(`Start autopilot for "${project.name}"? This will plan and execute all remaining phases automatically.`)) return;
    setBusy(true);
    try {
      const result = await api.autopilot.start(project.name);
      // Optimistic update -- set status to running immediately so UI reflects it
      if (result.runId) {
        eventBus.publish({
          type: 'autopilot_progress',
          data: { projectName: project.name, runId: result.runId, status: 'started', phaseNum: null },
        } as any);
      }
    }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handlePause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await api.autopilot.pause(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handleResume = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await api.autopilot.resume(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handleConfirm = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await api.autopilot.confirm(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try { await api.autopilot.pause(project.name); }
    catch (err) { showError(err); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {/* Plan All -- visible when idle/completed/failed/queue_timeout */}
      {(status === 'idle' || status === 'completed' || status === 'failed' || status === 'queue_timeout') ? (
        <button
          onClick={handlePlanAll}
          disabled={busy}
          className="text-[10px] px-2 py-1 rounded border border-border text-gray-500 hover:text-accent hover:border-accent/30 transition-colors disabled:opacity-40"
        >
          Plan All
        </button>
      ) : null}

      {/* Run Autopilot / Pause / Resume / Confirmation UI */}
      {(status === 'idle' || status === 'completed' || status === 'failed' || status === 'queue_timeout') ? (
        <button
          onClick={handleStart}
          disabled={busy}
          className="text-[10px] px-2 py-1 rounded border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
        >
          {busy ? 'Starting...' : 'Run Autopilot'}
        </button>
      ) : status === 'pending_confirmation' ? (
        <div className="w-full flex flex-col gap-1.5 py-1">
          <p className="text-[10px] text-gray-400">
            Ready to send: <span className="font-mono text-accent">{pendingCommand ?? '/gsd:execute-phase'}</span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={busy}
              className="text-[10px] px-2.5 py-1 rounded border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
            >
              {busy ? '...' : 'Confirm'}
            </button>
            <button
              onClick={handleCancel}
              disabled={busy}
              className="text-[10px] px-2.5 py-1 rounded border border-border text-gray-500 hover:text-red-400 hover:border-red-500/30 transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (status === 'running' || status === 'queued') ? (
        <button
          onClick={handlePause}
          disabled={busy}
          className="text-[10px] px-2 py-1 rounded border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40"
        >
          {busy ? '...' : 'Pause'}
        </button>
      ) : status === 'paused' ? (
        <button
          onClick={handleResume}
          disabled={busy}
          className="text-[10px] px-2 py-1 rounded border border-blue-500/30 text-blue-400 hover:bg-blue-500/10 transition-colors disabled:opacity-40"
        >
          {busy ? '...' : 'Resume'}
        </button>
      ) : null}

      {/* Status indicator */}
      {status === 'running' && (
        <span className="text-[10px] text-emerald-400 animate-pulse">
          {autopilotRun?.currentPhaseNum != null ? `Phase ${autopilotRun.currentPhaseNum}...` : 'Starting...'}
        </span>
      )}
      {status === 'paused' && (
        <span className="text-[10px] text-amber-400">Paused</span>
      )}
      {status === 'halted' && (
        <span className="text-[10px] text-red-400">Circuit open</span>
      )}
      {status === 'queued' && (
        <span className="text-[10px] text-amber-400 animate-pulse">Queued -- waiting for idle...</span>
      )}
      {status === 'queue_timeout' && (
        <span className="text-[10px] text-red-400">Queue timeout -- session was busy</span>
      )}

      {error && (
        <p className="text-xs text-red-400 w-full mt-1 truncate" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}
