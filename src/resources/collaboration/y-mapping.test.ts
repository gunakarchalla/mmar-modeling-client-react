// P10 unit tests for the yjs data mapping (plan §9 P10: "sceneInstanceToYDoc /
// applyYDocClassChangeTo... round-trip unit tests with fixture SceneInstances (no
// server needed)").
//
// No mocking of yjs: real Y.Docs are cheap and pure. `@/engine/global-definition` is
// NOT imported here — y-mapping takes the GlobalDefinition as an argument, so a plain
// fake stands in (importing the real one builds a WebGLRenderer at module scope).
//
// gds fixtures are REAL, built from PLAIN json via `X.fromJS` — and per P4's fixture
// trap, SceneInstance.fromJS DEEP-COPIES nested instances, so anything under test is
// read back OUT of the revived scene rather than held from before.
import { describe, it, expect, beforeEach } from "vitest";
import * as Y from "yjs";
import * as THREE from "three";
import { SceneInstance, ClassInstance, RelationclassInstance, AttributeInstance } from "@gds";
import type { GlobalDefinition } from "@/engine/global-definition";
import {
  sceneInstanceToYDoc,
  applyLocalChangeToYDoc,
  applyYDocClassChangeToSceneInstance,
  applyYDocRelationChangeToSceneInstance,
  applyYDocSceneAttributeChangeToSceneInstance,
} from "./y-mapping";

const SCENE_UUID = "scene-1";
const CI_UUID = "ci-1";
const RI_UUID = "ri-1";
const ATTR_UUID = "attr-1";
const SCENE_ATTR_UUID = "scene-attr-1";

function classInstanceJson(over: Record<string, unknown> = {}) {
  return {
    uuid: CI_UUID,
    uuid_class: "class-1",
    name: "Task",
    description: "a task",
    coordinates_2d: { x: 1, y: 2, z: 3 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    custom_variables: { scale: { x: 2, y: 2, z: 2 }, pos_name_x: { value: 5, user_locked: true } },
    attribute_instance: [
      {
        uuid: ATTR_UUID,
        uuid_attribute: "meta-attr-1",
        name: "Name",
        value: "original",
        assigned_uuid_class_instance: CI_UUID,
      },
    ],
    ...over,
  };
}

function relationInstanceJson(over: Record<string, unknown> = {}) {
  return {
    uuid: RI_UUID,
    uuid_class: "relclass-1",
    uuid_relationclass: "relclass-1",
    name: "Sequence Flow",
    description: "",
    coordinates_2d: { x: 4, y: 5, z: 6 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    line_points: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }],
    attribute_instance: [
      { uuid: "rel-attr-1", uuid_attribute: "meta-attr-2", name: "Label", value: "rel original" },
    ],
    role_instance_from: { uuid: "role-from", uuid_role: "r1", uuid_has_reference_class_instance: CI_UUID },
    role_instance_to: { uuid: "role-to", uuid_role: "r2", uuid_has_reference_class_instance: "ci-2" },
    ...over,
  };
}

/** An attribute of the SCENE INSTANCE itself (what the scene type declares). */
function sceneAttributeJson(over: Record<string, unknown> = {}) {
  return {
    uuid: SCENE_ATTR_UUID,
    uuid_attribute: "meta-attr-scene",
    name: "Comment",
    value: "scene original",
    assigned_uuid_scene_instance: SCENE_UUID,
    ...over,
  };
}

function makeScene(over: Record<string, unknown> = {}): SceneInstance {
  return SceneInstance.fromJS({
    uuid: SCENE_UUID,
    uuid_scene_type: "st-1",
    name: "My Scene",
    description: "desc",
    class_instances: [classInstanceJson()],
    relationclasses_instances: [relationInstanceJson()],
    attribute_instances: [sceneAttributeJson()],
    ...over,
  }) as SceneInstance;
}

/** The handful of GlobalDefinition fields the apply* functions touch. */
function makeGlobalObject(): GlobalDefinition {
  return {
    selectedTab: 0,
    tabContext: [{ contextDragObjects: [] as THREE.Mesh[] }],
    dragObjects: [] as THREE.Mesh[],
    attribute_instances: [] as AttributeInstance[],
    role_instances: [],
  } as unknown as GlobalDefinition;
}

let ydoc: Y.Doc;
let scene: SceneInstance;
let threeScene: THREE.Scene;
let globalObjectInstance: GlobalDefinition;

beforeEach(() => {
  ydoc = new Y.Doc();
  scene = makeScene();
  threeScene = new THREE.Scene();
  globalObjectInstance = makeGlobalObject();
});

describe("sceneInstanceToYDoc", () => {
  it("encodes info, class instances and relation instances into the documented shape", () => {
    sceneInstanceToYDoc(scene, ydoc);

    const info = ydoc.getMap("info");
    expect(info.get("uuid")).toBe(SCENE_UUID);
    expect(info.get("uuid_scene_type")).toBe("st-1");
    expect(info.get("name")).toBe("My Scene");

    const ciMap = ydoc.getMap<Y.Map<unknown>>("class_instances").get(CI_UUID)!;
    expect(ciMap.get("uuid_class")).toBe("class-1");
    expect((ciMap.get("coordinates_2d") as Y.Map<number>).get("x")).toBe(1);
    expect((ciMap.get("rotation") as Y.Map<number>).get("w")).toBe(1);
    // custom_variables values are JSON strings, not nested Y types (encoding note).
    expect((ciMap.get("custom_variables") as Y.Map<string>).get("scale")).toBe('{"x":2,"y":2,"z":2}');
    const attrEntry = (ciMap.get("attribute_instance") as Y.Map<Y.Map<unknown>>).get(ATTR_UUID)!;
    expect(attrEntry.get("value")).toBe("original");

    const riMap = ydoc.getMap<Y.Map<unknown>>("relationclasses_instances").get(RI_UUID)!;
    // line_points is a Y.Array of JSON-encoded points.
    expect((riMap.get("line_points") as unknown as Y.Array<string>).toArray()).toEqual([
      '{"x":0,"y":0,"z":0}',
      '{"x":1,"y":1,"z":0}',
    ]);
    // role instances ride along as JSON so remote clients can cascade deletes.
    expect(JSON.parse(riMap.get("role_instance_from") as string).uuid).toBe("role-from");
  });

  it("tags the transaction with the given origin so the local client skips its own echo", () => {
    const origin = {};
    const seen: unknown[] = [];
    ydoc.on("afterTransaction", (tr: Y.Transaction) => seen.push(tr.origin));

    sceneInstanceToYDoc(scene, ydoc, origin);

    expect(seen).toContain(origin);
  });
});

describe("applyLocalChangeToYDoc", () => {
  const origin = {};

  beforeEach(() => sceneInstanceToYDoc(scene, ydoc, origin));

  const ciMap = () => ydoc.getMap<Y.Map<unknown>>("class_instances").get(CI_UUID)!;

  it("writes coordinates", () => {
    applyLocalChangeToYDoc(ydoc, { type: "coordinates", classInstanceUuid: CI_UUID, x: 10, y: 20, z: 30 }, origin);
    const coords = ciMap().get("coordinates_2d") as Y.Map<number>;
    expect([coords.get("x"), coords.get("y"), coords.get("z")]).toEqual([10, 20, 30]);
  });

  it("writes rotation", () => {
    applyLocalChangeToYDoc(ydoc, { type: "rotation", classInstanceUuid: CI_UUID, x: 0.1, y: 0.2, z: 0.3, w: 0.4 }, origin);
    const rot = ciMap().get("rotation") as Y.Map<number>;
    expect([rot.get("x"), rot.get("y"), rot.get("z"), rot.get("w")]).toEqual([0.1, 0.2, 0.3, 0.4]);
  });

  it("writes scale as a JSON string under custom_variables", () => {
    applyLocalChangeToYDoc(ydoc, { type: "scale", classInstanceUuid: CI_UUID, x: 3, y: 3, z: 3 }, origin);
    expect((ciMap().get("custom_variables") as Y.Map<string>).get("scale")).toBe('{"x":3,"y":3,"z":3}');
  });

  it("writes a custom_variable descriptor as JSON", () => {
    const value = { value: 9, user_locked: true };
    applyLocalChangeToYDoc(ydoc, { type: "custom_variable", classInstanceUuid: CI_UUID, key: "pos_name_x", value }, origin);
    expect((ciMap().get("custom_variables") as Y.Map<string>).get("pos_name_x")).toBe(JSON.stringify(value));
  });

  it("writes an attribute value", () => {
    applyLocalChangeToYDoc(ydoc, { type: "attribute_value", classInstanceUuid: CI_UUID, attributeUuid: ATTR_UUID, value: "edited" }, origin);
    const entry = (ciMap().get("attribute_instance") as Y.Map<Y.Map<unknown>>).get(ATTR_UUID)!;
    expect(entry.get("value")).toBe("edited");
  });

  it("adds and removes a class instance", () => {
    const added = ClassInstance.fromJS(classInstanceJson({ uuid: "ci-new", name: "New" })) as ClassInstance;
    applyLocalChangeToYDoc(ydoc, { type: "add_class_instance", classInstance: added }, origin);
    expect(ydoc.getMap("class_instances").has("ci-new")).toBe(true);

    applyLocalChangeToYDoc(ydoc, { type: "remove_class_instance", classInstanceUuid: "ci-new" }, origin);
    expect(ydoc.getMap("class_instances").has("ci-new")).toBe(false);
  });

  it("adds and removes a relationclass instance", () => {
    const added = RelationclassInstance.fromJS(relationInstanceJson({ uuid: "ri-new" })) as RelationclassInstance;
    applyLocalChangeToYDoc(ydoc, { type: "add_relation_class_instance", relationClassInstance: added }, origin);
    expect(ydoc.getMap("relationclasses_instances").has("ri-new")).toBe(true);

    applyLocalChangeToYDoc(ydoc, { type: "remove_relation_class_instance", relationClassInstanceUuid: "ri-new" }, origin);
    expect(ydoc.getMap("relationclasses_instances").has("ri-new")).toBe(false);
  });

  it("writes a relation attribute value", () => {
    applyLocalChangeToYDoc(
      ydoc,
      { type: "relation_attribute_value", relationClassInstanceUuid: RI_UUID, attributeUuid: "rel-attr-1", value: "rel edited" },
      origin,
    );
    const riMap = ydoc.getMap<Y.Map<unknown>>("relationclasses_instances").get(RI_UUID)!;
    expect((riMap.get("attribute_instance") as Y.Map<Y.Map<unknown>>).get("rel-attr-1")!.get("value")).toBe("rel edited");
  });

  it("writes a scene attribute value", () => {
    applyLocalChangeToYDoc(
      ydoc,
      { type: "scene_attribute_value", attributeUuid: SCENE_ATTR_UUID, value: "scene edited" },
      origin,
    );
    const entry = ydoc.getMap<Y.Map<unknown>>("attribute_instances").get(SCENE_ATTR_UUID)!;
    expect(entry.get("value")).toBe("scene edited");
  });

  it("adds scene attribute instances without replacing ones already in the doc", () => {
    const existing = ydoc.getMap<Y.Map<unknown>>("attribute_instances").get(SCENE_ATTR_UUID)!;
    const added = AttributeInstance.fromJS(
      sceneAttributeJson({ uuid: "scene-attr-2", uuid_attribute: "meta-attr-scene-2", name: "Name", value: "a model" }),
    ) as AttributeInstance;

    applyLocalChangeToYDoc(ydoc, { type: "add_scene_attribute_instances", attributeInstances: [added] }, origin);

    const map = ydoc.getMap<Y.Map<unknown>>("attribute_instances");
    expect(map.get("scene-attr-2")!.get("value")).toBe("a model");
    // the entry that was already there is left as it is (idempotent re-run)
    expect(map.get(SCENE_ATTR_UUID)).toBe(existing);
  });

  it("is a no-op for an unknown class instance instead of throwing", () => {
    expect(() =>
      applyLocalChangeToYDoc(ydoc, { type: "coordinates", classInstanceUuid: "nope", x: 1, y: 1, z: 1 }, origin),
    ).not.toThrow();
  });

  it("is a no-op for an unknown scene attribute instead of throwing", () => {
    expect(() =>
      applyLocalChangeToYDoc(ydoc, { type: "scene_attribute_value", attributeUuid: "nope", value: "x" }, origin),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// The real round-trip: doc A -> doc B (as the sync server would relay), then the
// remote-origin events are folded into B's SceneInstance + THREE.Scene.
// ---------------------------------------------------------------------------

/**
 * Relay updates from `from` into `to` (what the sync server does) and collect the deep
 * events observed on `to`'s `mapName` map, applying each through `apply`.
 */
function relayAndApply(
  from: Y.Doc,
  to: Y.Doc,
  mapName: "class_instances" | "relationclasses_instances" | "attribute_instances",
  apply: (event: Y.YEvent<Y.Map<unknown>>) => void,
) {
  const map = to.getMap<Y.Map<unknown>>(mapName);
  map.observeDeep((events) => events.forEach(apply));
  Y.applyUpdate(to, Y.encodeStateAsUpdate(from));
}

describe("applyYDocClassChangeToSceneInstance", () => {
  let docB: Y.Doc;
  let sceneB: SceneInstance;

  beforeEach(() => {
    // Doc A holds the shared scene; doc B is another client that already has it.
    sceneInstanceToYDoc(scene, ydoc, {});
    docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));
    sceneB = makeScene();
  });

  const applyTo = (event: Y.YEvent<Y.Map<unknown>>) =>
    applyYDocClassChangeToSceneInstance(event, sceneB, threeScene, globalObjectInstance);

  it("mirrors a remote coordinate change onto the gds instance and the THREE object", () => {
    const mesh = new THREE.Mesh();
    Object.defineProperty(mesh, "uuid", { value: CI_UUID });
    threeScene.add(mesh);

    relayAndApply(ydoc, docB, "class_instances", applyTo);
    applyLocalChangeToYDoc(ydoc, { type: "coordinates", classInstanceUuid: CI_UUID, x: 7, y: 8, z: 9 }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    const ci = sceneB.class_instances.find((c) => c.uuid === CI_UUID)!;
    expect([ci.coordinates_2d.x, ci.coordinates_2d.y, ci.coordinates_2d.z]).toEqual([7, 8, 9]);
    expect([mesh.position.x, mesh.position.y, mesh.position.z]).toEqual([7, 8, 9]);
  });

  it("mirrors a remote rotation change onto the gds instance and the THREE quaternion", () => {
    const mesh = new THREE.Mesh();
    Object.defineProperty(mesh, "uuid", { value: CI_UUID });
    threeScene.add(mesh);

    relayAndApply(ydoc, docB, "class_instances", applyTo);
    applyLocalChangeToYDoc(ydoc, { type: "rotation", classInstanceUuid: CI_UUID, x: 0, y: 0, z: 1, w: 0 }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    const ci = sceneB.class_instances.find((c) => c.uuid === CI_UUID)!;
    expect([ci.rotation.x, ci.rotation.y, ci.rotation.z, ci.rotation.w]).toEqual([0, 0, 1, 0]);
    expect(mesh.quaternion.z).toBe(1);
  });

  it("reports a remote attribute change so the caller can refresh the vizrep", () => {
    relayAndApply(ydoc, docB, "class_instances", (event) => {
      const result = applyTo(event);
      if (result.changedAttributeInstances.length > 0) {
        expect(result.changedAttributeInstances[0].uuid).toBe(ATTR_UUID);
      }
    });
    applyLocalChangeToYDoc(ydoc, { type: "attribute_value", classInstanceUuid: CI_UUID, attributeUuid: ATTR_UUID, value: "remote edit" }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    const ci = sceneB.class_instances.find((c) => c.uuid === CI_UUID)!;
    expect(ci.attribute_instance.find((a) => a.uuid === ATTR_UUID)!.value).toBe("remote edit");
  });

  it("applies a remote scale from custom_variables to the THREE object", () => {
    const mesh = new THREE.Mesh();
    Object.defineProperty(mesh, "uuid", { value: CI_UUID });
    threeScene.add(mesh);

    relayAndApply(ydoc, docB, "class_instances", applyTo);
    applyLocalChangeToYDoc(ydoc, { type: "scale", classInstanceUuid: CI_UUID, x: 4, y: 4, z: 4 }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    expect([mesh.scale.x, mesh.scale.y, mesh.scale.z]).toEqual([4, 4, 4]);
    const ci = sceneB.class_instances.find((c) => c.uuid === CI_UUID)!;
    expect((ci.custom_variables as Record<string, unknown>).scale).toEqual({ x: 4, y: 4, z: 4 });
  });

  it("reconstructs a remotely added class instance as a real gds ClassInstance", () => {
    let added = false;
    relayAndApply(ydoc, docB, "class_instances", (event) => {
      if (applyTo(event).classInstanceAdded) added = true;
    });
    const newCi = ClassInstance.fromJS(classInstanceJson({ uuid: "ci-remote", name: "Remote", attribute_instance: [{ uuid: "attr-remote", uuid_attribute: "meta-attr-1", name: "Name", value: "v" }] })) as ClassInstance;
    applyLocalChangeToYDoc(ydoc, { type: "add_class_instance", classInstance: newCi }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    expect(added).toBe(true);
    const revived = sceneB.class_instances.find((c) => c.uuid === "ci-remote")!;
    // The modeling client relies on instanceof (expression_utility) — a ctor call, not
    // plainToInstance, so the prototype is real (see the module docstring).
    expect(revived).toBeInstanceOf(ClassInstance);
    expect(revived.name).toBe("Remote");
    expect(revived.custom_variables).toEqual({ scale: { x: 2, y: 2, z: 2 }, pos_name_x: { value: 5, user_locked: true } });
    // Its attribute instances are registered in the global flat list.
    expect(globalObjectInstance.attribute_instances.map((a) => a.uuid)).toContain("attr-remote");
  });

  it("removes a remotely deleted class instance from the scene, THREE and dragObjects", () => {
    const mesh = new THREE.Mesh();
    Object.defineProperty(mesh, "uuid", { value: CI_UUID });
    threeScene.add(mesh);
    globalObjectInstance.dragObjects = [mesh];
    globalObjectInstance.tabContext[0].contextDragObjects = [mesh];

    relayAndApply(ydoc, docB, "class_instances", applyTo);
    applyLocalChangeToYDoc(ydoc, { type: "remove_class_instance", classInstanceUuid: CI_UUID }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    expect(sceneB.class_instances.find((c) => c.uuid === CI_UUID)).toBeUndefined();
    expect(threeScene.getObjectByProperty("uuid", CI_UUID)).toBeUndefined();
    expect(globalObjectInstance.dragObjects).toEqual([]);
    expect(globalObjectInstance.tabContext[0].contextDragObjects).toEqual([]);
  });
});

describe("applyYDocRelationChangeToSceneInstance", () => {
  let docB: Y.Doc;
  let sceneB: SceneInstance;

  beforeEach(() => {
    sceneInstanceToYDoc(scene, ydoc, {});
    docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));
    sceneB = makeScene();
  });

  const applyTo = (event: Y.YEvent<Y.Map<unknown>>) =>
    applyYDocRelationChangeToSceneInstance(event, sceneB, threeScene, globalObjectInstance);

  it("applies a remote relation attribute change", () => {
    relayAndApply(ydoc, docB, "relationclasses_instances", applyTo);
    applyLocalChangeToYDoc(
      ydoc,
      { type: "relation_attribute_value", relationClassInstanceUuid: RI_UUID, attributeUuid: "rel-attr-1", value: "remote rel" },
      {},
    );
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    const ri = sceneB.relationclasses_instances.find((r) => r.uuid === RI_UUID)!;
    expect(ri.attribute_instance.find((a) => a.uuid === "rel-attr-1")!.value).toBe("remote rel");
  });

  it("reconstructs a remotely added relation instance with its role instances", () => {
    let added = false;
    relayAndApply(ydoc, docB, "relationclasses_instances", (event) => {
      if (applyTo(event).relationInstanceAdded) added = true;
    });
    const newRi = RelationclassInstance.fromJS(relationInstanceJson({ uuid: "ri-remote" })) as RelationclassInstance;
    applyLocalChangeToYDoc(ydoc, { type: "add_relation_class_instance", relationClassInstance: newRi }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    expect(added).toBe(true);
    const revived = sceneB.relationclasses_instances.find((r) => r.uuid === "ri-remote")!;
    expect(revived).toBeInstanceOf(RelationclassInstance);
    expect(revived.line_points).toEqual([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }]);
    // Role instances are restored (they drive deletion cascades) and registered.
    expect(revived.role_instance_from.uuid).toBe("role-from");
    expect(globalObjectInstance.role_instances.map((r) => r.uuid)).toEqual(["role-from", "role-to"]);
  });

  it("removes a remotely deleted relation instance and its role instances", () => {
    const mesh = new THREE.Mesh();
    Object.defineProperty(mesh, "uuid", { value: RI_UUID });
    threeScene.add(mesh);
    globalObjectInstance.dragObjects = [mesh];
    globalObjectInstance.role_instances = [
      { uuid: "role-from", uuid_relationclass: RI_UUID },
      { uuid: "other", uuid_relationclass: "ri-other" },
    ] as never;

    relayAndApply(ydoc, docB, "relationclasses_instances", applyTo);
    applyLocalChangeToYDoc(ydoc, { type: "remove_relation_class_instance", relationClassInstanceUuid: RI_UUID }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    expect(sceneB.relationclasses_instances.find((r) => r.uuid === RI_UUID)).toBeUndefined();
    expect(threeScene.getObjectByProperty("uuid", RI_UUID)).toBeUndefined();
    expect(globalObjectInstance.dragObjects).toEqual([]);
    // Only the deleted relation's roles go; the unrelated one survives.
    expect(globalObjectInstance.role_instances.map((r) => r.uuid)).toEqual(["other"]);
  });
});

describe("applyYDocSceneAttributeChangeToSceneInstance", () => {
  let docB: Y.Doc;
  let sceneB: SceneInstance;

  beforeEach(() => {
    sceneInstanceToYDoc(scene, ydoc, {});
    docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));
    sceneB = makeScene();
  });

  const applyTo = (event: Y.YEvent<Y.Map<unknown>>) =>
    applyYDocSceneAttributeChangeToSceneInstance(event, sceneB, globalObjectInstance);

  it("applies a peer's edit of the scene instance's own attribute", () => {
    const changed: string[] = [];
    relayAndApply(ydoc, docB, "attribute_instances", (event) => {
      applyTo(event).changedAttributeInstances.forEach((ai) => changed.push(ai.uuid));
    });
    applyLocalChangeToYDoc(ydoc, { type: "scene_attribute_value", attributeUuid: SCENE_ATTR_UUID, value: "remote scene edit" }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    expect(sceneB.attribute_instances.find((a) => a.uuid === SCENE_ATTR_UUID)!.value).toBe("remote scene edit");
    // reported so the caller can refresh the vizrep, exactly like a class attribute
    expect(changed).toEqual([SCENE_ATTR_UUID]);
  });

  it("adopts scene attributes a peer instantiated, parented by the scene", () => {
    // The receiving client's scene does not have them yet.
    sceneB.attribute_instances = [];
    relayAndApply(ydoc, docB, "attribute_instances", applyTo);

    const added = AttributeInstance.fromJS(
      sceneAttributeJson({ uuid: "scene-attr-2", uuid_attribute: "meta-attr-scene-2", name: "Name", value: "a model" }),
    ) as AttributeInstance;
    applyLocalChangeToYDoc(ydoc, { type: "add_scene_attribute_instances", attributeInstances: [added] }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    const adopted = sceneB.attribute_instances.find((a) => a.uuid === "scene-attr-2")!;
    expect(adopted).toBeInstanceOf(AttributeInstance);
    expect(adopted.name).toBe("Name");
    expect(adopted.value).toBe("a model");
    // parented by the SCENE — how the attribute window and the vizrep checker find it
    expect(adopted.assigned_uuid_scene_instance).toBe(SCENE_UUID);
    expect(adopted.assigned_uuid_class_instance).toBeNull();
    // and registered in the flat list the vizrep pipeline / undo history read
    expect(globalObjectInstance.attribute_instances.map((a) => a.uuid)).toContain("scene-attr-2");
  });

  it("does not adopt an attribute the scene already holds", () => {
    relayAndApply(ydoc, docB, "attribute_instances", applyTo);

    const duplicate = AttributeInstance.fromJS(sceneAttributeJson({ value: "other" })) as AttributeInstance;
    applyLocalChangeToYDoc(ydoc, { type: "add_scene_attribute_instances", attributeInstances: [duplicate] }, {});
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(ydoc));

    expect(sceneB.attribute_instances.filter((a) => a.uuid === SCENE_ATTR_UUID)).toHaveLength(1);
  });
});
