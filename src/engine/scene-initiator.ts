import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { globalObject } from "@/engine/global-definition";
import { transformControlsEvents } from "@/engine/transform-control-events";

/**
 * Port of the old `resources/scene_initiator.ts` (DI-stripping recipe):
 * GlobalDefinition + TransformControlsEvents become module-singleton imports (the
 * unused MouseObject / InteractionHandler / Initiator injections are dropped, as in
 * the metamodeling twin). Body unchanged except the invalid `{ passive: true }`
 * option on the EventDispatcher listeners (three's EventDispatcher takes no options
 * arg) is dropped, and `mouseUp` is cast to `any` (three's typing only knows
 * change/mouseDown/objectChange). `transformControlsEvents` is a P4 stub until then.
 */
export class SceneInitiator {
  private globalObjectInstance = globalObject;
  private transformControlsEvents = transformControlsEvents;

  async sceneInit() {
    if (this.globalObjectInstance.elementContainer) {
      this.globalObjectInstance.scene = new THREE.Scene();

      //-------------------------------
      //set up controls
      //-------------------------------
      //add transformcontrols to scene
      await this.initTransformControls();

      this.globalObjectInstance.scene.add(this.globalObjectInstance.mousePointer3d);

      await this.initLights();

      this.globalObjectInstance.scene.add(this.globalObjectInstance.plane);

      // add grid
      const helper = new THREE.GridHelper(1000, 1000);
      helper.position.z = this.globalObjectInstance.localZPlane;
      helper.material.opacity = 0.1;
      helper.material.transparent = true;
      //rotate the grid so that it is horizontal
      helper.rotateX(Math.PI / 2);
      this.globalObjectInstance.scene.add(helper);

      const helper2 = new THREE.GridHelper(1000, 100);
      helper2.position.z = this.globalObjectInstance.localZPlane;
      helper2.material.opacity = 0.05;
      helper2.material.transparent = true;
      //rotate the grid so that it is horizontal
      this.globalObjectInstance.scene.add(helper2);
    }
  }

  async initTransformControls() {
    let oldTransformControls: TransformControls | undefined;
    //search in scene for transformControls
    this.globalObjectInstance.scene.traverse((child: THREE.Object3D) => {
      if (child instanceof TransformControls) {
        oldTransformControls = child;
      }
    });

    if (oldTransformControls) {
      //remove old transformControls from scene.children
      //(cast: three >=0.169 TransformControls no longer extends Object3D)
      this.globalObjectInstance.scene.remove(oldTransformControls as any);
    }

    this.globalObjectInstance.transformControls = new TransformControls(this.globalObjectInstance.camera, this.globalObjectInstance.renderer.domElement);

    // this.globalObjectInstance.scene.add(this.globalObjectInstance.transformControls);
    this.globalObjectInstance.scene.add(this.globalObjectInstance.transformControls.getHelper());
    this.globalObjectInstance.transformControls.setMode("scale");

    //remove event listener for onDocumentMouseDown
    //this is important, since the transformControls event listener must be registered before the pointerdown event listener
    //thus, we remove it before we initialize the transformControls and add it again after the transformControls are initialized
    this.globalObjectInstance.renderer.domElement.removeEventListener("pointerdown", this.globalObjectInstance.onDocumentMouseDownEventListener);

    //add event listener for transformControls
    this.globalObjectInstance.transformControls.addEventListener("change", () => this.transformControlsEvents.onTransformControlsPropertyChange());
    (this.globalObjectInstance.transformControls as any).addEventListener("mouseUp", async () => await this.transformControlsEvents.onTransformControlsMouseUp());

    //add again event listener for pointerdown
    this.globalObjectInstance.renderer.domElement.addEventListener("pointerdown", this.globalObjectInstance.onDocumentMouseDownEventListener);
  }

  async initLights() {
    //create two directional lights pointing at the point 0,0,0
    const light1 = new THREE.DirectionalLight(0xffffff, 1.3);
    light1.position.set(10, 10, 10);
    this.globalObjectInstance.scene.add(light1);

    const light2 = new THREE.DirectionalLight(0xffffff, 1.3);
    light2.position.set(-10, -10, 0);
    this.globalObjectInstance.scene.add(light2);
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const sceneInitiator = new SceneInitiator();
