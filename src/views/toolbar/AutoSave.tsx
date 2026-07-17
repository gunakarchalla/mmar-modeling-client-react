import { useEffect } from "react";
import { Box, Switch, Tooltip, Typography } from "@mui/material";
import { globalObject } from "@/engine";
import { logger } from "@/resources/services/logger";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { useUiStore } from "@/resources/store/uiStore";
import { useCollabStore } from "@/resources/store/collabStore";
import { useTabsStore } from "@/resources/store/tabsStore";
import { sharedDocService } from "@/resources/collaboration/shared-doc-service";

// Port of `views/auto-save/auto-save.{ts,html}`. Owns the 5-second auto-save loop
// and the auto-save toggle. P10 replaced the `sharedSessionForTab()` stub with the
// real `sharedDocService.forTab()` lookup, so the shared branch (force auto-save on,
// read-access alert) is now reachable.
//
// The engine's globalObject.autoSave is authoritative; uiStore.autoSave is the
// reactive mirror the Switch reads (kept in lockstep by toggle + the effect).
//
// `isShared` is derived from the ACTIVE tab's session, which is engine state
// (globalObject.selectedTab + sharedDocService) and therefore not reactive on its own.
// The old template bound `disabled.bind="isShared"` to a getter that Aurelia's dirty
// checker re-evaluated every cycle, so it tracked BOTH a session attaching and a tab
// switch. React needs both signals named explicitly, hence the two subscriptions
// below: collabStore.tabs (a session attached/detached) and tabsStore.selectedTab (the
// user moved to a different tab). Dropping either leaves the switch showing the
// previous tab's shared state.

export default function AutoSave() {
  const autoSave = useUiStore((s) => s.autoSave);
  const setAutoSave = useUiStore((s) => s.setAutoSave);
  const collabTabs = useCollabStore((s) => s.tabs);
  const selectedTab = useTabsStore((s) => s.selectedTab);

  // The old auto-save.attached() ran an uncleared 5s setInterval. In React we run it
  // in an effect with cleanup so StrictMode's double-mount does not stack intervals.
  useEffect(() => {
    const interval = setInterval(() => {
      void (async () => {
        const session = sharedDocService.forTab(globalObject.selectedTab);
        const isShared = session !== null;

        if (isShared) {
          // Force auto-save on in shared mode.
          if (!globalObject.autoSave) {
            globalObject.autoSave = true;
            setAutoSave(true);
          }
          if (globalObject.doSceneInstancePatchLocal && session!.access !== "read") {
            logger.log("AutoSave (shared): saving local changes", "info");
            await persistencyHandler.persistSceneInstanceToDB();
            globalObject.doSceneInstancePatchLocal = false;
          } else if (globalObject.doSceneInstancePatchLocal && session!.access === "read") {
            window.alert("You don't have enough authorization to edit this scene instance.");
            globalObject.doSceneInstancePatchLocal = false;
          }
        } else {
          // Non-shared: save when auto-save is on and a local patch is pending.
          if (globalObject.autoSave && globalObject.doSceneInstancePatch) {
            logger.log("AutoSave: " + globalObject.autoSave, "info");
            await persistencyHandler.persistSceneInstanceToDB();
            globalObject.doSceneInstancePatch = false;
          }
        }
      })();
    }, 5000);
    return () => clearInterval(interval);
  }, [setAutoSave]);

  // collabStore holds an entry for exactly the shared tabs, keyed by tab index, so the
  // rendered state derives from reactive data only — no engine read, and it updates on
  // both triggers. The 5 s loop and toggle() below still go through sharedDocService
  // (the getState()-equivalent), per the two-forms rule in plan §3.1.
  const isShared = selectedTab in collabTabs;

  function toggle() {
    // Locked in shared mode (no-op) — mirrors auto-save.toggle's guard.
    if (sharedDocService.forTab(globalObject.selectedTab)) return;
    const next = !globalObject.autoSave;
    globalObject.autoSave = next;
    setAutoSave(next);
    logger.log("AutoSave toggle: " + next, "info");
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <Tooltip title={isShared ? "Auto-save is locked in shared mode" : "Toggle auto-save"}>
        <Switch checked={autoSave} onChange={toggle} disabled={isShared} size="small" />
      </Tooltip>
      <Typography variant="caption" sx={{ mr: 1 }}>
        Autosave
      </Typography>
    </Box>
  );
}
