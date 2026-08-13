import { UUID, SceneInstance, SceneType } from "@gds";
// Deliberately the `@/engine` BARREL, not the global-definition leaf that the other
// services import: every view test that reaches this module mocks `@/engine`, and the
// leaf builds a real WebGLRenderer at module scope (see the notes in SceneGroup.test).
import { globalObject } from "@/engine";
import { backendService } from "./backend-service";
import { eventBus } from "./event-bus";
import { logger } from "./logger";

type SceneTypeNode = SceneType & { children?: SceneInstance[] };

/**
 * Owns the lazy fetching of SceneInstances into `globalObject.sceneTree`.
 *
 * WHY THIS EXISTS: SceneGroup's `initTree()` used to fetch every SceneInstance of
 * every SceneType at mount, and `GET /instances/sceneTypes/:uuid/sceneInstances`
 * returns *fully hydrated* scenes (the server's `getAllByParentUuid` calls
 * `getByUuid` per scene, which loads its ports, attributes, classes, roles and
 * relationclasses). So startup downloaded the complete contents of every scene the
 * user can read, and deep-cloned each one into a snapshot — a cost that scales with
 * the whole database rather than with the one scene the user actually opens.
 *
 * Now a SceneType's children are fetched the first time that type is expanded in the
 * tree. The consumer that genuinely needs *all* scenes (the cross-scene reference
 * attribute dialog) calls `loadAllSceneInstances` itself behind its own spinner, so the
 * total work is unchanged — it just moves off the startup path and only happens when
 * something really needs it. (The Copy/Delete/Share dialogs used to call it too, for
 * their scene pickers; those pickers are gone — the scene now arrives as the context
 * menu's payload.)
 *
 * The cache is module-level (not React state) because the tree it fills is the
 * engine-global `globalObject.sceneTree`, and non-component code (the dialogs, the
 * reference collectors) has to be able to ask "is this type loaded yet?" too.
 *
 * NOTE: this module deliberately does NOT take the per-SceneInstance snapshot that the
 * old eager `initTree()` took for every fetched scene. That baseline only matters for a
 * scene you actually open (it is what a rejected 403 edit reverts to), so SceneGroup
 * takes it in `openScene` instead. Keeping snapshot-service out of this module's import
 * graph also matters mechanically: it imports the engine's global-definition leaf, which
 * builds a real WebGLRenderer at module scope, and that would drag the whole engine into
 * every dialog test that merely lists scenes.
 */

/** SceneTypes whose children have been fetched from the DB in this session. */
const loadedTypes = new Set<UUID>();
/** In-flight fetches, so concurrent expands/dialog opens share one request. */
const inFlight = new Map<UUID, Promise<void>>();

/**
 * Bumped by every reset so a request issued against the previous tree can tell that it
 * came back too late (see loadSceneInstancesForType).
 */
let generation = 0;

/** Cleared by SceneGroup's initTree() so a re-login / re-init re-fetches. */
export function resetSceneInstanceCache(): void {
  generation++;
  loadedTypes.clear();
  inFlight.clear();
}

export function isSceneTypeLoaded(sceneTypeUuid: UUID): boolean {
  return loadedTypes.has(sceneTypeUuid);
}

/**
 * Fetch the SceneInstances of one SceneType into its tree node. Idempotent: a type
 * already loaded (or currently loading) does not fetch again.
 *
 * Fetched instances are MERGED by uuid rather than assigned over `children`. A node
 * may already hold instances that are not in (or not identical to) the DB response:
 * one imported via ImportModelDialog, one just created, or one that is open in a tab
 * and carries unsaved edits. Those local objects are the same references the engine
 * and the tab context hold, so replacing them with a freshly parsed copy would
 * silently detach the open scene from its tree node.
 */
export async function loadSceneInstancesForType(sceneTypeUuid: UUID): Promise<void> {
  if (loadedTypes.has(sceneTypeUuid)) return;
  const existing = inFlight.get(sceneTypeUuid);
  if (existing) return existing;

  const startedAt = generation;
  const request = (async () => {
    try {
      const instances = await backendService.sceneInstancesAllGET(sceneTypeUuid);
      // A reset landed while this was in flight, so the tree we were fetching for has
      // been rebuilt (a re-login, or the delete-scene dialog's 'initSceneGroup'). This
      // response describes the old tree — applying it could resurrect a scene that was
      // just deleted. Drop it; initTree re-requests whatever is still expanded.
      if (startedAt !== generation) return;

      const node = ((globalObject.sceneTree ?? []) as SceneTypeNode[]).find(
        (sceneType) => sceneType.uuid === sceneTypeUuid,
      );
      if (!node) {
        logger.log(`SceneType ${sceneTypeUuid} is not in the tree, skipping its instances`, "info");
        return;
      }
      if (!node.children) node.children = [];
      for (const sceneInstance of instances) {
        if (node.children.some((child) => child.uuid === sceneInstance.uuid)) continue;
        node.children.push(sceneInstance);
      }
      loadedTypes.add(sceneTypeUuid);
    } finally {
      // Only retract our own entry: a reset already cleared the map, and a later caller
      // may have registered a fresh request under the same uuid — deleting that one
      // would un-dedupe every caller after it.
      if (startedAt === generation) inFlight.delete(sceneTypeUuid);
    }
  })();

  inFlight.set(sceneTypeUuid, request);
  return request;
}

/**
 * Load every SceneType's instances — what `initTree()` used to do eagerly. The caller is
 * the feature that needs the complete set: the reference-attribute dialog (a reference
 * may point into a scene the user never expanded). It shows its own loading state while
 * this runs.
 *
 * Sequential, like the loop it replaces: every request runs its own DB transaction on
 * the server, and firing one per SceneType in parallel would just move the queue.
 */
export async function loadAllSceneInstances(): Promise<void> {
  // `?? []`: a caller can run before SceneGroup's initTree has filled the skeleton
  // (a dialog opened during startup), which is simply "nothing to load yet".
  for (const sceneType of (globalObject.sceneTypes ?? []) as SceneTypeNode[]) {
    await loadSceneInstancesForType(sceneType.uuid);
  }
  eventBus.publish("updateSceneGroup");
}
