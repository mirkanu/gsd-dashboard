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
    const unsubscribe = eventBus.subscribe(msg => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = msg as any;
      if (raw.type === 'project_creation_state' && raw.data) {
        handleCreationStateMessage({
          project: raw.data.project,
          current_step: raw.data.current_step as CreationStep | undefined,
          last_completed_step: raw.data.last_completed_step as CreationStep | undefined,
          failed_at_step: raw.data.failed_at_step as CreationStep | undefined,
          error_message: raw.data.error_message,
          status: raw.data.status,
        });
      }
    });
    return unsubscribe;
  }, []);
}
