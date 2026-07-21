import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import type { SceneInstance, SceneType } from "@gds";
import { globalObject } from "@/engine";
import { backendService } from "@/resources/services/backend-service";
import { loadAllSceneInstances } from "@/resources/services/scene-tree-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";
import { useTabsStore } from "@/resources/store/tabsStore";
import { closeTab } from "@/views/layout/tabActions";

// Port of `dialogs/dialog-delete-scene/{ts,html}` — deletes a SceneInstance from the
// database, then republishes 'initSceneGroup' so the tree re-fetches (SceneGroup
// subscribes that channel, P7). Opened from SceneGroup's "Delete" button.
//
// Like the copy dialog, the scene list is flattened from globalObject.sceneTree and
// keyed by uuid. The old class injected eight collaborators but used exactly one
// (fetchHelper) — the rest are dropped here, the same pruning P5/P7 did.
//
// If the deleted scene happens to be open in a tab, that tab is closed as part of the
// deletion (via tabActions.closeTab), so a stale tab can't survive to re-create the
// scene on its next auto-save PATCH (persistency-handler falls back to POST on a 404).
type SceneTypeNode = SceneType & { children?: SceneInstance[] };

export default function DeleteSceneDialog() {
  const open = useUiStore((s) => s.dialogs.deleteScene);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [sceneInstances, setSceneInstances] = useState<SceneInstance[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string>("");
  const [loadingScenes, setLoadingScenes] = useState(false);

  // The picker lists every scene, but the tree now only holds the SceneTypes the user
  // has expanded, so pull the rest in first (see scene-tree-service).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSelectedUuid("");
    setLoadingScenes(true);
    void loadAllSceneInstances()
      .catch((err) => logger.log(`Loading scene instances failed: ${describeError(err)}`, "error"))
      .finally(() => {
        if (cancelled) return;
        const tree = (globalObject.sceneTree ?? []) as SceneTypeNode[];
        setSceneInstances(tree.flatMap((sceneType) => sceneType.children ?? []));
        setLoadingScenes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedSceneInstance = sceneInstances.find((si) => si.uuid === selectedUuid) ?? null;

  function onSelectionChange(event: SelectChangeEvent) {
    setSelectedUuid(event.target.value);
  }

  async function deleteScene() {
    if (!selectedSceneInstance) return;
    const uuid = selectedSceneInstance.uuid;

    await backendService.sceneInstancesAllDELETE2(uuid);
    logger.log("SceneInstance" + uuid + " deleted", "delete");

    // If the deleted scene is open in a tab, close it so the tab bar and engine don't
    // keep a stale tab pointing at a now-nonexistent SceneInstance.
    const openTabIndex = useTabsStore.getState().tabs.findIndex((tab) => tab.uuid === uuid);
    if (openTabIndex !== -1) {
      await closeTab(openTabIndex);
    }

    eventBus.publish("initSceneGroup");
    setSelectedUuid("");
    closeDialog("deleteScene");
  }

  function cancel() {
    logger.log("cancel button clicked", "close");
    closeDialog("deleteScene");
  }

  return (
    <Dialog open={open} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Delete SceneInstance</DialogTitle>
      <DialogContent>
        {loadingScenes && <LinearProgress aria-label="loading scene instances" sx={{ mt: 1 }} />}
        <FormControl fullWidth required sx={{ mt: 1 }} disabled={loadingScenes}>
          <InputLabel id="delete-scene-instance-label">
            {loadingScenes ? "Loading scenes…" : "Select SceneInstance"}
          </InputLabel>
          <Select
            labelId="delete-scene-instance-label"
            label={loadingScenes ? "Loading scenes…" : "Select SceneInstance"}
            value={selectedUuid}
            onChange={onSelectionChange}
          >
            {sceneInstances.map((sceneInstance) => (
              <MenuItem key={sceneInstance.uuid} value={sceneInstance.uuid}>
                {sceneInstance.name} | {sceneInstance.uuid}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() =>
            void deleteScene().catch((err) => logger.log(describeError(err), "error"))
          }
          disabled={!selectedSceneInstance}
        >
          Delete SceneInstance
        </Button>
        <Button onClick={cancel}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
