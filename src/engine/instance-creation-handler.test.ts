// P5 unit tests for the instance-creation handler — proves that creating a class
// instance produces a gds-VALID `ClassInstance` (real prototype, uuid, coordinates,
// meta name) with its metamodel attributes propagated as attribute instances, and
// that the modeling-only `sceneInstanceMutated` event fires (SimulationWindow, P12).
//
// global-definition + graphic-context + the two utilities are faked (the real
// global-definition builds a WebGLRenderer, the real graphic-context pulls in troika
// — neither is needed here). gds fixtures are REAL via fromJS. eventBus is REAL so we
// can assert the publish. Node env: no THREE renderer is constructed.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Class, SceneInstance, ClassInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {
    attribute_instances: [] as unknown[],
    role_instances: [] as unknown[],
    current_class_instance: undefined as unknown,
    current_port_instance: undefined as unknown,
    render: false,
    selectedTab: 0,
    tabContext: [] as unknown[],
  },
  metaUtility: {
    getMetaClass: vi.fn(),
    getMetaRelationclass: vi.fn(),
    getMetaPort: vi.fn(),
    parseMetaFunction: vi.fn(async () => () => ({})),
  },
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(),
    getClassInstance: vi.fn(),
    getSceneInstance: vi.fn(),
    getPortInstance: vi.fn(),
  },
  graphicContext: {
    resetInstance: vi.fn(),
    runVizRepFunction: vi.fn(),
    drawVizRep: vi.fn(),
  },
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine/graphic-context", () => ({ graphicContext: mocks.graphicContext, GraphicContext: class {} }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));

const { instanceCreationHandler } = await import("./instance-creation-handler");
const { eventBus } = await import("@/resources/services/event-bus");

const CLASS_META_UUID = "88888888-8888-4888-8888-888888888888";
const ATTR_UUID = "77777777-7777-4777-8777-777777777777";
const SCENE_UUID = "99999999-9999-4999-8999-999999999999";

/** A metaclass with exactly one non-table attribute and no ports. */
function makeMetaClass(): Class {
  return Class.fromJS({
    uuid: CLASS_META_UUID,
    name: "MyClass",
    geometry: "function vizRep(gc){}",
    attributes: [
      {
        uuid: ATTR_UUID,
        name: "Label",
        default_value: "hello",
        attribute_type: { uuid: "at-1", name: "String", has_table_attribute: [] },
      },
    ],
    ports: [],
  }) as Class;
}

function makeScene(): SceneInstance {
  return SceneInstance.fromJS({
    uuid: SCENE_UUID,
    name: "scene",
    uuid_scene_type: "st-1",
    class_instances: [],
    relationclasses_instances: [],
    port_instances: [],
    attribute_instances: [],
  }) as SceneInstance;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let sceneInstance: SceneInstance;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.globalObject.attribute_instances = [];
  mocks.globalObject.role_instances = [];
  sceneInstance = makeScene();
  mocks.metaUtility.getMetaClass.mockResolvedValue(makeMetaClass());
  mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
  // resolve the attribute's owner back to the instance the scene actually holds
  mocks.instanceUtility.getClassInstance.mockImplementation(async (uuid: string) => sceneInstance.class_instances.find((ci) => ci.uuid === uuid));
});

describe("InstanceCreationHandler.createClassInstance", () => {
  it("creates a gds-valid ClassInstance at the given position", async () => {
    const ci = await instanceCreationHandler.createClassInstance("ci-1", 1.2, -3.4, 0, CLASS_META_UUID, "class");

    expect(ci).toBeInstanceOf(ClassInstance);
    expect(ci.uuid).toBe("ci-1");
    expect(ci.uuid_class).toBe(CLASS_META_UUID);
    expect(ci.coordinates_2d).toEqual({ x: 1.2, y: -3.4, z: 0 });
    // modeling delta: bare meta name (the metamodeling twin appends the uuid)
    expect(ci.name).toBe("MyClass");
    // added to the tab's scene instance
    expect(sceneInstance.class_instances).toContain(ci);
  });

  it("propagates the metamodel attributes as attribute instances", async () => {
    const ci = await instanceCreationHandler.createClassInstance("ci-2", 0, 0, 0, CLASS_META_UUID, "class");
    // attribute creation is fire-and-forget inside the loop; let the microtasks run
    await flush();

    expect(ci.attribute_instance).toHaveLength(1);
    expect(ci.attribute_instance[0].uuid_attribute).toBe(ATTR_UUID);
    expect(ci.attribute_instance[0].value).toBe("hello");
    // also registered in the global attribute-instance list
    expect(mocks.globalObject.attribute_instances).toHaveLength(1);
  });

  it("publishes sceneInstanceMutated for the active scene", async () => {
    const seen: Array<{ sceneInstanceUuid: string; action?: string }> = [];
    const sub = eventBus.subscribe("sceneInstanceMutated", (p) => seen.push(p));

    await instanceCreationHandler.createClassInstance("ci-3", 0, 0, 0, CLASS_META_UUID, "class");
    sub.dispose();

    expect(seen).toHaveLength(1);
    expect(seen[0].sceneInstanceUuid).toBe(SCENE_UUID);
    expect(seen[0].action).toBe("added");
  });
});
