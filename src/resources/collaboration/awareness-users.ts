import type { WebsocketProvider } from "y-websocket";
import type { CollabUser } from "@/resources/store/collabStore";

/**
 * P11: the data half of the old `views/user-legend/user-legend.ts` `refresh()` (its
 * chips half is `views/user-legend/UserLegend.tsx`).
 *
 * THE PLAN'S IMPROVEMENT (§9 P11): the old component polled awareness every 500 ms
 * because "awareness event callbacks fire outside Aurelia's change-detection cycle" —
 * a workaround for Aurelia, not a requirement of yjs. React re-renders from a store
 * subscription, so `shared-doc-service` subscribes awareness `change` events once per
 * session and pushes the result into `collabStore.setUsers`. No polling, and the list
 * updates the instant a peer joins/leaves rather than up to 500 ms later.
 *
 * The old `changed` diff-check before reassigning (to "minimise Aurelia dirty-check
 * churn") is dropped: zustand's `setUsers` replaces the array and React re-renders the
 * legend, which is cheap and correct. Keeping the old check would ALSO have been wrong
 * here — it compared only clientId and color, so a username change would never render.
 */

type AwarenessLike = Pick<WebsocketProvider["awareness"], "clientID" | "getStates">;

interface AwarenessUser {
  uuid?: string;
  username?: string;
  color?: string;
  initials?: string;
}

/**
 * Map a session's awareness states to the legend's rows. Includes the local client
 * (flagged `isLocal`), as the old `refresh()` did. States without a `user.uuid` are
 * skipped — a peer publishes its cursor/selection fields before its user field is
 * decoded, and a chip with no identity is meaningless.
 */
export function collectUsers(awareness: AwarenessLike): CollabUser[] {
  const localId = awareness.clientID;
  const users: CollabUser[] = [];

  for (const [clientId, state] of Array.from(awareness.getStates())) {
    const user = (state as { user?: AwarenessUser } | undefined)?.user;
    if (!user?.uuid) continue;
    users.push({
      clientId,
      uuid: user.uuid,
      username: user.username ?? user.uuid,
      color: user.color ?? "hsl(0, 70%, 55%)",
      initials: user.initials ?? "?",
      isLocal: clientId === localId,
    });
  }

  return users;
}
