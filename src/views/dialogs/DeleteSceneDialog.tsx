import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import type { SceneInstance, SceneType } from "@gds";
import { globalObject } from "@/engine";
import { backendService } from "@/resources/services/backend-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";

// Port of `dialogs/dialog-delete-scene/{ts,html}` — deletes a SceneInstance from the
// database, then republishes 'initSceneGroup' so the tree re-fetches (SceneGroup
// subscribes that channel, P7). Opened from SceneGroup's "Delete" button.
//
// Like the copy dialog, the scene list is flattened from globalObject.sceneTree and
// keyed by uuid. The old class injected eight collaborators but used exactly one
// (fetchHelper) — the rest are dropped here, the same pruning P5/P7 did.
//
// NOTE the deletion is not confirmed twice and does not close the scene's tab if it
// happens to be open; that matches the old dialog. A tab left open on a deleted
// scene will fail its next auto-save PATCH (persistency-handler falls back to POST
// on 404, which effectively re-creates it) — pre-existing behaviour, not introduced here.
type SceneTypeNode = SceneType & { children?: SceneInstance[] };

export default function DeleteSceneDialog() {
  const open = useUiStore((s) => s.dialogs.deleteScene);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [sceneInstances, setSceneInstances] = useState<SceneInstance[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    const tree = (globalObject.sceneTree ?? []) as SceneTypeNode[];
    setSceneInstances(tree.flatMap((sceneType) => sceneType.children ?? []));
    setSelectedUuid("");
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
        <FormControl fullWidth required sx={{ mt: 1 }}>
          <InputLabel id="delete-scene-instance-label">Select SceneInstance</InputLabel>
          <Select
            labelId="delete-scene-instance-label"
            label="Select SceneInstance"
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
