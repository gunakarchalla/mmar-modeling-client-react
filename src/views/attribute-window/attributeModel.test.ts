// P8 unit tests for the attribute-window data model (the old `updater()`):
// grouping into plain / table / reference, sequence sorting, facet parsing, the
// File-attribute-type scan, and the fieldChange side effects.
//
// `@/engine` is mocked (the real barrel builds a WebGLRenderer at module scope — see
// the P3/P4 test-pattern note); gds fixtures are REAL, revived via `X.fromJS` so the
// nested @Type props deep-revive (the P3 class-transformer rule).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AttributeInstance, ClassInstance, PortInstance, SceneInstance } from "@gds";
import { FILE_ATTRIBUTE_TYPE_UUID } from "@/constants";

const mocks = vi.hoisted(() => ({
  globalObject: {
    selectedTab: 0,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
  } as any,
  globalSelectedObject: { getObject: vi.fn() },
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(),
    getAllPortInstancesOfTabContext: vi.fn(async () => [] as PortInstance[]),
    getClassInstance: vi.fn(),
    getPortInstance: vi.fn(),
    getSceneInstance: vi.fn(),
  },
  metaUtility: {
    getMetaAttribute: vi.fn(),
    getMetaAttributeWithSequence: vi.fn(),
  },
  // P10: attributeModel now imports shared-doc-service, which imports the REAL
  // @/engine/global-definition (a WebGLRenderer at module scope). Mocking the barrel
  // alone is not enough — mock the service too, the same way P9's TopNavBar test had
  // to mock persistency-handler.
  sharedDocService: {
    forTab: vi.fn((_tabIndex: number) => null as null | { ydoc: unknown; localOrigin: object; applyingRemote: boolean }),
  },
  applyLocalChangeToYDoc: vi.fn(),
}));

vi.mock("@/engine", () => ({
  globalObject: mocks.globalObject,
  globalSelectedObject: mocks.globalSelectedObject,
}));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));
vi.mock("@/resources/collaboration/y-mapping", () => ({ applyLocalChangeToYDoc: mocks.applyLocalChangeToYDoc }));

import { buildAttributeGroups, applyFieldChange, emptyAttributeGroups, type AttributeOwner } from "./attributeModel";
import { eventBus } from "@/resources/services/event-bus";

const CLASS_INSTANCE_UUID = "ci-1";
const CLASS_UUID = "class-1";

/**
 * A meta attribute, shaped as the server sends it. Not revived into a gds `Attribute`
 * on purpose: the code only reads plain fields off it, and building the whole
 * AttributeType/Role graph would add nothing to what these tests check.
 */
function metaAttribute(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "attr-1",
    name: "Name",
    sequence: 1,
    ui_component: "text",
    facets: "",
    default_value: "",
    attribute_type: { uuid: "at-string", name: "String", regex_value: "^.*$", role: null, has_table_attribute: [] },
    ...overrides,
  };
}

/**
 * Build the scene from PLAIN json and read the revived child back out — passing a
 * pre-built gds child into SceneInstance.fromJS gives you a scene holding a COPY
 * (the P4 fixture trap).
 */
function makeSceneWithClassInstance(attributeInstances: Record<string, unknown>[]): {
  sceneInstance: SceneInstance;
  classInstance: ClassInstance;
} {
  const sceneInstance = SceneInstance.fromJS({
    uuid: "si-1",
    uuid_scene_type: "st-1",
    name: "scene",
    class_instances: [
      {
        uuid: CLASS_INSTANCE_UUID,
        uuid_class: CLASS_UUID,
        name: "Task",
        attribute_instance: attributeInstances,
      },
    ],
    relationclasses_instances: [],
  }) as SceneInstance;
  return { sceneInstance, classInstance: sceneInstance.class_instances[0] };
}

function attributeInstanceJson(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "ai-1",
    uuid_attribute: "attr-1",
    assigned_uuid_class_instance: CLASS_INSTANCE_UUID,
    value: "hello",
    name: "Name",
    table_attributes: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    doSceneInstancePatch: false,
    doSceneInstancePatchLocal: false,
  });
  mocks.instanceUtility.getAllPortInstancesOfTabContext.mockResolvedValue([]);
  mocks.instanceUtility.getPortInstance.mockResolvedValue(undefined);
  mocks.instanceUtility.getSceneInstance.mockResolvedValue(undefined);
  mocks.metaUtility.getMetaAttribute.mockResolvedValue(metaAttribute());
  mocks.metaUtility.getMetaAttributeWithSequence.mockResolvedValue(metaAttribute());
  // Default: the active tab is not shared (clearAllMocks drops the implementation).
  mocks.sharedDocService.forTab.mockReturnValue(null);
});

describe("buildAttributeGroups", () => {
  it("returns the reset state when nothing is selected", async () => {
    mocks.globalSelectedObject.getObject.mockReturnValue(undefined);

    const groups = await buildAttributeGroups();

    expect(groups).toEqual(emptyAttributeGroups());
    expect(mocks.instanceUtility.getTabContextSceneInstance).not.toHaveBeenCalled();
  });

  it("resolves the selected mesh to its class instance and groups a plain attribute", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([attributeInstanceJson()]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);

    const groups = await buildAttributeGroups();

    expect(groups.currentClassInstance).toBe(classInstance);
    expect(groups.currentClassInstance).toBeInstanceOf(ClassInstance);
    expect(groups.plain).toHaveLength(1);
    expect(groups.plain[0].attributeInstance).toBeInstanceOf(AttributeInstance);
    expect(groups.plain[0].uiType).toBe("text");
    expect(groups.table).toHaveLength(0);
    expect(groups.reference).toHaveLength(0);
  });

  it("sorts by the meta attribute's sequence, defaulting a missing sequence to 1000", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([
      attributeInstanceJson({ uuid: "ai-last", uuid_attribute: "attr-no-seq" }),
      attributeInstanceJson({ uuid: "ai-mid", uuid_attribute: "attr-seq-5" }),
      attributeInstanceJson({ uuid: "ai-first", uuid_attribute: "attr-seq-1" }),
    ]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
    mocks.metaUtility.getMetaAttributeWithSequence.mockImplementation(async (uuid: string) => {
      if (uuid === "attr-seq-1") return metaAttribute({ sequence: 1 });
      if (uuid === "attr-seq-5") return metaAttribute({ sequence: 5 });
      return metaAttribute({ sequence: undefined }); // -> 1000
    });

    const groups = await buildAttributeGroups();

    expect(groups.plain.map((e) => e.attributeInstance.uuid)).toEqual(["ai-first", "ai-mid", "ai-last"]);
    expect(groups.plain[2].sequence).toBe(1000);
  });

  it("splits table and reference attributes out of the plain group", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([
      attributeInstanceJson({ uuid: "ai-plain", uuid_attribute: "attr-plain" }),
      attributeInstanceJson({
        uuid: "ai-table",
        uuid_attribute: "attr-table",
        table_attributes: [attributeInstanceJson({ uuid: "cell-1", table_row: 1 })],
      }),
      attributeInstanceJson({ uuid: "ai-ref", uuid_attribute: "attr-ref" }),
    ]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
    // A reference attribute is one whose attribute_type carries a Role.
    const withRole = metaAttribute({
      attribute_type: { uuid: "at-ref", regex_value: "^.*$", role: { uuid: "role-1" }, has_table_attribute: [] },
    });
    mocks.metaUtility.getMetaAttribute.mockImplementation(async (uuid: string) =>
      uuid === "attr-ref" ? withRole : metaAttribute(),
    );

    const groups = await buildAttributeGroups();

    expect(groups.plain.map((e) => e.attributeInstance.uuid)).toEqual(["ai-plain"]);
    expect(groups.table.map((e) => e.attributeInstance.uuid)).toEqual(["ai-table"]);
    expect(groups.reference.map((e) => e.attributeInstance.uuid)).toEqual(["ai-ref"]);
  });

  it("parses facets from the meta attribute only when the attribute type has a regex", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([
      attributeInstanceJson({ uuid: "ai-drop", uuid_attribute: "attr-drop" }),
      attributeInstanceJson({ uuid: "ai-noregex", uuid_attribute: "attr-noregex" }),
    ]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
    mocks.metaUtility.getMetaAttributeWithSequence.mockImplementation(async (uuid: string) => {
      if (uuid === "attr-drop") {
        return metaAttribute({ sequence: 1, ui_component: "Dropdown", facets: "catching|throwing|boundary" });
      }
      // facets present but the type has no regex_value -> the old code ignores them
      return metaAttribute({
        sequence: 2,
        facets: "a|b",
        attribute_type: { uuid: "at-x", regex_value: null, role: null, has_table_attribute: [] },
      });
    });

    const groups = await buildAttributeGroups();

    expect(groups.plain[0].facets).toEqual(["catching", "throwing", "boundary"]);
    expect(groups.plain[0].uiType).toBe("Dropdown");
    expect(groups.plain[1].facets).toEqual([]);
  });

  it("flags attribute instances whose meta attribute is of the File attribute type", async () => {
    const { sceneInstance, classInstance } = makeSceneWithClassInstance([
      attributeInstanceJson({ uuid: "ai-file", uuid_attribute: "attr-file" }),
      attributeInstanceJson({ uuid: "ai-text", uuid_attribute: "attr-text" }),
    ]);
    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: CLASS_INSTANCE_UUID });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(classInstance);
    mocks.metaUtility.getMetaAttribute.mockImplementation(async (uuid: string) =>
      uuid === "attr-file"
        ? metaAttribute({
            attribute_type: {
              uuid: FILE_ATTRIBUTE_TYPE_UUID,
              regex_value: "^.*$",
              role: null,
              has_table_attribute: [],
            },
          })
        : metaAttribute(),
    );

    const groups = await buildAttributeGroups();

    expect(groups.fileTypeUuids).toEqual(["ai-file"]);
  });

  it("reads a port instance's attributes when the selection is a port", async () => {
    const sceneInstance = SceneInstance.fromJS({
      uuid: "si-1",
      uuid_scene_type: "st-1",
      class_instances: [],
      relationclasses_instances: [],
    }) as SceneInstance;
    const portInstance = PortInstance.fromJS({
      uuid: "pi-1",
      uuid_port: "port-1",
      name: "Port",
      attribute_instances: [attributeInstanceJson({ uuid: "ai-port", assigned_uuid_class_instance: undefined, assigned_uuid_port_instance: "pi-1" })],
    }) as PortInstance;

    mocks.globalSelectedObject.getObject.mockReturnValue({ uuid: "pi-1" });
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(sceneInstance);
    mocks.instanceUtility.getAllPortInstancesOfTabContext.mockResolvedValue([portInstance]);
    mocks.instanceUtility.getClassInstance.mockResolvedValue(undefined);
    mocks.instanceUtility.getPortInstance.mockResolvedValue(portInstance);

    const groups = await buildAttributeGroups();

    expect(groups.currentPortInstance).toBe(portInstance);
    expect(groups.plain.map((e) => e.attributeInstance.uuid)).toEqual(["ai-port"]);
    // resolved through the port's meta port, not a meta class
    expect(mocks.metaUtility.getMetaAttributeWithSequence).toHaveBeenCalledWith("attr-1", "port-1");
  });
});

describe("applyFieldChange", () => {
  const classInstance = ClassInstance.fromJS({ uuid: CLASS_INSTANCE_UUID, uuid_class: CLASS_UUID }) as ClassInstance;

  const ownerOf = (over: Partial<AttributeOwner> = {}): AttributeOwner => ({
    currentClassInstance: null,
    currentPortInstance: null,
    currentRelationclassInstance: null,
    ...over,
  });

  it("stringifies the value, publishes the vizrep channel and flags the scene dirty", async () => {
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson({ value: "new value" })) as AttributeInstance;
    const received: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (payload) =>
      received.push(payload),
    );

    await applyFieldChange(attributeInstance, ownerOf({ currentClassInstance: classInstance }));
    sub.dispose();

    expect(received).toEqual([attributeInstance]);
    expect(mocks.globalObject.doSceneInstancePatch).toBe(true);
    // Not shared -> no Yjs write and the local-patch flag stays untouched.
    expect(mocks.applyLocalChangeToYDoc).not.toHaveBeenCalled();
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(false);
  });

  // --- P10: the shared branch, now reachable ------------------------------------

  it("writes an attribute_value change to the YDoc and sets the local flag when shared", async () => {
    const session = { ydoc: { fake: "ydoc" }, localOrigin: {}, applyingRemote: false };
    mocks.sharedDocService.forTab.mockReturnValue(session);
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson({ value: "shared value" })) as AttributeInstance;

    await applyFieldChange(attributeInstance, ownerOf({ currentClassInstance: classInstance }));

    expect(mocks.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      {
        type: "attribute_value",
        classInstanceUuid: CLASS_INSTANCE_UUID,
        attributeUuid: attributeInstance.uuid,
        value: "shared value",
      },
      session.localOrigin,
    );
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(true);
    // The shared branch must NOT use the non-shared flag (they drive different saves).
    expect(mocks.globalObject.doSceneInstancePatch).toBe(false);
  });

  it("uses relation_attribute_value when a relationclass instance owns the attribute", async () => {
    const session = { ydoc: { fake: "ydoc" }, localOrigin: {}, applyingRemote: false };
    mocks.sharedDocService.forTab.mockReturnValue(session);
    const relationclassInstance = { uuid: "ri-1" } as any;
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson({ value: "rel value" })) as AttributeInstance;

    await applyFieldChange(attributeInstance, ownerOf({ currentRelationclassInstance: relationclassInstance }));

    expect(mocks.applyLocalChangeToYDoc).toHaveBeenCalledWith(
      session.ydoc,
      {
        type: "relation_attribute_value",
        relationClassInstanceUuid: "ri-1",
        attributeUuid: attributeInstance.uuid,
        value: "rel value",
      },
      session.localOrigin,
    );
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(true);
  });

  it("ignores a change that is being applied from a remote update (no echo)", async () => {
    mocks.sharedDocService.forTab.mockReturnValue({ ydoc: {}, localOrigin: {}, applyingRemote: true });
    const attributeInstance = AttributeInstance.fromJS(attributeInstanceJson({ value: "echo" })) as AttributeInstance;
    const received: AttributeInstance[] = [];
    const sub = eventBus.subscribe("checkForVizRepUpdateByAttributeInstance", (payload) => received.push(payload));

    await applyFieldChange(attributeInstance, ownerOf({ currentClassInstance: classInstance }));
    sub.dispose();

    expect(received).toEqual([]);
    expect(mocks.applyLocalChangeToYDoc).not.toHaveBeenCalled();
    expect(mocks.globalObject.doSceneInstancePatchLocal).toBe(false);
    expect(mocks.globalObject.doSceneInstancePatch).toBe(false);
  });
});
