// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AttributeInstance, ClassInstance } from "@gds";

/**
 * P4 tests for the vizrep-update-checker's two event-bus channels (plan §5 +
 * §9 P4 "Done when: vizrep-update-checker reacts to the two bus channels").
 *
 * global-definition is faked (WebGLRenderer at module scope, see P3 note); the
 * graphic-context and the two utility singletons are mocked so we assert the
 * checker's ORCHESTRATION (which geometry string gets run, whether the vizrep is
 * refreshed at all, and the readyForVizRepUpdate lock) rather than re-testing the
 * drawing itself, which graphic-context.test.ts covers.
 */

const fakeGlobal = vi.hoisted(() => ({
  globalObject: {
    readyForVizRepUpdate: true,
    current_class_instance: null as unknown,
    selectedTab: 0,
    tabContext: [] as { sceneInstance: unknown }[],
  },
}));
vi.mock("@/engine/global-definition", () => fakeGlobal);

const gcMock = vi.hoisted(() => ({
  graphicContext: {
    current_instance_object: null as unknown,
    resetInstance: vi.fn(),
    runVizRepFunction: vi.fn(async () => {}),
    updateVizRep: vi.fn(async () => {}),
  },
}));
vi.mock("@/engine/graphic-context", () => gcMock);

const CLASS_INSTANCE_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const META_CLASS_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ATTR_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// Geometry that DOES reference the meta attribute's name ("label") -> must redraw.
const GEOMETRY_REFERENCING_ATTR = "async function vizRep(gc) { await gc.graphic_text(0,0,0,0.1,'black', await gc.expression.attrval('label')); }";
// Geometry that references neither the attribute name nor its uuid -> must NOT redraw.
const GEOMETRY_IGNORING_ATTR = "async function vizRep(gc) { await gc.graphic_sphere(0.05, 10, 10, 'black'); }";

const utils = vi.hoisted(() => ({
  instanceUtility: {
    getAllRelationClassInstances: vi.fn(async () => [] as unknown[]),
    getClassInstance: vi.fn(),
    getPortInstance: vi.fn(),
    getSceneInstance: vi.fn(),
    getAllAttributeInstancesFromObjectInstanceRecursively: vi.fn(async () => [] as unknown[]),
  },
  metaUtility: {
    getMetaClass: vi.fn(),
    getMetaRelationclass: vi.fn(),
    getMetaPort: vi.fn(),
    getSceneTypeByUUID: vi.fn(),
    getMetaAttribute: vi.fn(),
  },
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: utils.instanceUtility }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: utils.metaUtility }));

const { eventBus } = await import("@/resources/services/event-bus");
// Importing the module constructs the singleton, which is what subscribes the bus.
const { vizrepUpdateChecker } = await import("@/engine/vizrep-update-checker");

function makeClassInstance(): ClassInstance {
  return ClassInstance.fromJS({
    uuid: CLASS_INSTANCE_UUID,
    name: "inst",
    uuid_class: META_CLASS_UUID,
    coordinates_2d: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    custom_variables: {},
    attribute_instances: [],
    port_instances: [],
  }) as ClassInstance;
}

function makeAttributeInstance(): AttributeInstance {
  return AttributeInstance.fromJS({
    uuid: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    uuid_attribute: ATTR_UUID,
    assigned_uuid_class_instance: CLASS_INSTANCE_UUID,
    value: "new value",
  }) as AttributeInstance;
}

/** The bus dispatches synchronously but the handler is async — let it settle. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  fakeGlobal.globalObject.readyForVizRepUpdate = true;
  fakeGlobal.globalObject.current_class_instance = null;
  utils.instanceUtility.getAllRelationClassInstances.mockResolvedValue([]);
  utils.instanceUtility.getClassInstance.mockResolvedValue(makeClassInstance());
  utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_REFERENCING_ATTR });
  utils.metaUtility.getMetaAttribute.mockResolvedValue({ name: "label" });
});

describe("checkForVizRepUpdate", () => {
  it("re-runs and updates the vizrep when the geometry references the changed attribute", async () => {
    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledWith(GEOMETRY_REFERENCING_ATTR);
    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledTimes(1);
    // The instance must be the one the vizrep code will read its values from.
    expect((gcMock.graphicContext.updateVizRep.mock.calls[0] as unknown[])[0]).toMatchObject({ uuid: CLASS_INSTANCE_UUID });
    expect(fakeGlobal.globalObject.current_class_instance).toMatchObject({ uuid: CLASS_INSTANCE_UUID });
  });

  it("skips the redraw when the geometry does not reference the changed attribute", async () => {
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: GEOMETRY_IGNORING_ATTR });

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(gcMock.graphicContext.runVizRepFunction).not.toHaveBeenCalled();
    expect(gcMock.graphicContext.updateVizRep).not.toHaveBeenCalled();
  });

  it("matches on the attribute uuid too, not only its name", async () => {
    utils.metaUtility.getMetaClass.mockResolvedValue({ geometry: `async function vizRep(gc) { await gc.dynval('${ATTR_UUID}', 'x'); }` });
    // A meta attribute the server has no name for must not break uuid matching.
    utils.metaUtility.getMetaAttribute.mockResolvedValue(undefined);

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledTimes(1);
  });

  it("drops non-user_locked custom variables so the vizrep can recompute them", async () => {
    const instance = makeClassInstance();
    (instance.custom_variables as Record<string, unknown>).free = { value: 1, instance_adaptable: true, user_locked: false };
    (instance.custom_variables as Record<string, unknown>).pinned = { value: 2, instance_adaptable: true, user_locked: true };
    utils.instanceUtility.getClassInstance.mockResolvedValue(instance);

    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());

    // A variable the user moved by hand (user_locked) must survive the redraw.
    expect(instance.custom_variables).not.toHaveProperty("free");
    expect(instance.custom_variables).toHaveProperty("pinned");
  });

  it("releases the readyForVizRepUpdate lock when finished", async () => {
    await vizrepUpdateChecker.checkForVizRepUpdate(makeAttributeInstance());
    expect(fakeGlobal.globalObject.readyForVizRepUpdate).toBe(true);
  });
});

describe("event-bus channels", () => {
  it("'checkForVizRepUpdateByAttributeInstance' redraws the payload's instance", async () => {
    eventBus.publish("checkForVizRepUpdateByAttributeInstance", makeAttributeInstance());
    await flush();

    expect(gcMock.graphicContext.runVizRepFunction).toHaveBeenCalledWith(GEOMETRY_REFERENCING_ATTR);
    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledTimes(1);
  });

  it("'checkForVizRepUpdate' sweeps every attribute instance of the open scene", async () => {
    const attributeInstance = makeAttributeInstance();
    fakeGlobal.globalObject.tabContext = [{ sceneInstance: { attribute_instances: [attributeInstance] } }];

    eventBus.publish("checkForVizRepUpdate");
    await flush();

    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates a sweep by class instance so each instance is redrawn once", async () => {
    // Two attributes on the SAME class instance -> a single redraw.
    fakeGlobal.globalObject.tabContext = [{ sceneInstance: { attribute_instances: [makeAttributeInstance(), makeAttributeInstance()] } }];

    await vizrepUpdateChecker.checkForVisualizationUpdate();

    expect(gcMock.graphicContext.updateVizRep).toHaveBeenCalledTimes(1);
  });
});
