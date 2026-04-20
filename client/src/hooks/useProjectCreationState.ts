import { useState, useEffect } from 'react';
import type { CreationState, CreationStep } from '../components/ProjectProgressChip';
import { eventBus } from '../lib/eventBus';

// Map of projectName → CreationState
type CreationStateMap = Record<string, CreationState>;

/**
 * Module-level state so multiple component instances share the same subscription
 * without duplicate WebSocket connections. The eventBus already de-duplicates WS
 * message distribution; this map is the source of truth for creation state.
 */
const creationStates: CreationStateMap = {};
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(fn => fn());
}

/**
 * Called to set an initial (or updated) creation state for a project.
 * Also used by NewProjectDialog for optimistic card injection before
 * the first WebSocket update arrives.
 */
export function handleCreationStateMessage(msg: {
  project: string;
  current_step?: string;
  last_completed_step?: string;
  failed_at_step?: string;
  error_message?: string;
  status: 'creating' | 'working' | 'error' | 'analyzing';
}) {
  creationStates[msg.project] = {
    current_step: (msg.current_step ?? null) as CreationState['current_step'],
    last_completed_step: (msg.last_completed_step ?? null) as CreationState['last_completed_step'],
    failed_at_step: (msg.failed_at_step ?? null) as CreationState['failed_at_step'],
    error_message: msg.error_message ?? null,
    status: msg.status,
  };
  notifyListeners();
}

/**
 * Remove a project from the creation state map.
 * Called when the card transitions to working and the real project card takes over.
 */
export function clearCreationState(projectName: string) {
  delete creationStates[projectName];
  notifyListeners();
}

/**
 * Returns the creation state for a specific project name.
 * Returns null when the project is not in creation mode.
 */
export function useProjectCreationState(projectName: string): CreationState | null {
  const [state, setState] = useState<CreationState | null>(
    () => creationStates[projectName] ?? null,
  );

  useEffect(() => {
    const update = () => setState(creationStates[projectName] ?? null);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, [projectName]);

  return state;
}

/**
 * Returns all projects currently in an active creation state as [name, state] pairs.
 * Used by ChatListView to render creation cards above the regular project list.
 */
export function useActiveCreationProjects(): [string, CreationState][] {
  const [pairs, setPairs] = useState<[string, CreationState][]>(() =>
    Object.entries(creationStates) as [string, CreationState][],
  );

  useEffect(() => {
    const update = () => setPairs(Object.entries(creationStates) as [string, CreationState][]);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  return pairs;
}

/**
 * Subscribes to the eventBus and dispatches project_creation_state messages
 * into the module-level state map. This hook should be called once at the
 * app/layout level to ensure creation state updates are captured.
 */
export function useProjectCreationStateSubscriber() {
  useEffect(() => {
    // Seed from the server so mobile and other late-joining clients see
    // in-progress or failed creations they missed the live WS broadcast for.
    let cancelled = false;
    fetch('/api/projects/creations')
      .then(r => (r.ok ? r.json() : { creations: [] }))
      .then((data: { creations?: Array<{
        project_name: string;
        last_completed_step: string | null;
        current_step: string | null;
        failed_at_step: string | null;
        error_message: string | null;
      }> }) => {
        if (cancelled) return;
        (data.creations || []).forEach(row => {
          const status: CreationState['status'] = row.failed_at_step
            ? 'error'
            : row.last_completed_step === 'claude_launch'
              ? 'working'
              : 'creating';
          handleCreationStateMessage({
            project: row.project_name,
            current_step: row.current_step as CreationStep | undefined,
            last_completed_step: row.last_completed_step as CreationStep | undefined,
            failed_at_step: row.failed_at_step as CreationStep | undefined,
            error_message: row.error_message ?? undefined,
            status,
          });
        });
      })
      .catch(() => { /* non-fatal */ });

    const unsubscribe = eventBus.subscribe(msg => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = msg as any;
      if (raw.type === 'project_creation_state' && raw.data) {
        // Server broadcasts { project, step, status: running|done|failed|complete, error }.
        // Translate to the client's CreationState shape, merging with prior state
        // so earlier-completed steps are preserved across messages.
        const { project, step, status: rawStatus, error } = raw.data as {
          project: string;
          step: string;
          status: 'running' | 'done' | 'failed' | 'complete';
          error: string | null;
        };
        const prior = creationStates[project];
        let current_step: CreationStep | null = prior?.current_step ?? null;
        let last_completed_step: CreationStep | null = prior?.last_completed_step ?? null;
        let failed_at_step: CreationStep | null = prior?.failed_at_step ?? null;
        let error_message: string | null = prior?.error_message ?? null;
        let status: CreationState['status'] = prior?.status ?? 'creating';

        if (rawStatus === 'running') {
          current_step = step as CreationStep;
          status = 'creating';
        } else if (rawStatus === 'done') {
          last_completed_step = step as CreationStep;
          current_step = null;
          status = 'creating';
        } else if (rawStatus === 'failed') {
          failed_at_step = step as CreationStep;
          current_step = null;
          error_message = error;
          status = 'error';
        } else if (rawStatus === 'complete') {
          current_step = null;
          status = 'working';
        }

        handleCreationStateMessage({
          project,
          current_step: current_step ?? undefined,
          last_completed_step: last_completed_step ?? undefined,
          failed_at_step: failed_at_step ?? undefined,
          error_message: error_message ?? undefined,
          status,
        });
      }
    });
    return () => { cancelled = true; unsubscribe(); };
  }, []);
}
