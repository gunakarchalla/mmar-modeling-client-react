import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { jwtDecode } from "jwt-decode";
import { SceneInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { backendService } from "@/resources/services/backend-service";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { SYNC_URL } from "@/config";
import { clearToken } from "@/resources/services/token";
import { useCollabStore } from "@/resources/store/collabStore";
import { useSelectionStore } from "@/resources/store/selectionStore";
import {
  sceneInstanceToYDoc,
  applyYDocClassChangeToSceneInstance,
  applyYDocRelationChangeToSceneInstance,
  type YDocChangeResult,
} from "./y-mapping";
import { userColor, initials } from "./color-util";
import { collectUsers } from "./awareness-users";

/**
 * P10 port of the old `resources/collaboration/shared_doc_service.ts` (325 lines).
 * DI stripped per the established recipe: GlobalDefinition / FetchHelper /
 * EventAggregator injections become module-singleton imports (globalObject /
 * backendService / eventBus). `process.env.SYNC_URL` becomes `config.SYNC_URL`
 * (plan §3.4 pitfall 8 — never read import.meta.env outside config.ts).
 *
 * It owns one SharedSession per TAB INDEX: a Y.Doc + WebsocketProvider connected to
 * the sync server, with deep observers that fold remote changes back into the tab's
 * in-memory gds SceneInstance and THREE.Scene. Room name = the SceneInstance uuid,
 * auth = `?token=<jwt>` (verified against mmar-sync-server/src/connection.ts).
 *
 * TWO SOURCES OF TRUTH, ON PURPOSE: the SharedSession object is authoritative for
 * engine/service code (`forTab()` — the `getState()`-equivalent), and `collabStore`
 * is the one-way reactive mirror React reads (plan §3.2). Every mutation of
 * `access` / `connectionStatus` / `disconnectBanner` must patch the store too, which
 * is why those writes go through `setSessionStatus` / `setSessionAccess` /
 * `setSessionBanner` rather than assigning the fields directly.
 *
 * The constructor sets `globalObject.sharedDocServiceRef = this` — the back-reference
 * that lets the engine handlers (interaction / deletion / transform-control-events /
 * ray-helper) reach the service without importing it, exactly as the old client did
 * to break its circular DI. That assignment only happens once this module is
 * evaluated, so the import in `engine/coordinates-updater.ts` (which mirrors the old
 * file's `SharedDocService` injection) is LOAD-BEARING: it is what guarantees the ref
 * is wired before any engine code looks for it. See state.json → P10 notes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AccessLevel = "read" | "edit" | "delete";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export interface SharedSession {
  ydoc: Y.Doc;
  provider: WebsocketProvider;
  /** Shorthand for provider.awareness */
  awareness: WebsocketProvider["awareness"];
  sceneInstanceUuid: string;
  applyingRemote: boolean;
  /** Sentinel object used to tag locally-originated Y.Doc transactions. */
  localOrigin: object;
  access: AccessLevel;
  connectionStatus: ConnectionStatus;
  /** Human-readable banner shown while disconnected. Null when connected. */
  disconnectBanner: string | null;
  /** P11: awareness 'change' handler feeding collabStore.users (kept so detach can unsubscribe). */
  usersHandler?: () => void;
}

interface JwtPayload {
  uuid: string;
  username: string;
  exp?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SharedDocService {
  private sessions = new Map<number, SharedSession>();
  private globalObjectInstance = globalObject;

  constructor() {
    // Back-reference avoids circular DI import
    this.globalObjectInstance.sharedDocServiceRef = this;
    // Expose for console-driven smoke testing in development
    if (typeof window !== "undefined" && import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__sharedDocService = this;
    }
  }

  /**
   * Create (or replace) a shared session for the given tab. Populates the
   * Y.Doc from the already-loaded SceneInstance, connects to the sync server,
   * and installs deep observers.
   */
  attach(tabIndex: number, sceneInstance: SceneInstance, access: AccessLevel = "edit"): SharedSession {
    this.detach(tabIndex);

    const ydoc = new Y.Doc();
    const localOrigin: object = {};

    if (access !== "read") {
      sceneInstanceToYDoc(sceneInstance, ydoc, localOrigin);
    }

    const token = this.globalObjectInstance.accessToken;

    const provider = new WebsocketProvider(SYNC_URL, sceneInstance.uuid, ydoc, { params: { token } });

    const awareness = provider.awareness;

    // Broadcast our own user state so other clients can show our chip/cursor.
    this.setLocalUserState(awareness, access);

    const session: SharedSession = {
      ydoc,
      provider,
      awareness,
      sceneInstanceUuid: sceneInstance.uuid,
      applyingRemote: false,
      localOrigin,
      access,
      connectionStatus: "connecting",
      disconnectBanner: null,
    };

    this.installObservers(session, tabIndex);
    this.installConnectionLifecycle(session, tabIndex);

    this.sessions.set(tabIndex, session);
    // Seed the reactive mirror React reads.
    useCollabStore.getState().setTab(tabIndex, {
      status: session.connectionStatus,
      access: session.access,
      banner: session.disconnectBanner,
      users: collectUsers(awareness),
    });
    this.installAwarenessUsers(session, tabIndex);
    return session;
  }

  /** Destroy the session for the given tab (no-op if none). */
  detach(tabIndex: number): void {
    const session = this.sessions.get(tabIndex);
    if (session) {
      // provider.destroy() only unsubscribes y-websocket's OWN awareness handler, so
      // ours has to come off explicitly (verified in y-websocket/src/y-websocket.js).
      if (session.usersHandler) session.awareness.off("change", session.usersHandler);
      session.provider.destroy();
      session.ydoc.destroy();
      this.sessions.delete(tabIndex);
      useCollabStore.getState().removeTab(tabIndex);
    }
  }

  /** Returns the active session for a tab, or null if the tab is not shared. */
  forTab(tabIndex: number): SharedSession | null {
    return this.sessions.get(tabIndex) ?? null;
  }

  // -----------------------------------------------------------------------
  // Session-field writers (session object + reactive mirror, always together)
  // -----------------------------------------------------------------------

  private setSessionStatus(tabIndex: number, session: SharedSession, status: ConnectionStatus): void {
    session.connectionStatus = status;
    useCollabStore.getState().patchTab(tabIndex, { status });
  }

  private setSessionAccess(tabIndex: number, session: SharedSession, access: AccessLevel): void {
    session.access = access;
    useCollabStore.getState().patchTab(tabIndex, { access });
  }

  private setSessionBanner(tabIndex: number, session: SharedSession, banner: string | null): void {
    session.disconnectBanner = banner;
    useCollabStore.getState().patchTab(tabIndex, { banner });
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private setLocalUserState(awareness: WebsocketProvider["awareness"], access: AccessLevel): void {
    try {
      const token = this.globalObjectInstance.accessToken;
      if (!token) return;
      const decoded = jwtDecode<JwtPayload>(token);
      awareness.setLocalState({
        user: {
          uuid: decoded.uuid,
          username: decoded.username,
          color: userColor(decoded.uuid),
          initials: initials(decoded.username),
        },
        access,
        cursor: { active: false },
        selection: { uuid: null },
      });
    } catch {
      // ignore decode errors (e.g. in test environments)
    }
  }

  /**
   * P11: keep `collabStore.tabs[tabIndex].users` in step with the session's awareness.
   * This replaces the old user-legend's 500 ms `setInterval` poll (plan §9 P11), which
   * only existed because awareness callbacks fired outside Aurelia's change-detection.
   * The store is written ONLY from this service (the one-way mirror contract, P10).
   */
  private installAwarenessUsers(session: SharedSession, tabIndex: number): void {
    const handler = () => {
      useCollabStore.getState().setUsers(tabIndex, collectUsers(session.awareness));
    };
    session.awareness.on("change", handler);
    session.usersHandler = handler;
  }

  private installObservers(session: SharedSession, tabIndex: number): void {
    const classInstancesMap = session.ydoc.getMap<Y.Map<unknown>>("class_instances");

    classInstancesMap.observeDeep((events: Y.YEvent<Y.Map<unknown>>[], transaction: Y.Transaction) => {
      // Skip events that we originated ourselves — the in-memory model was
      // already updated by the code that called applyLocalChangeToYDoc.
      if (transaction.origin === session.localOrigin) return;
      // Guard against re-entrancy
      if (session.applyingRemote) return;

      const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
      if (!tabCtx) return;

      session.applyingRemote = true;
      try {
        const aggregate: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [] };
        for (const event of events) {
          const r = applyYDocClassChangeToSceneInstance(event, tabCtx.sceneInstance, tabCtx.threeScene, this.globalObjectInstance);
          if (r.classInstanceAdded) aggregate.classInstanceAdded = true;
          aggregate.changedAttributeInstances.push(...r.changedAttributeInstances);
        }
        // Signal Three.js renderer to redraw
        this.globalObjectInstance.render = true;

        // Trigger VizRep updates for remotely-changed attribute values
        for (const ai of aggregate.changedAttributeInstances) {
          eventBus.publish("checkForVizRepUpdateByAttributeInstance", ai);
        }
        // Trigger render of newly added class instances via PersistencyHandler
        if (aggregate.classInstanceAdded) {
          eventBus.publish("remoteClassInstanceAdded", { tabIndex });
        }
        // A remote edit mutated the gds objects in place; the attribute window only
        // re-renders when selectionStore's revision changes (P8's bump() contract).
        this.notifyRemoteMutation(aggregate);
        this.notifyRemoteInstances(tabIndex, events);
      } finally {
        session.applyingRemote = false;
      }
    });

    // Observer for RelationclassInstance add / remove / attribute / line-point changes
    const relationInstancesMap = session.ydoc.getMap<Y.Map<unknown>>("relationclasses_instances");

    relationInstancesMap.observeDeep((events: Y.YEvent<Y.Map<unknown>>[], transaction: Y.Transaction) => {
      if (transaction.origin === session.localOrigin) return;
      if (session.applyingRemote) return;

      const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
      if (!tabCtx) return;

      session.applyingRemote = true;
      try {
        const aggregate: YDocChangeResult = { classInstanceAdded: false, relationInstanceAdded: false, changedAttributeInstances: [] };
        for (const event of events) {
          const r = applyYDocRelationChangeToSceneInstance(event, tabCtx.sceneInstance, tabCtx.threeScene, this.globalObjectInstance);
          if (r.relationInstanceAdded) aggregate.relationInstanceAdded = true;
          aggregate.changedAttributeInstances.push(...r.changedAttributeInstances);
        }
        this.globalObjectInstance.render = true;

        for (const ai of aggregate.changedAttributeInstances) {
          eventBus.publish("checkForVizRepUpdateByAttributeInstance", ai);
        }
        if (aggregate.relationInstanceAdded) {
          eventBus.publish("remoteRelationInstanceAdded", { tabIndex });
        }
        this.notifyRemoteMutation(aggregate);
        this.notifyRemoteInstances(tabIndex, events);
      } finally {
        session.applyingRemote = false;
      }
    });
  }

  /**
   * Name the instances a PEER just changed, for the undo history (which must hold local
   * edits only — see history-service). The uuids come straight off the Y events rather
   * than from the apply functions: the observed maps are keyed BY instance uuid, so a
   * root-level event names them in `changes.keys` (add/remove) and a nested one has the
   * uuid as the first path segment (a field of that instance changed).
   */
  private notifyRemoteInstances(tabIndex: number, events: Y.YEvent<Y.Map<unknown>>[]): void {
    const instanceUuids = new Set<string>();
    for (const event of events) {
      const path = event.path as Array<string | number>;
      if (path.length === 0) {
        (event as Y.YMapEvent<Y.Map<unknown>>).changes.keys.forEach((_change, uuid) => {
          instanceUuids.add(uuid);
        });
      } else if (typeof path[0] === "string") {
        instanceUuids.add(path[0]);
      }
    }
    if (instanceUuids.size > 0) {
      eventBus.publish("remoteSceneInstanceChanged", { tabIndex, instanceUuids: [...instanceUuids] });
    }
  }

  /**
   * REACT-ONLY ADDITION (no old-client counterpart — Aurelia dirty-checked the gds
   * objects, React does not): a remote change mutates the gds instances in place, so
   * the attribute window would keep rendering stale values. P8's contract is that
   * anything mutating the selected instance's attributes in place must bump the
   * selection store's revision (see state.json → P8 notes).
   */
  private notifyRemoteMutation(aggregate: YDocChangeResult): void {
    if (aggregate.changedAttributeInstances.length === 0) return;
    useSelectionStore.getState().bump();
  }

  private installConnectionLifecycle(session: SharedSession, tabIndex: number): void {
    let wasDisconnected = false;

    // ---- Status changes ------------------------------------------------
    session.provider.on("status", ({ status }: { status: string }) => {
      if (status === "connecting") {
        this.setSessionStatus(tabIndex, session, "connecting");
        // Banner is already set (either null on first connect, or from the
        // disconnect event that preceded this retry).
      } else if (status === "disconnected") {
        this.setSessionStatus(tabIndex, session, "disconnected");
        wasDisconnected = true;
        // Force read-only so edits are blocked while we're offline.
        this.setSessionAccess(tabIndex, session, "read");
        this.setSessionBanner(tabIndex, session, "Disconnected — reconnecting…");
        this.setLocalUserState(session.awareness, "read");
      } else if (status === "connected") {
        this.setSessionStatus(tabIndex, session, "connected");
        if (wasDisconnected) {
          wasDisconnected = false;
          // Reconnected after a drop: re-fetch authoritative state.
          void this.onReconnect(tabIndex, session).catch((err) => logger.log(`Reconnect refresh failed: ${err}`, "error"));
        } else {
          // Initial connection — just clear any transitional banner.
          this.setSessionBanner(tabIndex, session, null);
        }
      }
    });

    // ---- WebSocket close codes -----------------------------------------
    session.provider.on("connection-close", (event: CloseEvent) => {
      const code = event?.code;

      if (code === 4401) {
        // Bad / expired JWT — stop retrying and redirect to login.
        session.provider.disconnect();
        this.setSessionBanner(tabIndex, session, "Session expired. Please log in again.");
        window.alert("Your session has expired. Please log in again.");
        // The old client did localStorage.removeItem('jwtToken') directly; token.ts is
        // the single writer of that key in this port (P1), so go through it.
        clearToken();
        location.reload();
      } else if (code === 4403) {
        // Access was revoked — stop retrying and force-close the tab.
        session.provider.disconnect();
        this.setSessionBanner(tabIndex, session, "Your access to this scene was revoked.");
        eventBus.publish("sceneAccessRevoked", { tabIndex });
      } else if (code === 4500) {
        // Sync server temporarily unavailable — provider will keep retrying.
        this.setSessionStatus(tabIndex, session, "disconnected");
        wasDisconnected = true;
        this.setSessionAccess(tabIndex, session, "read");
        this.setSessionBanner(tabIndex, session, "Sync server unavailable — your changes won't be saved until reconnected.");
        this.setLocalUserState(session.awareness, "read");
      }
      // Codes 1000 (normal close) and others are handled by the status listener.
    });
  }

  /** Called once on the first 'connected' event after a 'disconnected'. */
  private async onReconnect(tabIndex: number, session: SharedSession): Promise<void> {
    try {
      // 1. Re-fetch authoritative scene state from REST.
      const freshScene = await backendService.sceneInstancesGET(session.sceneInstanceUuid);

      // 2. Update the in-memory tab context so the rest of the app sees fresh data.
      const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
      if (tabCtx && freshScene) {
        tabCtx.sceneInstance = freshScene;
      }

      // 3. Re-fetch the caller's access level (may have changed while offline).
      try {
        const me = await backendService.sceneAccessMeGET(session.sceneInstanceUuid);
        if (me?.level) {
          this.setSessionAccess(tabIndex, session, me.level);
        }
      } catch {
        // If the call fails, assume the previous access level still holds.
      }

      // 4. Broadcast our updated user state with the restored access level.
      this.setLocalUserState(session.awareness, session.access);

      // 5. Signal the scene view to rebuild the Three.js scene from the fresh data.
      eventBus.publish("sharedSceneReconnected", { tabIndex });
    } catch {
      /* keep the previous in-memory state */
    } finally {
      this.setSessionBanner(tabIndex, session, null);
    }
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration). Constructing
// it is what sets globalObject.sharedDocServiceRef — see the class docstring.
export const sharedDocService = new SharedDocService();
