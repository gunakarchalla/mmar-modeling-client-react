// P5 unit test for the deletion handler — proves the CASCADE: deleting a class
// instance also removes every relation connected to it (via its role instances) and
// tears down those role instances, keeping the SceneInstance object graph consistent.
// A shallow delete would leave dangling relations that crash Animator.setPos on the
// next frame, so the cascade is the property worth pinning.
//
// global-definition + graphic-context + instance-utility + backend-service are faked
// (WebGLRenderer / troika / network). The THREE.Scene is REAL so getObjectByProperty
// + scene.remove behave; gds fixtures are REAL via fromJS. autoSave is false so no DB
// calls happen. Node env.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { SceneInstance, RoleInstance } from "@gds";

const threeScene = new THREE.Scene();

const mocks = vi.hoisted(() => ({
  globalObject: {
    role_instances: [] as unknown[],
    attribute_instances: [] as unknown[],
    updateLinesArray: [] as unknown[],
    autoSave: false,
    doSceneInstancePatch: false,
    sharedDocServiceRef: null as unknown,
    selectedTab: 0,
    boxHelper: undefined as unknown,
    current_class_instance: undefined as unknown,
    scene: undefined as unknown,
  },
  graphicContext: { deleteObject: vi.fn(async () => {}) },
  instanceUtility: { getTabContextSceneInstance: vi.fn() },
  backendService: {
    classesInstancesAllDELETE2: vi.fn(),
    relationClassesInstancesAllDELETE2: vi.fn(),
    bendpointInstanceDELETE: vi.fn(),
  },
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine/graphic-context", () => ({ graphicContext: mocks.graphicContext, GraphicContext: class {} }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));

const { deletionHandler } = await import("./deletion-handler");

const CI_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CI_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const REL = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const RF = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const RT = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** Scene with A --REL--> B, where REL's from/to roles reference A and B. */
function makeScene(): SceneInstance {
  return SceneInstance.fromJS({
    uuid: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    name: "scene",
    uuid_scene_type: "st-1",
    class_instances: [
      { uuid: CI_A, name: "A", uuid_class: "mc", attribute_instance: [], port_instance: [] },
      { uuid: CI_B, name: "B", uuid_class: "mc", attribute_instance: [], port_instance: [] },
    ],
    relationclasses_instances: [
      {
        uuid: REL,
        name: "R",
        uuid_relationclass: "mrc",
        line_points: [],
        attribute_instance: [],
        role_instance_from: { uuid: RF, uuid_role: "role-from", uuid_has_reference_class_instance: CI_A },
        role_instance_to: { uuid: RT, uuid_role: "role-to", uuid_has_reference_class_instance: CI_B },
      },
    ],
    port_instances: [],
    attribute_instances: [],
  }) as SceneInstance;
}

function meshFor(uuid: string, name: string): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  m.uuid = uuid;
  m.name = name;
  return m;
}

let sceneInstance: SceneInstance;

beforeEach(() => {
  vi.clearAllMocks();
  // reset the shared THREE scene
  threeScene.clear();
  threeScene.add(meshFor(CI_A, "A"), meshFor(CI_B, "B"), meshFor(REL, "R"));

  sceneInstance = makeScene();
  mocks.globalObject.scene = threeScene;
  mocks.globalObject.boxHelper = undefined;
  mocks.globalObject.updateLinesArray = [];
  mocks.globalObject.attribute_instances = [];
  mocks.globalObject.doSceneInstancePatch = false;
  // both role instances live in the global list, matching the relation's roles
  mocks.globalObject.role_instances = [
    RoleInstance.fromJS({ uuid: RF, uuid_role: "role-from", uuid_has_reference_class_instance: CI_A }),
    RoleInstance.fromJS({ uuid: RT, uuid_role: "role-to", uuid_has_reference_class_instance: CI_B }),
  ];
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
});

describe("DeletionHandler.deleteClassInstance — cascade", () => {
  it("removes the class AND the relation connected to it, plus both role instances", async () => {
    const classA = sceneInstance.class_instances[0];

    await deletionHandler.deleteClassInstance(classA, 0);

    // class A gone, class B remains
    expect(sceneInstance.class_instances.map((c) => c.uuid)).toEqual([CI_B]);
    // the connected relation cascaded away
    expect(sceneInstance.relationclasses_instances).toHaveLength(0);
    // both role instances torn down
    expect(mocks.globalObject.role_instances).toHaveLength(0);
    // local patch flag raised for auto-save
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
  });

  it("does not call the DB delete endpoints when autoSave is off", async () => {
    const classA = sceneInstance.class_instances[0];

    await deletionHandler.deleteClassInstance(classA, 0);

    expect(mocks.backendService.classesInstancesAllDELETE2).not.toHaveBeenCalled();
    expect(mocks.backendService.relationClassesInstancesAllDELETE2).not.toHaveBeenCalled();
  });
});
