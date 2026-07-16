import * as THREE from "three";
import { XRControllerModelFactory } from "three/examples/jsm/webxr/XRControllerModelFactory.js";
import { OculusHandPointerModel } from "three/examples/jsm/webxr/OculusHandPointerModel.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";
import { globalObject } from "@/engine/global-definition";
import { animator } from "@/engine/animator";
import { logger } from "@/resources/services/logger";

/**
 * Port of the old `resources/ar_initiator.ts` (DI-stripping recipe): GlobalDefinition
 * / Animator / Logger become module-singleton imports. The full WebXR / AR session
 * support (onSessionStarted / onSessionEnded / initHands / onSelect* /
 * createWorldOriginMarker) is ported ~verbatim.
 *
 * Two additions over the old client — which wired XR from `initiator.init`
 * (`renderer.xr.enabled = true`, the sessionstart/sessionend listeners, and the
 * document.body XRButton) — consolidate that here so the mount facade can enable XR
 * idempotently and the XRButton stays deferred to P13:
 *   - `enableXR()` sets `renderer.xr.enabled` and registers the session listeners
 *     (called once from `engine.mount()` / when the XR button is created).
 *   - `render()` forces `globalObject.render = true` while presenting so the desktop
 *     dirty-flag optimisation (onSessionStarted sets render=false) does not freeze the
 *     AR view. The non-AR path is unchanged.
 */
export class ArInitiator {
  controller1: any;
  controller2: any;
  controllerGrip1: any;
  hand1: any;
  controllerGrip2: any;
  hand2: any;
  handPointer1: any;
  handPointer2: any;

  raycaster = new THREE.Raycaster();
  tempMatrix = new THREE.Matrix4();

  xrSession: any = null;
  xrReferenceSpace: any = null;

  private xrListenersRegistered = false;

  private globalObjectInstance = globalObject;
  private animator = animator;
  private logger = logger;

  /**
   * Turn on WebXR on the renderer and wire the session lifecycle. Idempotent. Called
   * from engine.mount() and when the XR button is created (P13) so an XRButton-started
   * session drives onSessionStarted / onSessionEnded.
   */
  enableXR() {
    const renderer = this.globalObjectInstance.renderer;
    renderer.xr.enabled = true;
    if (!this.xrListenersRegistered) {
      renderer.xr.addEventListener("sessionstart", () => void this.onSessionStarted());
      renderer.xr.addEventListener("sessionend", () => this.onSessionEnded());
      this.xrListenersRegistered = true;
    }
  }

  // for AR additional support, e.g., image-tracking
  // compare https://github.com/ShirinStar/webAR_experiments/tree/main/16-webxr-image_tracking
  render(_timestamp?: number, _frame?: any) {
    // XR requires a fresh render every frame; the desktop dirty-flag optimisation
    // (animator only draws when render===true, and onSessionStarted sets it false)
    // would otherwise freeze the AR view. Force it true while presenting.
    if (this.globalObjectInstance.renderer.xr.isPresenting) {
      this.globalObjectInstance.render = true;
    }

    void this.animator.animate();
  }
  //AR events
  async onSessionStarted() {
    this.globalObjectInstance.camera = this.globalObjectInstance.ARCamera;
    this.globalObjectInstance.render = false;
    this.logger.log("ar camera active", "info");

    this.createWorldOriginMarker();

    this.initHands();
  }

  onSessionEnded() {
    this.globalObjectInstance.camera = this.globalObjectInstance.normalCamera;
    this.globalObjectInstance.render = true;
    this.logger.log("normal camera active", "info");

    this.removeWorldOriginMarker();
  }

  initHands() {
    // controllers

    this.controller1 = this.globalObjectInstance.renderer.xr.getController(0);
    this.globalObjectInstance.scene.add(this.controller1);

    this.controller2 = this.globalObjectInstance.renderer.xr.getController(1);
    this.globalObjectInstance.scene.add(this.controller2);

    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    // Hand 1
    this.controllerGrip1 = this.globalObjectInstance.renderer.xr.getControllerGrip(0);
    this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
    this.globalObjectInstance.scene.add(this.controllerGrip1);

    this.hand1 = this.globalObjectInstance.renderer.xr.getHand(0);
    this.hand1.add(handModelFactory.createHandModel(this.hand1));
    this.handPointer1 = new OculusHandPointerModel(this.hand1, this.controller1);
    this.hand1.add(this.handPointer1);

    this.globalObjectInstance.scene.add(this.hand1);

    // Hand 2
    this.controllerGrip2 = this.globalObjectInstance.renderer.xr.getControllerGrip(1);
    this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
    this.globalObjectInstance.scene.add(this.controllerGrip2);

    this.hand2 = this.globalObjectInstance.renderer.xr.getHand(1);
    this.hand2.add(handModelFactory.createHandModel(this.hand2));
    this.handPointer2 = new OculusHandPointerModel(this.hand2, this.controller2);
    this.hand2.add(this.handPointer2);

    this.globalObjectInstance.scene.add(this.hand2);

    // events
    this.hand1.addEventListener("pinchstart", (event: any) => this.onSelectStart(event));
    this.hand1.addEventListener("pinchend", (event: any) => this.onSelectEnd(event));
    this.hand2.addEventListener("pinchstart", (event: any) => this.onSelectStart(event));
    this.hand2.addEventListener("pinchend", (event: any) => this.onSelectEnd(event));
  }

  onSelectStart(event: any) {
    console.log("pichstart");
    let controller = event.target;

    if (controller === this.hand1) {
      controller = this.controller1;
    } else if (controller === this.hand2) {
      controller = this.controller2;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      controller === undefined;
    }

    console.log(controller);

    let intersection: THREE.Intersection | undefined = undefined;

    if (controller === this.controller1 && !intersection) {
      intersection = (this.handPointer1.intersectObjects(this.globalObjectInstance.dragObjects, false) as THREE.Intersection[])[0];
      if (intersection) {
        console.log("object c1");
        if (intersection.object.parent === this.controller2) {
          return;
        }
      }
    }
    if (controller === this.controller2 && !intersection) {
      intersection = (this.handPointer2.intersectObjects(this.globalObjectInstance.dragObjects, false) as THREE.Intersection[])[0];
      if (intersection) {
        console.log("object c2");
        if (intersection.object.parent === this.controller1) {
          return;
        }
      }
    }
    if (intersection) {
      const object = intersection.object;
      controller.userData.objectParent = object.parent;
      controller.attach(object);
      controller.userData.selected = object;
    }
  }

  //detach from hand and attach back to former parent
  onSelectEnd(event: any) {
    let controller = event.target;

    if (controller === this.hand1) {
      controller = this.controller1;
    } else if (controller === this.hand2) {
      controller = this.controller2;
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      controller === undefined;
    }

    if (controller.userData.selected !== undefined) {
      const object = controller.userData.selected;
      const parent = controller.userData.objectParent;
      parent.attach(object);
      controller.userData.objectParent = undefined;
      controller.userData.selected = undefined;
    }
    // else check if object is attached to controller and detach
    else if (controller.children.length > 0) {
      const object = controller.children[0];
      const parent = controller.userData.objectParent;
      parent.attach(object);
      controller.userData.objectParent = undefined;
      controller.userData.selected = undefined;
      console.log("object detached");
    }
  }

  createWorldOriginMarker() {
    // create a plane sowing the directions of the world axes
    const worldOriginMarker = new THREE.AxesHelper(0.3);
    worldOriginMarker.position.set(0, 0, 0);
    this.globalObjectInstance.scene.add(worldOriginMarker);
    worldOriginMarker.name = "worldOriginMarker";

    // set a text label for each axis of the world origin
    const loader = new FontLoader();
    loader.load("https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/fonts/helvetiker_regular.typeface.json", (font: any) => {
      const textGeometryX = new TextGeometry("+X", {
        font: font,
        size: 0.05,
        height: 0.01,
      });
      const textMaterialX = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const textX = new THREE.Mesh(textGeometryX, textMaterialX);
      textX.position.set(0.3, 0, 0);
      worldOriginMarker.add(textX);

      const textGeometryY = new TextGeometry("+Y", {
        font: font,
        size: 0.05,
        height: 0.01,
      });
      const textMaterialY = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const textY = new THREE.Mesh(textGeometryY, textMaterialY);
      textY.position.set(0, 0.3, 0);
      worldOriginMarker.add(textY);

      const textGeometryZ = new TextGeometry("+Z", {
        font: font,
        size: 0.05,
        height: 0.01,
      });
      const textMaterialZ = new THREE.MeshBasicMaterial({ color: 0x0000ff });
      const textZ = new THREE.Mesh(textGeometryZ, textMaterialZ);
      textZ.position.set(0, 0, 0.3);
      worldOriginMarker.add(textZ);
    });
  }

  removeWorldOriginMarker() {
    const marker = this.globalObjectInstance.scene.getObjectByName("worldOriginMarker");
    if (marker) {
      this.globalObjectInstance.scene.remove(marker);
    }
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const arInitiator = new ArInitiator();
