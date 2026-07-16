import { SceneInstance } from "@gds";
import { globalObject } from "@/engine/global-definition";
import { eventBus } from "./event-bus";

/**
 * Port of the old modeling `resources/services/snapshot_service.ts` (plan §10: ★
 * modeling-unique). DI stripped: GlobalDefinition / EventAggregator become
 * module-singleton imports. Two independent snapshot mechanisms, bodies unchanged:
 *   - the whole scene-open engine state (for rolling back a failed scene open), and
 *   - per-SceneInstance deep clones (for reverting local edits, e.g. import).
 *
 * DEVIATION (recorded in state.json): the old code deep-cloned with the app's
 * `plainToInstance(SceneInstance, ...)`. In this repo gds ships its OWN
 * class-transformer copy, and the `@Type` metadata that revives nested
 * class/relation/attribute instances is registered only in THAT copy — so the app's
 * `plainToInstance` produces a top-level SceneInstance whose children are plain
 * `Object`s (breaks `instanceof ClassInstance`). `SceneInstance.fromJS(...)` runs
 * inside gds and deep-revives correctly, so clones go through it instead.
 */
type SceneOpenStateSnapshot = {
  selectedTab: number;
  tabContext: typeof globalObject.tabContext;
  scene: any;
  dragObjects: any[];
  attributeInstances: any[];
  roleInstances: any[];
  relationObjects: any[];
  currentClassInstance: any;
  currentPortInstance: any;
  currentMetaPort: any;
};

export class SnapshotService {
  private sceneOpenSnapshot: SceneOpenStateSnapshot | null = null;
  private sceneInstanceSnapshots = new Map<string, SceneInstance>();

  private globalObjectInstance = globalObject;
  private eventAggregator = eventBus;

  // --- Scene-open state snapshot ---

  createSceneOpenSnapshot() {
    this.sceneOpenSnapshot = {
      selectedTab: this.globalObjectInstance.selectedTab,
      tabContext: [...this.globalObjectInstance.tabContext],
      scene: this.globalObjectInstance.scene,
      dragObjects: [...this.globalObjectInstance.dragObjects],
      attributeInstances: [...this.globalObjectInstance.attribute_instances],
      roleInstances: [...this.globalObjectInstance.role_instances],
      relationObjects: [...this.globalObjectInstance.relationObjects],
      currentClassInstance: this.globalObjectInstance.current_class_instance,
      currentPortInstance: this.globalObjectInstance.current_port_instance,
      currentMetaPort: this.globalObjectInstance.current_meta_port,
    };
  }

  clearSceneOpenSnapshot() {
    this.sceneOpenSnapshot = null;
  }

  rollbackSceneOpen() {
    if (!this.sceneOpenSnapshot) {
      return;
    }

    this.globalObjectInstance.selectedTab = this.sceneOpenSnapshot.selectedTab;
    this.globalObjectInstance.tabContext = this.sceneOpenSnapshot.tabContext;
    this.globalObjectInstance.scene = this.sceneOpenSnapshot.scene;
    this.globalObjectInstance.dragObjects = this.sceneOpenSnapshot.dragObjects;
    this.globalObjectInstance.attribute_instances = this.sceneOpenSnapshot.attributeInstances;
    this.globalObjectInstance.role_instances = this.sceneOpenSnapshot.roleInstances;
    this.globalObjectInstance.relationObjects = this.sceneOpenSnapshot.relationObjects;
    this.globalObjectInstance.current_class_instance = this.sceneOpenSnapshot.currentClassInstance;
    this.globalObjectInstance.current_port_instance = this.sceneOpenSnapshot.currentPortInstance;
    this.globalObjectInstance.current_meta_port = this.sceneOpenSnapshot.currentMetaPort;

    this.eventAggregator.publish("tabChanged");

    this.sceneOpenSnapshot = null;
  }

  // --- SceneInstance snapshots ---

  setSceneInstanceSnapshot(sceneInstance: SceneInstance) {
    this.sceneInstanceSnapshots.set(sceneInstance.uuid, this.deepCloneSceneInstance(sceneInstance));
  }

  restoreSceneInstanceToCurrentTab(): SceneInstance | null {
    const tabContext = this.globalObjectInstance.tabContext[this.globalObjectInstance.selectedTab];
    if (!tabContext?.sceneInstance) {
      return null;
    }

    const snapshot = this.sceneInstanceSnapshots.get(tabContext.sceneInstance.uuid);
    if (!snapshot) {
      return null;
    }

    // Remove all 3D objects from the Three.js scene and clear tracking arrays
    // so the canvas reflects the restored state after importInstances() re-draws it.
    const threeScene = tabContext.threeScene;
    if (threeScene) {
      for (const obj of tabContext.contextDragObjects) {
        threeScene.remove(obj);
      }
    }
    tabContext.contextDragObjects.length = 0;
    this.globalObjectInstance.attribute_instances.length = 0;
    this.globalObjectInstance.role_instances.length = 0;
    this.globalObjectInstance.relationObjects.length = 0;

    tabContext.sceneInstance = this.deepCloneSceneInstance(snapshot);
    return tabContext.sceneInstance;
  }

  private deepCloneSceneInstance(sceneInstance: SceneInstance): SceneInstance {
    const plain: object = JSON.parse(JSON.stringify(sceneInstance));
    // Use gds fromJS (gds's own class-transformer copy) so nested class/relation/
    // attribute instances are revived — the app's plainToInstance would not (see
    // the file header). This keeps `instanceof` working on the restored graph.
    return SceneInstance.fromJS(plain) as SceneInstance;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const snapshotService = new SnapshotService();
