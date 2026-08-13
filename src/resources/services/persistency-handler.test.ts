// @vitest-environment jsdom
//
// P7 unit tests for persistency-handler (plan §7: persist path + saveToTextfile).
// The handler reads the engine god object + several sibling services; importing the
// real ones would build a WebGLRenderer at module scope, so every engine module and
// service it depends on is replaced with a light fake. event-bus + logger stay real
// (pure). gds SceneInstance fixtures stay REAL (built via fromJS) so instanceof holds.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { SceneInstance } from "@gds";

const mocks = vi.hoisted(() => ({
  globalObject: {} as any,
  globalStateObject: {} as any,
  graphicContext: { resetInstance: vi.fn() } as any,
  metaUtility: { getTabContextSceneType: vi.fn() } as any,
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(),
    getAllOpenSceneInstances: vi.fn(),
    getAllPortInstancesOfTabContext: vi.fn(async () => []),
  } as any,
  snapshotService: {
    setSceneInstanceSnapshot: vi.fn(),
    restoreSceneInstanceToCurrentTab: vi.fn(),
  } as any,
  backendService: {
    sceneInstancesPATCH: vi.fn(),
    sceneInstancesPOST: vi.fn(),
  } as any,
  instanceCreationHandler: {
    createMissingSceneAttributeInstances: vi.fn(async () => []),
  } as any,
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/engine/global-state-object", () => ({ globalStateObject: mocks.globalStateObject }));
vi.mock("@/engine/graphic-context", () => ({
  GraphicContext: class {},
  graphicContext: mocks.graphicContext,
}));
vi.mock("@/engine/instance-creation-handler", () => ({
  instanceCreationHandler: mocks.instanceCreationHandler,
}));
vi.mock("./meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("./instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("./snapshot-service", () => ({ snapshotService: mocks.snapshotService }));
vi.mock("./backend-service", () => ({ backendService: mocks.backendService }));

import { persistencyHandler } from "./persistency-handler";

function makeScene(uuid: string, name: string): SceneInstance {
  return SceneInstance.fromJS({
    uuid,
    name,
    uuid_scene_type: "st-1",
    class_instances: [],
    relationclasses_instances: [],
    role_instances: [],
    attribute_instances: [],
    port_instances: [],
  }) as SceneInstance;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.globalObject, {
    selectedTab: 0,
    tabContext: [{}],
    autoSave: true,
  });
});

describe("persistency-handler.persistSceneInstanceToDB", () => {
  it("PATCHes the active scene instance and snapshots it", async () => {
    const scene = makeScene("s-1", "Scene 1");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.metaUtility.getTabContextSceneType.mockResolvedValue({ uuid: "st-1" });
    mocks.backendService.sceneInstancesPATCH.mockResolvedValue(scene);

    await persistencyHandler.persistSceneInstanceToDB();

    expect(mocks.backendService.sceneInstancesPATCH).toHaveBeenCalledWith("s-1", scene);
    expect(mocks.snapshotService.setSceneInstanceSnapshot).toHaveBeenCalledWith(scene);
    expect(mocks.backendService.sceneInstancesPOST).not.toHaveBeenCalled();
  });

  it("creates a freshly-created scene with a single PATCH (server upsert, no POST fallback)", async () => {
    // The server PATCH is an upsert, so the first save of a new scene succeeds with a
    // single PATCH — no PATCH -> 404 -> POST dance. POST must never be called.
    const scene = makeScene("s-new", "Second Scene");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.metaUtility.getTabContextSceneType.mockResolvedValue({ uuid: "st-1" });
    mocks.backendService.sceneInstancesPATCH.mockResolvedValue(scene);

    await persistencyHandler.persistSceneInstanceToDB();

    expect(mocks.backendService.sceneInstancesPATCH).toHaveBeenCalledWith("s-new", scene);
    expect(mocks.backendService.sceneInstancesPOST).not.toHaveBeenCalled();
    expect(mocks.snapshotService.setSceneInstanceSnapshot).toHaveBeenCalledWith(scene);
  });

  it("reverts to the last snapshot when PATCH is rejected with 403 (read-only shared scene)", async () => {
    const scene = makeScene("s-3", "Shared Scene");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.metaUtility.getTabContextSceneType.mockResolvedValue({ uuid: "st-1" });
    mocks.backendService.sceneInstancesPATCH.mockRejectedValue(
      Object.assign(new Error("Failed to update scene instance (403)"), { status: 403 }),
    );
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);

    await persistencyHandler.persistSceneInstanceToDB();

    expect(mocks.backendService.sceneInstancesPOST).not.toHaveBeenCalled();
    expect(mocks.snapshotService.restoreSceneInstanceToCurrentTab).toHaveBeenCalled();
    expect(mocks.snapshotService.setSceneInstanceSnapshot).not.toHaveBeenCalled();

    alertSpy.mockRestore();
  });

  it("logs and skips when there is no active scene instance", async () => {
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(undefined);

    await persistencyHandler.persistSceneInstanceToDB();

    expect(mocks.backendService.sceneInstancesPATCH).not.toHaveBeenCalled();
    expect(mocks.snapshotService.setSceneInstanceSnapshot).not.toHaveBeenCalled();
  });
});

describe("persistency-handler.loadPersistedModel", () => {
  // A scene saved before scene-type attributes were instantiated has none, so loading
  // one is where the missing ones get created — that is what puts a model's own
  // attributes in the attribute window for existing scenes.
  it("instantiates the scene type's missing attributes for the loaded scene", async () => {
    const scene = makeScene("s-3", "Scene 3");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);

    await persistencyHandler.loadPersistedModel(scene);

    expect(mocks.instanceCreationHandler.createMissingSceneAttributeInstances).toHaveBeenCalledWith(scene);
  });

  it("still loads the scene when the attribute instantiation fails", async () => {
    const scene = makeScene("s-4", "Scene 4");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.instanceCreationHandler.createMissingSceneAttributeInstances.mockRejectedValueOnce(
      new Error("boom"),
    );

    await expect(persistencyHandler.loadPersistedModel(scene)).resolves.toBeUndefined();
  });
});

describe("persistency-handler.saveToTextfile", () => {
  it("serialises the active scene to a downloadable JSON blob", async () => {
    const scene = makeScene("s-2", "MyScene");
    mocks.instanceUtility.getTabContextSceneInstance.mockResolvedValue(scene);
    mocks.globalObject.tabContext = [{}];

    const createObjectURL = vi.fn((blob: Blob) => `blob:${blob.size}`);
    const revokeObjectURL = vi.fn();
    (window.URL as any).createObjectURL = createObjectURL;
    (window.URL as any).revokeObjectURL = revokeObjectURL;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await persistencyHandler.saveToTextfile();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(clickSpy).toHaveBeenCalledTimes(1);

    clickSpy.mockRestore();
  });

  it("does nothing when no tab is open", async () => {
    mocks.globalObject.tabContext = [];
    const createObjectURL = vi.fn(() => "blob:mock");
    (window.URL as any).createObjectURL = createObjectURL;

    await persistencyHandler.saveToTextfile();

    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
