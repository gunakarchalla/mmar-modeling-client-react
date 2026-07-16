import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { globalObject } from "@/engine/global-definition";
import { globalStateObject } from "@/engine/global-state-object";
import { arInitiator } from "@/engine/ar-initiator";
import { mouseObject } from "@/engine/mouse-object";
import { interactionHandler } from "@/engine/interaction-handler";
import { logger } from "@/resources/services/logger";
import { sceneInitiator } from "@/engine/scene-initiator";
import { resize } from "@/engine/resize";

/**
 * Port of the old `resources/initiator.ts` (DI-stripping recipe): every injected
 * dependency becomes a module-singleton import. Deviations from the original, all
 * required by the React port (plan §3.1 mount facade):
 *
 *  - the old DOM-polling `initDomObjectElements`/`setElementsById('container', …)`
 *    flow is superseded by `engine.mount(container)` passing the ref directly. Those
 *    methods are kept for fidelity but are no longer used.
 *  - the XRButton creation (old init appended it to document.body with a polling
 *    styler + `renderer.xr.enabled = true`) is REMOVED here: the XRButton is deferred
 *    to P13 via `engine.createXRButton()`, and enabling XR + wiring the
 *    sessionstart/sessionend listeners moves into `arInitiator.enableXR()` (called
 *    from `engine.mount`).
 *  - `OrbitControls.addEventListener('mouseUp', …)` is cast to `any` (three's
 *    EventDispatcher typing only knows change/start/end) and the now-invalid
 *    `{ passive: true }` option (EventDispatcher takes no options arg) is dropped.
 *  - 2D orthographic camera is the modeling default (`normalCamera = normalCamera2d`),
 *    matching the original (the metamodeling twin defaulted to 3D).
 */
export class Initiator {
  private globalObjectInstance = globalObject;
  private globalStateObject = globalStateObject;
  private arInitiator = arInitiator;
  private mouseObject = mouseObject;
  private interactonHandler = interactionHandler;
  private logger = logger;
  private sceneInitiator = sceneInitiator;
  private resize = resize;

  //------------------------------------------------
  //this gets all the dom elements for the globalObject
  //------------------------------------------------
  async initDomObjectElements() {
    // event on pointermove call updateMousePosText
    await this.setElementsById("container", this.globalObjectInstance, "elementContainer");
    this.logger.log("init DomElementObjects to globalObject", "done");
  }

  //custom function that tries to query an element until it is available
  async setElementsById(id: string, object: any, propertyToAssign: string) {
    const interval = window.setInterval(() => {
      object[propertyToAssign] = document.querySelector("#" + id);

      if (object[propertyToAssign]) {
        clearInterval(interval);
      } else {
        this.logger.log("element " + id + " undefined", "close");
      }
    }, 1000);
  }

  async init() {
    const containerWidth = this.globalObjectInstance.elementContainer.clientWidth;
    const containerHeight = this.globalObjectInstance.elementContainer.clientHeight;
    const aspectRatio = containerWidth / containerHeight;
    const nearPlane = 0.1;
    const farPlane = 5000;

    // Perspective Camera
    const fov = 70; // Field of view in degrees
    this.globalObjectInstance.normalCamera3d = new THREE.PerspectiveCamera(fov, aspectRatio, nearPlane, farPlane);
    this.globalObjectInstance.normalCamera3d.position.set(0, 0, 10);

    // Orthographic Camera
    const frustumSize = 10;
    this.globalObjectInstance.normalCamera2d = new THREE.OrthographicCamera(
      (frustumSize * aspectRatio) / -2,
      (frustumSize * aspectRatio) / 2,
      frustumSize / 2,
      frustumSize / -2,
      nearPlane,
      farPlane
    );
    this.globalObjectInstance.normalCamera2d.position.set(0, 0, 10);
    this.globalObjectInstance.normalCamera2d.zoom = 1; // Adjust zoom to match perspective view
    this.globalObjectInstance.normalCamera2d.updateProjectionMatrix();

    this.globalObjectInstance.normalCamera = this.globalObjectInstance.normalCamera2d;
    this.globalObjectInstance.camera = this.globalObjectInstance.normalCamera;
    this.globalObjectInstance.renderer.setSize(this.globalObjectInstance.elementContainer.clientWidth, this.globalObjectInstance.elementContainer.clientHeight, true);
    this.globalObjectInstance.elementContainer.appendChild(this.globalObjectInstance.renderer.domElement);

    await this.initMousePointer3d();

    await this.initOrbitControls();

    await this.sceneInitiator.sceneInit();

    await this.createIntersectionPlane();

    // XRButton creation is deferred to P13 (engine.createXRButton); enabling XR +
    // the sessionstart/sessionend listeners live in arInitiator.enableXR(), called
    // from engine.mount().

    //added for VR support
    // we set the animation loop that is always called.
    //we bind .this since a callback has a higher order function
    this.globalObjectInstance.renderer.setAnimationLoop(this.arInitiator.render.bind(this.arInitiator));
  }

  async initMousePointer3d() {
    this.globalObjectInstance.mousePointer3d = this.createSphereMesh(new THREE.Color("blue"));
    this.globalObjectInstance.mousePointer3d.visible = false;
    this.globalObjectInstance.mousePointer3d.position.z = this.globalObjectInstance.localZPlane;
    this.globalObjectInstance.scene.add(this.globalObjectInstance.mousePointer3d);
    this.globalObjectInstance.mousePointer3d.name = "mousePointer3d";
  }

  async initOrbitControls() {
    this.globalObjectInstance.orbitControls2d = new OrbitControls(this.globalObjectInstance.normalCamera2d, this.globalObjectInstance.renderer.domElement);
    this.globalObjectInstance.orbitControls3d = new OrbitControls(this.globalObjectInstance.normalCamera3d, this.globalObjectInstance.renderer.domElement);

    //orbit controls to move camera
    this.globalObjectInstance.orbitControls2d.target = new THREE.Vector3(0, 0, this.globalObjectInstance.localZPlane);
    this.globalObjectInstance.orbitControls3d.target = new THREE.Vector3(0, 0, this.globalObjectInstance.localZPlane);

    // max and min Zoom for OrbitControls
    this.globalObjectInstance.orbitControls2d.minDistance = 0.2;
    this.globalObjectInstance.orbitControls2d.maxDistance = 500;
    this.globalObjectInstance.orbitControls3d.minDistance = 0.2;
    this.globalObjectInstance.orbitControls3d.maxDistance = 500;

    //set orbitcontrol values for 3d
    this.globalObjectInstance.orbitControls3d.maxPolarAngle = Math.PI; // radians
    this.globalObjectInstance.orbitControls3d.minPolarAngle = 0; // radians
    this.globalObjectInstance.orbitControls3d.maxAzimuthAngle = Infinity; // radians
    this.globalObjectInstance.orbitControls3d.minAzimuthAngle = Infinity; // radians

    // set orbitcontrol values for 2d
    this.globalObjectInstance.orbitControls2d.maxPolarAngle = Math.PI / 2; // radians
    this.globalObjectInstance.orbitControls2d.minPolarAngle = Math.PI / 2; // radians
    this.globalObjectInstance.orbitControls2d.maxAzimuthAngle = 0; // radians
    this.globalObjectInstance.orbitControls2d.minAzimuthAngle = 0; // radians

    if (!this.globalObjectInstance.threeDimensional) {
      this.globalObjectInstance.orbitControls = this.globalObjectInstance.orbitControls2d;
    }
    if (this.globalObjectInstance.threeDimensional) {
      this.globalObjectInstance.orbitControls = this.globalObjectInstance.orbitControls3d;
    }

    this.globalObjectInstance.orbitControls3d.addEventListener("change", () => (this.globalObjectInstance.render = true));
    (this.globalObjectInstance.orbitControls3d as any).addEventListener("mouseUp", () => (this.globalObjectInstance.render = true));
    this.globalObjectInstance.orbitControls2d.addEventListener("change", () => (this.globalObjectInstance.render = true));
    (this.globalObjectInstance.orbitControls2d as any).addEventListener("mouseUp", () => (this.globalObjectInstance.render = true));

    //save state of orbitcontrols
    this.globalObjectInstance.orbitControls2d.saveState();
    //save state of orbitcontrols
    this.globalObjectInstance.orbitControls3d.saveState();
  }

  createSphereMesh(color: THREE.Color) {
    const sphGeom = new THREE.SphereGeometry(0.05, 8, 4);
    const sphMat = new THREE.MeshBasicMaterial({
      color: color,
      wireframe: false,
    });
    return new THREE.Mesh(sphGeom, sphMat);
  }

  async initEventListeners() {
    this.globalStateObject.setState(0);

    // we add the method to a global variable so that we can remove the listener later with just calling the variable
    this.globalObjectInstance.onDocumentMouseDownEventListener = await this.interactonHandler.onDocumentMouseDown.bind(this.interactonHandler);
    // we do not init the event listener here since it must be initialized after the transform controls are initialized
    //this.globalObjectInstance.renderer.domElement.addEventListener('pointerdown', this.globalObjectInstance.onDocumentMouseDownEventListener, false);

    this.globalObjectInstance.elementContainer.addEventListener("pointermove", this.mouseObject.updateMousePos.bind(this.mouseObject), { passive: true });

    //init resize event listener
    window.addEventListener("resize", this.resize.resize.bind(this.resize));

    //AR listeners are registered by arInitiator.enableXR() (called from engine.mount).
  }

  async createIntersectionPlane() {
    // add intersection plane
    const geometry: THREE.PlaneGeometry = new THREE.PlaneGeometry(10000, 10000);
    const material = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
    material.color = new THREE.Color("grey");
    this.globalObjectInstance.plane = new THREE.Mesh(geometry, material);
    this.globalObjectInstance.plane.receiveShadow = true;
    this.globalObjectInstance.plane.position.z = this.globalObjectInstance.localZPlane;
    this.logger.log("intersection plane created at position :" + JSON.stringify(this.globalObjectInstance.plane.position), "done");
    this.globalObjectInstance.plane.geometry.name = "plane";
    this.globalObjectInstance.scene.add(this.globalObjectInstance.plane);
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const initiator = new Initiator();
