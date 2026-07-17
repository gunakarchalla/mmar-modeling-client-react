import * as THREE from "three";
import { globalObject } from "@/engine/global-definition";

/**
 * Port of the old `resources/global_selected_object.ts` (DI-stripping recipe): the
 * Aurelia GlobalDefinition injection becomes the `globalObject` module singleton.
 *
 * Unlike the metamodeling twin (which commented the highlight out), the modeling
 * client uses a real red `THREE.BoxHelper` around the selected mesh — that logic is
 * ported verbatim.
 *
 * `publishSelection` broadcasts the selection over the shared session's awareness so
 * collaborators can render a presence box (RemoteSelectionRenderer draws it, P11).
 * On a tab with no shared session the guard makes it a no-op.
 */
export class GlobalSelectedObject {
  public object: THREE.Mesh = new THREE.Mesh();

  private globalObjectInstance = globalObject;

  getObject() {
    this.updateSelectionBoxHelper(this.object);
    return this.object;
  }

  setObject(object: THREE.Mesh) {
    this.removeObject();
    if (this.globalObjectInstance.boxHelper != undefined) {
      this.object = object;
      this.updateSelectionBoxHelper(object);
    } else {
      this.object = object;
      this.initSelectionBoxHelper(object);
    }
    // Broadcast the selection so collaborators see a box around the same object.
    this.publishSelection(object?.uuid ?? null);
  }

  removeObject() {
    this.object = undefined as unknown as THREE.Mesh;
    this.removeSelectionBoxHelper();
    // Tell collaborators we no longer have anything selected.
    this.publishSelection(null);
  }

  /**
   * Publish the locally-selected instance UUID over the active tab's shared-session
   * awareness so other clients can render a presence box (RemoteSelectionRenderer
   * consumes this field since P11). No-op when the active tab isn't shared.
   */
  private publishSelection(uuid: string | null) {
    const sharedDocService = this.globalObjectInstance.sharedDocServiceRef;
    if (!sharedDocService) return;
    const session = sharedDocService.forTab(this.globalObjectInstance.selectedTab);
    if (!session) return;
    session.awareness.setLocalStateField("selection", { uuid });
  }

  initSelectionBoxHelper(object: THREE.Mesh) {
    this.globalObjectInstance.boxHelper = new THREE.BoxHelper(object, "red");
    this.globalObjectInstance.scene.add(this.globalObjectInstance.boxHelper);
    this.updateSelectionBoxHelper(object);
  }
  updateSelectionBoxHelper(object: THREE.Mesh) {
    this.globalObjectInstance.boxHelper.setFromObject(object);
    this.globalObjectInstance.boxHelper.update();
  }
  removeSelectionBoxHelper() {
    this.globalObjectInstance.scene.remove(this.globalObjectInstance.boxHelper);
    this.globalObjectInstance.boxHelper = undefined as unknown as THREE.BoxHelper;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const globalSelectedObject = new GlobalSelectedObject();
