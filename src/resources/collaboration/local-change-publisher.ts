import { globalObject } from "@/engine/global-definition";
import { applyLocalChangeToYDoc, type LocalChangeType } from "./y-mapping";

/**
 * The one way a local edit reaches the collaborators of the ACTIVE tab.
 *
 * Every mutation site used to repeat the same three steps — look the tab's shared
 * session up, skip when the edit is really a remote update being replayed, then call
 * `applyLocalChangeToYDoc` with the session's doc and origin. Getting any of them
 * wrong is silent (an edit that never leaves the client, or one echoed straight back
 * to its sender), so they live here instead.
 *
 * The session is reached through `globalObject.sharedDocServiceRef` rather than by
 * importing SharedDocService: this module is called from the engine, and the
 * back-reference is what keeps the engine's import graph free of the collaboration
 * layer. On a tab with no shared session every function here is a no-op.
 */

/** The active tab's shared session, or `null` when that tab is not collaborative. */
function activeSession() {
  return globalObject.sharedDocServiceRef?.forTab(globalObject.selectedTab) ?? null;
}

/** True when the active tab is collaborative and the local user may write to it. */
export function isActiveTabShared(): boolean {
  return activeSession() !== null;
}

/**
 * Push one or more deltas to the peers of the active tab, in order.
 *
 * Returns whether they were sent: `false` means the tab is solo, or that we are
 * currently applying a peer's update — re-publishing that would echo it back.
 */
export function publishLocalChange(...changes: LocalChangeType[]): boolean {
  const session = activeSession();
  if (!session || session.applyingRemote) return false;
  for (const change of changes) {
    applyLocalChangeToYDoc(session.ydoc, change, session.localOrigin);
  }
  return true;
}

/**
 * Flag the active scene for the next auto-save tick. A shared tab uses the
 * local-origin flag so the shared auto-save branch picks the change up; a solo tab
 * uses the plain one.
 */
export function markActiveSceneDirty(): void {
  if (isActiveTabShared()) {
    globalObject.doSceneInstancePatchLocal = true;
  } else {
    globalObject.doSceneInstancePatch = true;
  }
}
