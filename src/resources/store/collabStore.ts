import { create } from "zustand";

/**
 * P10 store (plan §3.2): the reactive mirror of the per-tab shared session, replacing
 * the old `user-legend`'s 500 ms `setInterval` poll and its `isVisible` /
 * `disconnectBanner` getters (which Aurelia dirty-checked every cycle).
 *
 * ONE-WAY, engine -> store: `shared-doc-service` owns the SharedSession objects and
 * writes this store whenever a session attaches/detaches or its connection status,
 * access level or banner changes. React components read it; nothing writes it back.
 * Same contract P2 established for `stateStore` and the globalStateObject.
 *
 * `users` stays empty in P10 — P11 fills it from awareness `change` events (which is
 * why it is keyed by clientId, matching the old ConnectedUser rows).
 */

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
export type AccessLevel = "read" | "edit" | "delete";

/** One row of the old user-legend's `ConnectedUser[]`. Populated in P11. */
export interface CollabUser {
  clientId: number;
  uuid: string;
  username: string;
  color: string;
  initials: string;
  isLocal: boolean;
}

export interface TabCollabState {
  status: ConnectionStatus;
  access: AccessLevel;
  /** Human-readable banner shown while disconnected. Null when connected. */
  banner: string | null;
  users: CollabUser[];
}

interface CollabState {
  /** Keyed by tab index — a tab with no entry is not shared. */
  tabs: Record<number, TabCollabState>;

  /** Create/replace the entry for a tab (shared-doc-service.attach). */
  setTab: (tabIndex: number, state: TabCollabState) => void;
  /** Patch part of a tab's entry (status / access / banner changes). No-op if absent. */
  patchTab: (tabIndex: number, patch: Partial<TabCollabState>) => void;
  /** Drop a tab's entry (shared-doc-service.detach). */
  removeTab: (tabIndex: number) => void;
  /** Replace a tab's awareness-derived user list (P11). No-op if absent. */
  setUsers: (tabIndex: number, users: CollabUser[]) => void;
  /** Read a tab's entry outside a component (the getState() form, plan §3.1). */
  getTab: (tabIndex: number) => TabCollabState | undefined;
}

export const useCollabStore = create<CollabState>((set, get) => ({
  tabs: {},

  setTab: (tabIndex, state) => set((s) => ({ tabs: { ...s.tabs, [tabIndex]: state } })),

  patchTab: (tabIndex, patch) =>
    set((s) => {
      const current = s.tabs[tabIndex];
      if (!current) return s;
      return { tabs: { ...s.tabs, [tabIndex]: { ...current, ...patch } } };
    }),

  removeTab: (tabIndex) =>
    set((s) => {
      if (!(tabIndex in s.tabs)) return s;
      const next = { ...s.tabs };
      delete next[tabIndex];
      return { tabs: next };
    }),

  setUsers: (tabIndex, users) =>
    set((s) => {
      const current = s.tabs[tabIndex];
      if (!current) return s;
      return { tabs: { ...s.tabs, [tabIndex]: { ...current, users } } };
    }),

  getTab: (tabIndex) => get().tabs[tabIndex],
}));
