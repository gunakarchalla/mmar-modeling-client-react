import * as THREE from "three";
import { globalObject } from "@/engine/global-definition";
import { rayHelper } from "@/engine/ray-helper";

/**
 * Tracks the pointer in the 3D world: on every `pointermove` it raycasts against the
 * invisible modelling plane and parks `mousePointer3d` at the hit point. Relation
 * drawing uses that sphere as the line's floating end point.
 */
export class MouseObject {
  private globalObjectInstance = globalObject;
  private rayHelper = rayHelper;

  updateMousePos(event: MouseEvent) {
    //get mouse pos
    const mousePos2d: { x: number; y: number } | undefined = this.getMousePos2d(this.globalObjectInstance.elementContainer, event);

    //set pos2D to textfield
    if (mousePos2d) this.globalObjectInstance.raycaster = this.rayHelper.shootRay(event);

    const objects: THREE.Object3D[] = [this.globalObjectInstance.plane];
    //array with objects, that intersect with the ray (only plane)
    const intersects: { point: { getComponent: (arg0: number) => number } }[] = this.globalObjectInstance.raycaster.intersectObjects(objects);

    //set pos3d to textfield
    if (intersects.length > 0) {
      this.globalObjectInstance.mousePointer3d.position.x = intersects[0].point.getComponent(0);
      this.globalObjectInstance.mousePointer3d.position.y = intersects[0].point.getComponent(1);
    }
  }

  getMousePos2d(canvas: HTMLElement | null, evt: MouseEvent) {
    //catch null
    if (canvas != null) {
      const rect: DOMRect = canvas.getBoundingClientRect();
      return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
      };
    }
  }
}

// Module singleton — one shared instance.
export const mouseObject = new MouseObject();
