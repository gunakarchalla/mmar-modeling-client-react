import { globalObject } from "@/engine/global-definition";

/**
 * Port of the old `resources/resize.ts` (DI-stripping recipe): GlobalDefinition
 * becomes a module-singleton import. Body unchanged. Called by ThreeCanvas's
 * ResizeObserver (replacing the old window `resize` listener) to keep both cameras
 * and the renderer in sync with the container size.
 */
export class Resize {
  private globalObjectInstance = globalObject;

  resize() {
    const containerWidth = this.globalObjectInstance.elementContainer.clientWidth;
    const containerHeight = this.globalObjectInstance.elementContainer.clientHeight;
    const aspectRatio = containerWidth / containerHeight;
    const nearPlane = 0.1;
    const farPlane = 5000;

    // resize Perspective Camera
    const fov = 70; // Field of view in degrees

    this.globalObjectInstance.normalCamera3d.fov = fov;
    this.globalObjectInstance.normalCamera3d.aspect = aspectRatio;
    this.globalObjectInstance.normalCamera3d.near = nearPlane;
    this.globalObjectInstance.normalCamera3d.far = farPlane;

    this.globalObjectInstance.normalCamera3d.position.set(0, 0, 10);
    this.globalObjectInstance.normalCamera3d.updateProjectionMatrix();

    // resize Orthographic Camera
    const frustumSize = 10; // This can be adjusted as needed

    this.globalObjectInstance.normalCamera2d.left = (frustumSize * aspectRatio) / -2;
    this.globalObjectInstance.normalCamera2d.right = (frustumSize * aspectRatio) / 2;
    this.globalObjectInstance.normalCamera2d.top = frustumSize / 2;
    this.globalObjectInstance.normalCamera2d.bottom = frustumSize / -2;
    this.globalObjectInstance.normalCamera2d.near = nearPlane;
    this.globalObjectInstance.normalCamera2d.far = farPlane;

    this.globalObjectInstance.normalCamera2d.position.set(0, 0, 10);
    this.globalObjectInstance.normalCamera2d.zoom = 1; // Adjust zoom to match perspective view
    this.globalObjectInstance.normalCamera2d.updateProjectionMatrix();

    this.globalObjectInstance.renderer.setSize(this.globalObjectInstance.elementContainer.clientWidth, this.globalObjectInstance.elementContainer.clientHeight, true);

    this.globalObjectInstance.render = true;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const resize = new Resize();
