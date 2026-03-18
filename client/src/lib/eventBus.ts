import type { WSMessage } from "./types";

type Handler = (msg: WSMessage) => void;
type ConnectionHandler = (connected: boolean) => void;

const handlers = new Set<Handler>();
const connectionHandlers = new Set<ConnectionHandler>();
let wsConnected = false;

export const eventBus = {
  subscribe(handler: Handler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  },

  publish(msg: WSMessage): void {
    handlers.forEach((handler) => handler(msg));
  },

  get connected(): boolean {
    return wsConnected;
  },

  setConnected(value: boolean): void {
    wsConnected = value;
    connectionHandlers.forEach((handler) => handler(value));
  },

  onConnection(handler: ConnectionHandler): () => void {
    connectionHandlers.add(handler);
    return () => connectionHandlers.delete(handler);
  },
};
