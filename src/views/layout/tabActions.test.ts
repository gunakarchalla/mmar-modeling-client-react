// tabActions: the tab select/close "single mutation path" must keep tabsStore and
// globalObject.tabContext/selectedTab in lockstep, and closing must follow the
// store's selection-clamp rules (the old main-body-tab-bar index shuffle, improved
// to preserve the current selection where possible).
//
// `@/engine` is mocked (the real barrel builds a WebGLRenderer at module scope).
// engine.isInitialized is false here so applyEngineTabSelection short-circuits its
// scene work after syncing selectedTab — exactly the store/selection wiring we test.
import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  globalObject: {
    selectedTab: -1,
    tabContext: [] as unknown[],
    scene: {},
    dragObjects: [] as unknown[],
    mousePointer3d: {},
    plane: {},
  },
  engine: { isInitialized: false },
  globalSelectedObject: { removeObject: vi.fn() },
  globalClassObject: { initClasses: vi.fn() },
  globalRelationclassObject: { initRelationClasses: vi.fn() },
  sceneInitiator: { initTransformControls: vi.fn() },
  eventBus: { publish: vi.fn() },
  logger: { log: vi.fn() },
  // P10: closeTab now detaches the tab's shared session. Mocking the service also
  // keeps the real @/engine/global-definition (which it imports directly, bypassing
  // the mocked barrel) from constructing a WebGLRenderer under vitest.
  sharedDocService: { detach: vi.fn(), forTab: vi.fn(() => null) },
  // P11: closeTab also drops the tab's remote cursor/selection helpers. Mocked for the
  // same reason as the service above — the renderers import @/engine/global-definition
  // directly (bypassing the mocked barrel), which builds a WebGLRenderer at module scope.
  remoteCursorRenderer: { clearForTab: vi.fn() },
  remoteSelectionRenderer: { clearForTab: vi.fn() },
}));

vi.mock("@/engine", () => ({
  engine: mocks.engine,
  globalObject: mocks.globalObject,
  globalSelectedObject: mocks.globalSelectedObject,
  globalClassObject: mocks.globalClassObject,
  globalRelationclassObject: mocks.globalRelationclassObject,
  sceneInitiator: mocks.sceneInitiator,
}));
vi.mock("@/resources/services/event-bus", () => ({ eventBus: mocks.eventBus }));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));
vi.mock("@/resources/collaboration/shared-doc-service", () => ({ sharedDocService: mocks.sharedDocService }));
vi.mock("@/resources/collaboration/remote-cursor-renderer", () => ({ remoteCursorRenderer: mocks.remoteCursorRenderer }));
vi.mock("@/resources/collaboration/remote-selection-renderer", () => ({
  remoteSelectionRenderer: mocks.remoteSelectionRenderer,
}));

import { switchToTab, closeTab } from "./tabActions";
import { useTabsStore } from "@/resources/store/tabsStore";

function seedTabs(names: string[]) {
  const store = useTabsStore.getState();
  useTabsStore.setState({ tabs: [], selectedTab: -1 });
  names.forEach((name) =>
    store.openTab({ name, uuid: `uuid-${name}`, isShared: false }),
  );
  // Mirror the engine tabContext with parallel fake entries.
  mocks.globalObject.tabContext = names.map((name) => ({
    sceneInstance: { name },
    threeScene: {},
    contextDragObjects: [],
  }));
  mocks.globalObject.selectedTab = names.length - 1;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.engine.isInitialized = false;
});

describe("switchToTab", () => {
  it("selects the tab in both the store and the engine", async () => {
    seedTabs(["A", "B", "C"]); // selected C (index 2)
    await switchToTab(0);
    expect(useTabsStore.getState().selectedTab).toBe(0);
    expect(mocks.globalObject.selectedTab).toBe(0);
    expect(mocks.eventBus.publish).toHaveBeenCalledWith("tabChanged");
    expect(mocks.globalSelectedObject.removeObject).toHaveBeenCalled();
  });
});

describe("closeTab", () => {
  it("removes the tab from both the store and the engine tabContext", async () => {
    seedTabs(["A", "B", "C"]);
    await closeTab(1);
    expect(useTabsStore.getState().tabs.map((t) => t.name)).toEqual(["A", "C"]);
    expect(mocks.globalObject.tabContext).toHaveLength(2);
  });

  it("keeps the selection clamped when closing a lower-indexed tab", async () => {
    seedTabs(["A", "B", "C"]); // selected index 2 (C)
    await closeTab(0); // removing A shifts C to index 1
    const store = useTabsStore.getState();
    expect(store.tabs.map((t) => t.name)).toEqual(["B", "C"]);
    expect(store.selectedTab).toBe(1); // still C
    expect(mocks.globalObject.selectedTab).toBe(1); // engine kept in sync
  });

  it("resets to no selection when the last tab is closed", async () => {
    seedTabs(["A"]);
    await closeTab(0);
    expect(useTabsStore.getState().selectedTab).toBe(-1);
    expect(mocks.globalObject.selectedTab).toBe(-1);
    expect(mocks.globalObject.tabContext).toHaveLength(0);
    // The engine scene is replaced with a fresh empty one on the last close.
    expect(mocks.globalObject.dragObjects).toEqual([]);
  });

  it("selects the previous tab when closing the active last tab", async () => {
    seedTabs(["A", "B", "C"]); // selected index 2 (C)
    await closeTab(2); // closing the active tab clamps to the new last index
    const store = useTabsStore.getState();
    expect(store.tabs.map((t) => t.name)).toEqual(["A", "B"]);
    expect(store.selectedTab).toBe(1);
    expect(mocks.globalObject.selectedTab).toBe(1);
  });

  // P10: the old main-body-tab-bar tore the shared session down before the splice so
  // the websocket closes and we disappear from other clients' awareness.
  it("detaches the closed tab's shared session before removing it", async () => {
    seedTabs(["A", "B"]);
    await closeTab(0);
    expect(mocks.sharedDocService.detach).toHaveBeenCalledWith(0);
  });

  it("does not detach anything when the index is out of range", async () => {
    seedTabs(["A"]);
    await closeTab(5);
    expect(mocks.sharedDocService.detach).not.toHaveBeenCalled();
  });

  // P11: the closed tab's remote cursor arrows / selection boxes must go with it,
  // and the renderers must unsubscribe the session's awareness BEFORE it is destroyed
  // — hence clearForTab strictly before detach (the old main-body-tab-bar's order).
  it("clears the closed tab's remote cursor and selection helpers before detaching", async () => {
    seedTabs(["A", "B"]);
    const order: string[] = [];
    mocks.remoteCursorRenderer.clearForTab.mockImplementation(() => order.push("cursor"));
    mocks.remoteSelectionRenderer.clearForTab.mockImplementation(() => order.push("selection"));
    mocks.sharedDocService.detach.mockImplementation(() => order.push("detach"));

    await closeTab(0);

    expect(mocks.remoteCursorRenderer.clearForTab).toHaveBeenCalledWith(0);
    expect(mocks.remoteSelectionRenderer.clearForTab).toHaveBeenCalledWith(0);
    expect(order).toEqual(["cursor", "selection", "detach"]);
  });

  it("does not clear any renderer when the index is out of range", async () => {
    seedTabs(["A"]);
    await closeTab(5);
    expect(mocks.remoteCursorRenderer.clearForTab).not.toHaveBeenCalled();
    expect(mocks.remoteSelectionRenderer.clearForTab).not.toHaveBeenCalled();
  });
});
