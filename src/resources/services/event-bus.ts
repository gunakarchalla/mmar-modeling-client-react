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

export interface EventPayloads {
  // Auth / scenegroup lifecycle
  login: boolean;
  initSceneGroup: void;
  updateSceneGroup: void;

  // Tab / instance lifecycle
  tabChanged: void;
  sceneInstanceMutated: { sceneInstanceUuid: string };

  // Attribute window
  updateAttributeGui: void;
  removeAttributeGui: void;
  tableAttributeChanged: void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openReferenceDialog: any; // payload shape defined by attribute-window in P8

  // VizRep pipeline
  checkForVizRepUpdate: void;
  checkForVizRepUpdateByAttributeInstance: AttributeInstance;

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
