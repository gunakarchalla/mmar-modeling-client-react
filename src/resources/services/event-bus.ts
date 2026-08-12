import type { AttributeInstance } from "@gds/models/instance/Instance_attributes.structure";

/**
 * Tiny typed event emitter replacing the Aurelia EventAggregator. It deliberately
 * exposes `.subscribe(event, cb)` / `.publish(event, payload)` with the same
 * names/shape as EventAggregator so the engine ports (P2-P5) and views barely
 * change. `.subscribe` returns a disposable `{ dispose() }` (mirroring
 * EventAggregator) so React effects can unsubscribe in their cleanup.
 *
 * IMPORTANT: never subscribe with an `async` callback — `publish()` calls each
 * listener synchronously and discards the returned promise, so a rejection would
 * vanish as an unhandled rejection. Wrap: `() => void doThing().catch(err => …)`.
 *
 * Channels are the modeling client's (plan.md §5). The `openDialog*` family from
 * the old client is intentionally dropped — those are replaced by `uiStore`
 * actions. New channels must be added here and logged in state.json
 * (`event_channels_added`).
 */

/** Payload for the file/gltf/image upload channels (see old dialog-upload-* views). */
export interface UploadEventPayload {
  attributeInstanceUuid?: string;
  fileUuid: string;
  [key: string]: unknown;
}

/** Payload for collaboration channels that target a specific open tab. */
export interface TabIndexPayload {
  tabIndex: number;
}

/**
 * Payload for `sceneAccessGranted`. A share grant succeeded for this scene; the grant
 * is keyed by scene UUID (not a tab index) because the scene may not be open — the
 * handler resolves it to an open tab itself. Mirrors the `sceneAccessRevoked` flow but
 * in the other direction (revoke closes an open tab; grant may promote one to shared).
 */
export interface SceneAccessGrantedPayload {
  sceneInstanceUuid: string;
}

/**
 * Payload for `openReferenceDialog` (P8). One reference dialog is shared by every
 * reference button, so the clicked attribute instance IS the context — that is exactly
 * what the old `attribute-window.openDialog()` published.
 */
export interface OpenReferenceDialogPayload {
  attributeInstance: AttributeInstance;
}

/**
 * Payload for `sceneInstanceMutated`. Plan §5 mandates only `sceneInstanceUuid`; the
 * modeling client's creation/deletion handlers additionally ride along the optional
 * `action`/`kind`/`instanceUuid` describing what changed, which the P12
 * SimulationWindow uses to decide whether to refresh. The extra fields are optional
 * so a bare `{ sceneInstanceUuid }` publish stays valid.
 */
export interface SceneInstanceMutatedPayload {
  sceneInstanceUuid: string;
  action?: "added" | "deleted" | string;
  kind?: "class" | "relation" | "bendpoint" | string;
  instanceUuid?: string;
}

/**
 * Payload for `historyRecord`. Engine modules must NOT import `history-service` (it
 * reaches back into the engine, whose construction order engine/index.ts owns), so they
 * announce an undo step over the bus instead. `coalesceKey` merges a run of related
 * mutations into one step; `afterTransformSync` tells the service to flush the pending
 * three.js -> gds transform writes before snapshotting (see its `recordAfterTransformSync`).
 */
export interface HistoryRecordPayload {
  label: string;
  coalesceKey?: string | null;
  afterTransformSync?: boolean;
}

/**
 * Payload for `remoteSceneInstanceChanged`. Published by SharedDocService for every
 * Y.Doc update that came from a PEER, naming the class/relation instances it touched.
 * The history service subtracts these so a collaborator's edit never becomes part of a
 * local undo step (it stays in the snapshots — it is just never replayed).
 */
export interface RemoteSceneInstanceChangedPayload {
  tabIndex: number;
  instanceUuids: string[];
}

export interface EventPayloads {
  // Auth / scenegroup lifecycle
  login: boolean;
  initSceneGroup: void;
  updateSceneGroup: void;

  // Tab / instance lifecycle
  tabChanged: void;
  sceneInstanceMutated: SceneInstanceMutatedPayload;

  // Attribute window
  updateAttributeGui: void;
  removeAttributeGui: void;
  tableAttributeChanged: void;
  /** P8 firmed up the shape P1 left as `any`: attribute-window -> reference dialog. */
  openReferenceDialog: OpenReferenceDialogPayload;

  // VizRep pipeline
  checkForVizRepUpdate: void;
  checkForVizRepUpdateByAttributeInstance: AttributeInstance;

  // Undo / redo history
  historyRecord: HistoryRecordPayload;
  remoteSceneInstanceChanged: RemoteSceneInstanceChangedPayload;

  // Keyboard
  ctrlPlusSPressed: void;

  // Uploads
  gltfUploaded: UploadEventPayload;
  imageUploaded: UploadEventPayload;
  fileUploaded: UploadEventPayload;

  // Collaboration (shared-doc -> persistency / scenegroup); wired in P10/P11
  remoteClassInstanceAdded: TabIndexPayload;
  remoteRelationInstanceAdded: TabIndexPayload;
  sharedSceneReconnected: TabIndexPayload;
  sceneAccessRevoked: TabIndexPayload;
  sceneAccessGranted: SceneAccessGrantedPayload;
}

export type EventName = keyof EventPayloads;

export interface Subscription {
  dispose(): void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Callback = (payload: any) => void;

class EventBus {
  private listeners = new Map<EventName, Set<Callback>>();

  subscribe<E extends EventName>(
    event: E,
    callback: (payload: EventPayloads[E]) => void,
  ): Subscription {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set<Callback>();
      this.listeners.set(event, set);
    }
    set.add(callback as Callback);
    return {
      dispose: () => {
        this.listeners.get(event)?.delete(callback as Callback);
      },
    };
  }

  publish<E extends EventName>(
    event: E,
    ...payload: EventPayloads[E] extends void ? [] : [EventPayloads[E]]
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // copy to a snapshot so a handler that (un)subscribes mid-dispatch is safe
    for (const cb of [...set]) {
      cb(payload[0]);
    }
  }
}

export const eventBus = new EventBus();
