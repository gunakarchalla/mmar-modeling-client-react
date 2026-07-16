import * as THREE from "three";
import { globalObject } from "@/engine/global-definition";

/**
 * Port of the old `resources/ray_helper.ts` (DI-stripping recipe): the Aurelia
 * `@singleton()` + injected GlobalDefinition become the `globalObject` module
 * singleton. `shootRay` / `shootRayFromObject` are unchanged.
 *
 * The old client also injected `SharedDocService` for the collaboration cursor
 * broadcast (`broadcastCursor` / `clearCursor`). Collaboration is not wired until
 * P10/P11, so those bits reach the shared session through
 * `globalObject.sharedDocServiceRef` (null until P10) instead of a direct import —
 * the null guard makes them no-ops for now. Un-stub / verify in P11.
 */
export class RayHelper {
  private lastCursorBroadcast = 0;

  private globalObjectInstance = globalObject;

  private get sharedDocService(): any {
    return this.globalObjectInstance.sharedDocServiceRef;
  }

  //generate a raycast that shoots a ray from the camera to the mouse position
  //returns the raycaster
  shootRay(event: MouseEvent | TouchEvent): THREE.Raycaster {
    //calculate the x and y position of the mouse on the renderer
    const ev: any = event;
    let clientX: number | undefined;
    let clientY: number | undefined;

    //for touch
    try {
      clientX = ev.touches[0].clientX;
      clientY = ev.touches[0].clientY;
    } catch {
      /* not a touch event */
    }

    const rect: DOMRect = this.globalObjectInstance.renderer.domElement.getBoundingClientRect();

    //for touch
    if (clientX && clientY) {
      this.globalObjectInstance.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.globalObjectInstance.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }
    //if not touch
    else {
      this.globalObjectInstance.mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      this.globalObjectInstance.mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    }

    //Raycaster from Camera to mouseposition
    this.globalObjectInstance.raycaster.setFromCamera(this.globalObjectInstance.mouse, this.globalObjectInstance.camera);

    // Broadcast cursor position to awareness (throttled to ~33 ms / ~30 fps). No-op
    // until collaboration is wired (P11).
    this.broadcastCursor();

    return this.globalObjectInstance.raycaster;
  }

  /** Clear the local cursor state — call on pointer-leave of the canvas. No-op until P11. */
  clearCursor(): void {
    const session = this.sharedDocService?.forTab(this.globalObjectInstance.selectedTab);
    if (!session) return;
    session.awareness.setLocalStateField("cursor", { active: false });
  }

  /**
   * Broadcast the local pointer as a world-space ray so remote clients can draw it
   * as an arrow: tail on the camera's near plane, head on the first scene object the
   * ray hits — or, when it misses everything, on the camera's far plane.
   *
   * Because the unprojection runs through the active camera's inverse projection
   * matrix, this works for both the orthographic (2D) and perspective (3D) cameras
   * without branching. Throttled to ~30 fps. No-op until collaboration is wired (P11).
   */
  private broadcastCursor(): void {
    const now = Date.now();
    if (now - this.lastCursorBroadcast < 33) return;
    this.lastCursorBroadcast = now;

    const session = this.sharedDocService?.forTab(this.globalObjectInstance.selectedTab);
    if (!session) return;

    const camera = this.globalObjectInstance.camera;
    const mouse = this.globalObjectInstance.mouse;

    // Arrow tail: pointer projected onto the camera's near plane.
    const origin = new THREE.Vector3(mouse.x, mouse.y, -1).unproject(camera);

    // Arrow head: the first object the ray hits, otherwise the camera's far plane.
    const hits = this.globalObjectInstance.raycaster.intersectObjects(this.globalObjectInstance.dragObjects, false);
    const target = hits.length > 0 ? hits[0].point : new THREE.Vector3(mouse.x, mouse.y, 1).unproject(camera);

    session.awareness.setLocalStateField("cursor", {
      active: true,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      target: { x: target.x, y: target.y, z: target.z },
    });
  }

  shootRayFromObject(fromObject: THREE.Mesh, toObject: THREE.Mesh) {
    const direction = new THREE.Vector3();
    const fromPosition: THREE.Vector3 = new THREE.Vector3();
    const toPosition: THREE.Vector3 = new THREE.Vector3();

    //we get the world position of the two
    fromObject.getWorldPosition(fromPosition);
    toObject.getWorldPosition(toPosition);

    const adaptedFromPosition = fromPosition;
    direction.subVectors(toPosition, adaptedFromPosition);
    this.globalObjectInstance.raycasterBetweenObjects.set(adaptedFromPosition, direction.normalize());
    const intersects = this.globalObjectInstance.raycasterBetweenObjects.intersectObject(toObject);
    if (intersects[0]) return intersects[0].point;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const rayHelper = new RayHelper();
