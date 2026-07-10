// Central runtime configuration. All services must import from here
// (never read process.env / import.meta.env directly elsewhere).

// REST API (mmar-server).
export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// WebSocket sync server (mmar-sync-server) for real-time collaboration (yjs).
export const SYNC_URL: string =
  import.meta.env.VITE_SYNC_URL ?? "ws://localhost:8060";
