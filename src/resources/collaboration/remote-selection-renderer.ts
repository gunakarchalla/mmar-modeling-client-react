import * as THREE from "three";
import { AwarenessRenderer, type RenderedEntry } from "./awareness-renderer";

/**
 * P11 port of the old `resources/collaboration/remote_selection_renderer.ts` (116 lines).
 * DI stripped: the GlobalDefinition / SharedDocService injections are inherited as
 * module singletons from {@link AwarenessRenderer}, so the constructor disappears.
 *
 * Draws a bounding box around the object each *remote* collaborator has selected, in
 * that collaborator's own colour. This is the shared-presence counterpart to the local
 * red selection box created in `engine/global-selected-object`.
 *
 * Selections travel over Yjs awareness (ephemeral presence, never persisted) under the
 * `selection` field — published by `globalSelectedObject.publishSelection`. Near-mirror
 * of {@link RemoteCursorRenderer}; shared lifecycle lives in {@link AwarenessRenderer}.
 */

interface SelectionEntry extends RenderedEntry {
  helper: THREE.BoxHelper;
  /** UUID of the mesh this box currently wraps (the selected instance). */
  targetUuid: string;
}

export class RemoteSelectionRenderer extends AwarenessRenderer<SelectionEntry> {
  /**
   * Re-fit every remote selection box to its (possibly moved) target mesh, and drop
   * boxes whose target no longer exists (e.g. deleted by another collaborator).
   *
   * Awareness changes only fire when someone *changes* their selection, not when the
   * already-selected object is dragged — so this is called from the render loop
   * (engine/animator) to keep boxes glued to objects as collaborators move them. It is
   * a cheap no-op when there are no remote selections.
   */
  refreshBoxes(): void {
    if (this.entries.size === 0) return;

    for (const [clientId, entry] of Array.from(this.entries)) {
      const scene = this.globalObjectInstance.tabContext[entry.tabIndex]?.threeScene;
      const target = scene?.getObjectByProperty("uuid", entry.targetUuid);
      if (!target) {
        // Selected object is gone (deleted remotely) — drop the orphaned box.
        this.disposeEntry(entry, scene);
        this.entries.delete(clientId);
        continue;
      }
      entry.helper.setFromObject(target);
      entry.helper.update();
    }
  }

  // -----------------------------------------------------------------------
  // AwarenessRenderer hook
  // -----------------------------------------------------------------------

  protected updateForTab(tabIndex: number): void {
    const session = this.sharedDocService.forTab(tabIndex);
    const tabCtx = this.globalObjectInstance.tabContext[tabIndex];
    if (!session || !tabCtx?.threeScene) return;
    const scene = tabCtx.threeScene;

    const localId = session.awareness.clientID;
    const states = session.awareness.getStates();

    // Remove boxes for clients that left or cleared their selection.
    for (const [clientId, entry] of Array.from(this.entries)) {
      if (entry.tabIndex !== tabIndex) continue;
      const state = states.get(clientId);
      const selectedUuid = (state?.selection as { uuid?: string | null } | undefined)?.uuid;
      if (!states.has(clientId) || !selectedUuid) {
        this.disposeEntry(entry, scene);
        this.entries.delete(clientId);
      }
    }

    // Add / update boxes for remote clients with an active selection.
    for (const [clientId, state] of Array.from(states)) {
      if (clientId === localId) continue; // skip self — we draw our own red box

      const selection = state?.selection as { uuid?: string | null } | undefined;
      const selectedUuid = selection?.uuid;
      if (!selectedUuid) continue;

      const target = scene.getObjectByProperty("uuid", selectedUuid);
      if (!target) continue; // object not present locally (not yet synced / different tab)

      const user = state?.user as { color?: string } | undefined;
      const color = user?.color ?? "red";

      let entry = this.entries.get(clientId);
      // If this client switched to a different object, rebuild the box for the new target.
      if (entry && entry.targetUuid !== selectedUuid) {
        this.disposeEntry(entry, scene);
        this.entries.delete(clientId);
        entry = undefined;
      }
      if (!entry) {
        const box = new THREE.BoxHelper(target, new THREE.Color(color).getHex());
        scene.add(box);
        entry = { helper: box, tabIndex, targetUuid: selectedUuid };
        this.entries.set(clientId, entry);
      }

      entry.helper.setFromObject(target);
      entry.helper.update();
    }

    this.globalObjectInstance.render = true;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const remoteSelectionRenderer = new RemoteSelectionRenderer();
