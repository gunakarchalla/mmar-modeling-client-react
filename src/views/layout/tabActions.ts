import * as THREE from "three";
import {
  engine,
  globalObject,
  globalSelectedObject,
  globalClassObject,
  globalRelationclassObject,
  sceneInitiator,
} from "@/engine";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";
import { backendService } from "@/resources/services/backend-service";
import { describeError } from "@/resources/util/describe-error";
import { useTabsStore } from "@/resources/store/tabsStore";
import { sharedDocService } from "@/resources/collaboration/shared-doc-service";
import { remoteCursorRenderer } from "@/resources/collaboration/remote-cursor-renderer";
import { remoteSelectionRenderer } from "@/resources/collaboration/remote-selection-renderer";

/**
 * Tab select/close operations — the "single mutation path" for tab *selection* and
 * *closing* (opening lives in instance-utility.createTabContextSceneInstance, P3).
 * Ported from `views/main-body-tab-bar/main-body-tab-bar.ts` (clickedTab / closeTab).
 * Each operation mutates BOTH `globalObject.tabContext`/`selectedTab` (the engine)
 * and the reactive `tabsStore`, keeping the two in lockstep.
 *
 * The old `closeTab` always jumped selection to `index-1`/`0`. Here the store's
 * `closeTab` owns the selection-clamp rules (which preserve the current selection
 * where possible — the P1 improvement); the engine is then reconciled to whatever
 * index the store settled on, so the two never drift.
 *
 * The engine work (scene swap, transform controls) is only valid after the canvas
 * has mounted; every operation is a no-op on the engine side until then (tabs can
 * only exist post-mount anyway), but the store side always runs.
 */

// Engine half of clickedTab: swap the active THREE.Scene to the tab's scene and
// re-add the shared helpers (mousePointer3d, transformControls, intersection plane).
// No store write — callers decide when to update tabsStore.
async function applyEngineTabSelection(index: number): Promise<void> {
  // Remove the selection box helper from the previously-active scene.
  globalSelectedObject.removeObject();
  globalObject.selectedTab = index;
  eventBus.publish("tabChanged");

  if (!engine.isInitialized) return;
  const tab = globalObject.tabContext[index];
  if (!tab) return;

  const threeScene = tab.threeScene;
  globalObject.scene = threeScene;
  logger.log(`Current Tab ${index}: name: ${tab.sceneInstance.name}`, "info");

  globalClassObject.initClasses();
  globalRelationclassObject.initRelationClasses();

  globalObject.dragObjects = tab.contextDragObjects;
  globalObject.scene.add(globalObject.mousePointer3d);
  await sceneInitiator.initTransformControls();
  globalObject.scene.add(globalObject.plane);
}

/** Activate the tab at `index` (clickedTab): engine scene swap + store selection. */
export async function switchToTab(index: number): Promise<void> {
  await applyEngineTabSelection(index);
  useTabsStore.getState().selectTab(index);
}

/**
 * Rename the SceneInstance shown on the tab at `index`. Mutates the engine's
 * tabContext SceneInstance, the SceneGroup tree node (matched by uuid), and the
 * reactive tabsStore so tab bar + scene tree stay in lockstep. Persists via a
 * PATCH when autoSave is on (the same upsert the create/autosave path uses); on a
 * failed persist (e.g. 403 read-only on a shared scene) the local name is reverted
 * so the UI reflects the server. A blank/unchanged name is a no-op.
 */
export async function renameTab(index: number, rawName: string): Promise<void> {
  const name = rawName.trim();
  const tabContext = globalObject.tabContext;
  const tab = tabContext[index];
  if (!tab || !name || name === tab.sceneInstance.name) return;

  const sceneInstance = tab.sceneInstance;
  const previousName = sceneInstance.name;
  const uuid = sceneInstance.uuid;

  // Update the engine's SceneInstance + the matching SceneGroup tree node (they may
  // be different object references), then the reactive store.
  sceneInstance.name = name;
  const treeArr = (globalObject.sceneTree ?? []) as { children?: { uuid: string; name: string }[] }[];
  for (const sceneType of treeArr) {
    const node = sceneType.children?.find((child) => child.uuid === uuid);
    if (node) node.name = name;
  }
  useTabsStore.getState().renameTab(index, name);
  eventBus.publish("updateSceneGroup");

  if (!globalObject.autoSave) {
    logger.log(`SceneInstance renamed to ${name} (autoSave off, not persisted)`, "info");
    return;
  }

  try {
    await backendService.sceneInstancesPATCH(uuid, sceneInstance);
    logger.log(`SceneInstance renamed to ${name}`, "info");
  } catch (error) {
    // Revert the rename everywhere so the UI matches the server (mirrors the 403
    // revert-to-snapshot behaviour in persistency-handler.persistSceneInstanceToDB).
    sceneInstance.name = previousName;
    for (const sceneType of treeArr) {
      const node = sceneType.children?.find((child) => child.uuid === uuid);
      if (node) node.name = previousName;
    }
    useTabsStore.getState().renameTab(index, previousName);
    eventBus.publish("updateSceneGroup");
    if (Number((error as { status?: number }).status) === 403 && typeof window !== "undefined") {
      window.alert("You don't have enough authorization to rename this scene instance.");
    }
    logger.log(`SceneInstance rename failed: ${describeError(error)}`, "error");
  }
}

/** Close the tab at `index` (closeTab): tear down the engine tab, reconcile selection. */
export async function closeTab(index: number): Promise<void> {
  const tabContext = globalObject.tabContext;
  if (index < 0 || index >= Math.max(tabContext.length, useTabsStore.getState().tabs.length)) {
    return;
  }

  // Tear down any shared session before removing the tab so the websocket is closed
  // gracefully and the user disappears from other clients' awareness (P10).
  // P11: drop this tab's remote cursor/selection helpers FIRST — clearForTab needs the
  // session alive to unsubscribe its awareness handler, and the tabContext entry alive
  // to remove the helpers from the right scene. Same order as the old main-body-tab-bar.
  remoteCursorRenderer.clearForTab(index);
  remoteSelectionRenderer.clearForTab(index);
  //
  // KNOWN LIMITATION, faithful to the old client: sessions are keyed by tab INDEX, and
  // the splice below shifts every later tab down one. Their sessions keep the old key,
  // so with two shared tabs open, closing the lower one leaves the survivor's session
  // stranded (forTab() misses it, and its observers still write to the old index).
  // Recorded in state.json → known_issues rather than redesigned here.
  sharedDocService.detach(index);

  // Remove the tab from the engine's tabContext (same position the store removes).
  if (index < tabContext.length) tabContext.splice(index, 1);

  // Let the store apply its selection-clamp rules, then read the resulting index.
  useTabsStore.getState().closeTab(index);
  const newSelected = useTabsStore.getState().selectedTab;

  if (newSelected < 0) {
    // No tabs left: reset the engine to an empty scene (mirrors closeTab's else).
    globalObject.selectedTab = -1;
    globalObject.scene = new THREE.Scene();
    globalObject.dragObjects = [];
    eventBus.publish("tabChanged");
    return;
  }

  // Reconcile the engine to the store's chosen selection.
  await applyEngineTabSelection(newSelected);
  logger.log("close tab", "info");
}
