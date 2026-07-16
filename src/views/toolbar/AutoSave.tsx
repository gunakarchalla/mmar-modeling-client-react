import { useEffect } from "react";
import { Box, Switch, Tooltip, Typography } from "@mui/material";
import { globalObject } from "@/engine";
import { logger } from "@/resources/services/logger";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { useUiStore } from "@/resources/store/uiStore";

// Port of `views/auto-save/auto-save.{ts,html}`. Owns the 5-second auto-save loop
// and the auto-save toggle. One dependency is not ported yet and is stubbed:
//   - sharedDocService.forTab() — P10 (collaboration). Until then there is never a
//     shared session, so `sharedSessionForTab()` always returns null and only the
//     non-shared branch runs (plan §9 P6: "shared-mode branch behind a collab stub
//     that always returns null until P10").
//
// The engine's globalObject.autoSave is authoritative; uiStore.autoSave is the
// reactive mirror the Switch reads (kept in lockstep by toggle + the effect).

// P10: collaboration is not ported yet — no tab is ever shared.
function sharedSessionForTab(_tabIndex: number): { access: string } | null {
  return null;
}

export default function AutoSave() {
  const autoSave = useUiStore((s) => s.autoSave);
  const setAutoSave = useUiStore((s) => s.setAutoSave);

  // The old auto-save.attached() ran an uncleared 5s setInterval. In React we run it
  // in an effect with cleanup so StrictMode's double-mount does not stack intervals.
  useEffect(() => {
    const interval = setInterval(() => {
      void (async () => {
        const session = sharedSessionForTab(globalObject.selectedTab);
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

  const isShared = sharedSessionForTab(globalObject.selectedTab) !== null;

  function toggle() {
    // Locked in shared mode (no-op) — mirrors auto-save.toggle's guard.
    if (sharedSessionForTab(globalObject.selectedTab)) return;
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
