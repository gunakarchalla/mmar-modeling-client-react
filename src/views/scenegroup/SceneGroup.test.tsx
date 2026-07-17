// @vitest-environment jsdom
//
// P7 component tests for SceneGroup: the action buttons open the right uiStore
// dialogs, and initTree() builds the SceneType tree from the (mocked) backend.
// `@/engine` and the sibling services are mocked (the real barrel builds a
// WebGLRenderer at module scope); uiStore + eventBus are the real singletons.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  engine: { isInitialized: true, whenReady: vi.fn(async () => undefined) },
  globalObject: { selectedTab: -1, tabContext: [], sceneTypes: [], sceneTree: [], importSceneInstances: [] } as any,
  globalClassObject: { initClasses: vi.fn() },
  globalRelationclassObject: { initRelationClasses: vi.fn() },
  sceneInitiator: { sceneInit: vi.fn(async () => undefined) },
  metaUtility: {
    getFiles: vi.fn(async () => undefined),
    getAllSceneTypesFromDB: vi.fn(),
    checkIfSceneType: vi.fn((n: any) => !!n?.classes),
  },
  instanceUtility: {
    checkIfSceneInstance: vi.fn((n: any) => !!n?.uuid_scene_type),
    createTabContextSceneInstance: vi.fn(async () => ({ isShared: false })),
  },
  snapshotService: {
    setSceneInstanceSnapshot: vi.fn(),
    createSceneOpenSnapshot: vi.fn(),
    clearSceneOpenSnapshot: vi.fn(),
    rollbackSceneOpen: vi.fn(),
  },
  persistencyHandler: { loadPersistedModel: vi.fn(async () => undefined) },
  backendService: {
    sceneInstancesAllGET: vi.fn(async () => []),
    // P10 — maybeAttachSharedSession's two access probes.
    sceneAccessListGET: vi.fn(async (): Promise<unknown[]> => []),
    sceneAccessMeGET: vi.fn(async (): Promise<{ level: string | null }> => ({ level: null })),
  },
  // P10: SceneGroup attaches a shared session on open. Mocking the service also keeps
  // the real @/engine/global-definition (which it imports directly, bypassing the
  // mocked barrel) from constructing a WebGLRenderer under vitest.
  sharedDocService: { attach: vi.fn(), detach: vi.fn(), forTab: vi.fn(() => null) },
  // P11: maybeAttachSharedSession binds both renderers to the new session. Mocked for
  // the same reason as the service — they import @/engine/global-definition directly
  // (bypassing the mocked barrel), which builds a WebGLRenderer at module scope.
  remoteCursorRenderer: { bindToSession: vi.fn(), clearForTab: vi.fn() },
  remoteSelectionRenderer: { bindToSession: vi.fn(), clearForTab: vi.fn() },
  closeTab: vi.fn(async () => undefined),
}));

vi.mock("@/engine", () => ({
  engine: mocks.engine,
  globalObject: mocks.globalObject,
  globalClassObject: mocks.globalClassObject,
  globalRelationclassObject: mocks.globalRelationclassObject,
  sceneInitiator: mocks.sceneInitiator,
}));
vi.mock("@/resources/services/meta-utility", () => ({ metaUtility: mocks.metaUtility }));
vi.mock("@/resources/services/instance-utility", () => ({ instanceUtility: mocks.instanceUtility }));
vi.mock("@/resources/services/snapshot-service", () => ({ snapshotService: mocks.snapshotService }));
vi.mock("@/resources/services/persistency-handler", () => ({ persistencyHandler: mocks.persistencyHandler }));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));
vi.mock("@/resources/collaboration/remote-cursor-renderer", () => ({ remoteCursorRenderer: mocks.remoteCursorRenderer }));
vi.mock("@/resources/collaboration/remote-selection-renderer", () => ({
  remoteSelectionRenderer: mocks.remoteSelectionRenderer,
}));
vi.mock("@/views/layout/tabActions", () => ({ closeTab: mocks.closeTab }));

import SceneGroup from "./SceneGroup";
import { useUiStore } from "@/resources/store/uiStore";
import { useTabsStore } from "@/resources/store/tabsStore";
import { eventBus } from "@/resources/services/event-bus";

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  useUiStore.setState({ dialogs: { ...useUiStore.getState().dialogs, createNewScene: false, copyScene: false } });
  Object.assign(mocks.globalObject, { selectedTab: -1, tabContext: [], sceneTypes: [], sceneTree: [], importSceneInstances: [] });
  mocks.metaUtility.getAllSceneTypesFromDB.mockResolvedValue([]);
  mocks.backendService.sceneAccessListGET.mockResolvedValue([]);
  mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: null });
  useTabsStore.setState({ tabs: [], selectedTab: -1 });
});

describe("SceneGroup", () => {
  it("opens the create-new-scene dialog from the action button", async () => {
    render(<SceneGroup />);
    fireEvent.click(screen.getByText("Create new SceneInstance"));
    expect(useUiStore.getState().dialogs.createNewScene).toBe(true);
  });

  it("opens the duplicate (copyScene) dialog from the action button", async () => {
    render(<SceneGroup />);
    fireEvent.click(screen.getByText("Duplicate SceneInstance"));
    expect(useUiStore.getState().dialogs.copyScene).toBe(true);
  });

  it("builds the SceneType tree from the backend on mount", async () => {
    mocks.metaUtility.getAllSceneTypesFromDB.mockResolvedValue([
      { uuid: "st-1", name: "BPMN", classes: [], children: [] },
      { uuid: "st-2", name: "Petri Net", classes: [], children: [] },
    ]);

    render(<SceneGroup />);

    await waitFor(() => expect(screen.getByText(/BPMN/)).toBeTruthy());
    expect(screen.getByText(/Petri Net/)).toBeTruthy();
    expect(mocks.metaUtility.getFiles).toHaveBeenCalled();
    expect(mocks.backendService.sceneInstancesAllGET).toHaveBeenCalledTimes(2);
  });
});

// --- P10: collaboration wiring ------------------------------------------------

// Render the tree with one scene instance and double-click it to run openScene().
async function openSceneInstance() {
  mocks.metaUtility.getAllSceneTypesFromDB.mockResolvedValue([{ uuid: "st-1", name: "BPMN", classes: [], children: [] }]);
  mocks.backendService.sceneInstancesAllGET.mockResolvedValue([
    { uuid: "si-1", name: "My Scene", uuid_scene_type: "st-1" },
  ] as never);
  render(<SceneGroup />);
  await waitFor(() => expect(screen.getByText(/BPMN/)).toBeTruthy());
  fireEvent.click(screen.getByLabelText("expand"));
  const row = await screen.findByText(/My Scene/);
  fireEvent.doubleClick(row);
}

describe("SceneGroup — maybeAttachSharedSession", () => {
  it("attaches a shared session when the scene has >=2 access entries", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([{ uuid_user: "u1" }, { uuid_user: "u2" }]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "read" });
    // createTabContextSceneInstance pushes the tab; attach targets the last index.
    mocks.instanceUtility.createTabContextSceneInstance.mockImplementation(async () => {
      const ctx = { isShared: false };
      mocks.globalObject.tabContext.push(ctx);
      useTabsStore.getState().openTab({ name: "My Scene", uuid: "si-1", isShared: false });
      return ctx;
    });

    await openSceneInstance();

    await waitFor(() => expect(mocks.sharedDocService.attach).toHaveBeenCalled());
    const [tabIndex, sceneInstance, access] = mocks.sharedDocService.attach.mock.calls[0];
    expect(tabIndex).toBe(0);
    expect((sceneInstance as { uuid: string }).uuid).toBe("si-1");
    // The caller's own level decides the session's access, not the default 'edit'.
    expect(access).toBe("read");
    // Both the engine tab context and the reactive store learn the tab is shared.
    expect(mocks.globalObject.tabContext[0].isShared).toBe(true);
    expect(useTabsStore.getState().tabs[0].isShared).toBe(true);
  });

  it("leaves a scene with a single access entry non-shared", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([{ uuid_user: "u1" }]);

    await openSceneInstance();

    await waitFor(() => expect(mocks.persistencyHandler.loadPersistedModel).toHaveBeenCalled());
    expect(mocks.sharedDocService.attach).not.toHaveBeenCalled();
  });

  // P11: without these binds, peers' cursors and selection boxes never draw — and
  // nothing throws, so only a test catches it (same hazard class as P10's load-bearing
  // coordinates-updater import).
  it("binds both presence renderers to the session right after attaching", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([{ uuid_user: "u1" }, { uuid_user: "u2" }]);
    mocks.backendService.sceneAccessMeGET.mockResolvedValue({ level: "edit" });
    mocks.instanceUtility.createTabContextSceneInstance.mockImplementation(async () => {
      const ctx = { isShared: false };
      mocks.globalObject.tabContext.push(ctx);
      useTabsStore.getState().openTab({ name: "My Scene", uuid: "si-1", isShared: false });
      return ctx;
    });

    await openSceneInstance();

    await waitFor(() => expect(mocks.remoteCursorRenderer.bindToSession).toHaveBeenCalledWith(0));
    expect(mocks.remoteSelectionRenderer.bindToSession).toHaveBeenCalledWith(0);
  });

  it("binds no renderer for a scene that is not shared", async () => {
    mocks.backendService.sceneAccessListGET.mockResolvedValue([{ uuid_user: "u1" }]);

    await openSceneInstance();

    await waitFor(() => expect(mocks.persistencyHandler.loadPersistedModel).toHaveBeenCalled());
    expect(mocks.remoteCursorRenderer.bindToSession).not.toHaveBeenCalled();
    expect(mocks.remoteSelectionRenderer.bindToSession).not.toHaveBeenCalled();
  });
});

describe("SceneGroup — shared session bus subscriptions", () => {
  it("reloads the scene when the shared session reconnects", async () => {
    const sceneInstance = { uuid: "si-1", name: "My Scene" };
    mocks.globalObject.tabContext = [{ sceneInstance }];
    render(<SceneGroup />);

    eventBus.publish("sharedSceneReconnected", { tabIndex: 0 });

    await waitFor(() => expect(mocks.persistencyHandler.loadPersistedModel).toHaveBeenCalledWith(sceneInstance));
  });

  it("alerts and closes the tab when access is revoked", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    mocks.globalObject.tabContext = [{ sceneInstance: { uuid: "si-1", name: "My Scene" } }];
    render(<SceneGroup />);

    eventBus.publish("sceneAccessRevoked", { tabIndex: 0 });

    await waitFor(() => expect(mocks.closeTab).toHaveBeenCalledWith(0));
    expect(alertSpy).toHaveBeenCalledWith('Your access to "My Scene" was revoked. The tab will be closed.');
    alertSpy.mockRestore();
  });
});
