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
  backendService: { sceneInstancesAllGET: vi.fn(async () => []) },
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

import SceneGroup from "./SceneGroup";
import { useUiStore } from "@/resources/store/uiStore";

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  useUiStore.setState({ dialogs: { ...useUiStore.getState().dialogs, createNewScene: false, copyScene: false } });
  Object.assign(mocks.globalObject, { selectedTab: -1, tabContext: [], sceneTypes: [], sceneTree: [], importSceneInstances: [] });
  mocks.metaUtility.getAllSceneTypesFromDB.mockResolvedValue([]);
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
