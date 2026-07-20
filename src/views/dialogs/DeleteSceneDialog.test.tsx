// @vitest-environment jsdom
//
// P9 component tests for the delete-scene dialog: it lists the scenes flattened out
// of globalObject.sceneTree, DELETEs the selected one through backend-service, and
// republishes 'initSceneGroup' so the tree re-fetches.
//
// `@/engine` and backend-service are mocked (the real engine barrel builds a
// WebGLRenderer at module scope); uiStore + eventBus are the real singletons.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  globalObject: { sceneTree: [] as any[] } as any,
  backendService: { sceneInstancesAllDELETE2: vi.fn(async (): Promise<unknown> => ({})) },
  closeTab: vi.fn(async (): Promise<void> => {}),
}));

vi.mock("@/engine", () => ({ globalObject: mocks.globalObject }));
vi.mock("@/resources/services/backend-service", () => ({ backendService: mocks.backendService }));
// tabActions.closeTab drives the real engine/collaboration singletons, which aren't
// mounted here — mock it and assert the dialog calls it with the open tab's index.
vi.mock("@/views/layout/tabActions", () => ({ closeTab: mocks.closeTab }));

import DeleteSceneDialog from "./DeleteSceneDialog";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore, DialogName } from "@/resources/store/uiStore";
import { useTabsStore, TabInfo } from "@/resources/store/tabsStore";

const SCENE_A = "scene-a-uuid";
const SCENE_B = "scene-b-uuid";

/** A two-scene-type tree, one instance each — the shape SceneGroup.initTree builds. */
function makeTree() {
  return [
    { uuid: "st-1", name: "BPMN", children: [{ uuid: SCENE_A, name: "Scene A" }] },
    { uuid: "st-2", name: "Petri Net", children: [{ uuid: SCENE_B, name: "Scene B" }] },
    { uuid: "st-3", name: "Empty type" }, // no children key at all
  ];
}

/** P8's trap: uiStore dialog flags are module-global and leak across tests. */
function closeAllDialogs() {
  const names = Object.keys(useUiStore.getState().dialogs) as DialogName[];
  names.forEach((name) => useUiStore.getState().closeDialog(name));
}

/** Reset the tab bar to a known set of open tabs. */
function setOpenTabs(tabs: TabInfo[]) {
  useTabsStore.setState({ tabs, selectedTab: tabs.length ? 0 : -1 });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  closeAllDialogs();
  mocks.globalObject.sceneTree = makeTree();
  setOpenTabs([]);
});

/** Opens the MUI Select. Queried by role: MUI renders the InputLabel as a sibling
 * <label> that getByLabelText cannot associate with the underlying div. */
async function openSelect() {
  const select = await screen.findByRole("combobox");
  fireEvent.mouseDown(select);
  return screen.findByRole("listbox");
}

async function openAndSelect(sceneLabel: string) {
  render(<DeleteSceneDialog />);
  useUiStore.getState().openDialog("deleteScene");

  const listbox = await openSelect();
  fireEvent.click(within(listbox).getByText(new RegExp(sceneLabel)));
}

describe("DeleteSceneDialog", () => {
  it("renders nothing until the uiStore flag opens it", () => {
    render(<DeleteSceneDialog />);
    expect(screen.queryByText("Delete SceneInstance")).toBeNull();
  });

  it("lists every scene instance flattened out of the tree", async () => {
    render(<DeleteSceneDialog />);
    useUiStore.getState().openDialog("deleteScene");

    const listbox = await openSelect();
    expect(within(listbox).getByText(/Scene A/)).toBeTruthy();
    expect(within(listbox).getByText(/Scene B/)).toBeTruthy();
    // the childless scene type contributes no options and must not throw
    expect(within(listbox).getAllByRole("option")).toHaveLength(2);
  });

  it("DELETEs the selected scene through backend-service and publishes initSceneGroup", async () => {
    const initSceneGroup = vi.fn();
    const sub = eventBus.subscribe("initSceneGroup", initSceneGroup);

    await openAndSelect("Scene B");
    fireEvent.click(screen.getByRole("button", { name: "Delete SceneInstance" }));

    await waitFor(() => {
      expect(mocks.backendService.sceneInstancesAllDELETE2).toHaveBeenCalledWith(SCENE_B);
    });
    expect(mocks.backendService.sceneInstancesAllDELETE2).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(initSceneGroup).toHaveBeenCalledTimes(1));

    // and it closes itself
    await waitFor(() => expect(useUiStore.getState().dialogs.deleteScene).toBe(false));
    sub.dispose();
  });

  it("closes the open tab for the deleted scene", async () => {
    setOpenTabs([
      { uuid: SCENE_A, name: "Scene A", isShared: false },
      { uuid: SCENE_B, name: "Scene B", isShared: false },
    ]);

    await openAndSelect("Scene B");
    fireEvent.click(screen.getByRole("button", { name: "Delete SceneInstance" }));

    // Scene B is at tab index 1.
    await waitFor(() => expect(mocks.closeTab).toHaveBeenCalledWith(1));
    expect(mocks.closeTab).toHaveBeenCalledTimes(1);
  });

  it("does not close any tab when the deleted scene isn't open", async () => {
    setOpenTabs([{ uuid: SCENE_A, name: "Scene A", isShared: false }]);

    await openAndSelect("Scene B");
    fireEvent.click(screen.getByRole("button", { name: "Delete SceneInstance" }));

    await waitFor(() => {
      expect(mocks.backendService.sceneInstancesAllDELETE2).toHaveBeenCalledWith(SCENE_B);
    });
    expect(mocks.closeTab).not.toHaveBeenCalled();
  });

  it("cannot delete with nothing selected — the button is disabled", async () => {
    render(<DeleteSceneDialog />);
    useUiStore.getState().openDialog("deleteScene");

    const button = await screen.findByRole("button", { name: "Delete SceneInstance" });
    expect(button).toHaveProperty("disabled", true);

    fireEvent.click(button);
    expect(mocks.backendService.sceneInstancesAllDELETE2).not.toHaveBeenCalled();
  });

  it("Cancel closes without deleting anything", async () => {
    await openAndSelect("Scene A");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(useUiStore.getState().dialogs.deleteScene).toBe(false));
    expect(mocks.backendService.sceneInstancesAllDELETE2).not.toHaveBeenCalled();
  });
});
