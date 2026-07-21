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
  Stack,
  TextField,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material";
import type { SceneInstance, SceneType } from "@gds";
import { globalObject, globalClassObject, globalRelationclassObject, sceneInitiator } from "@/engine";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { instanceUtility } from "@/resources/services/instance-utility";
import { persistencyHandler } from "@/resources/services/persistency-handler";
import { loadAllSceneInstances } from "@/resources/services/scene-tree-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";
import { duplicateSceneInstance } from "@/views/dialogs/copySceneModel";

// Port of `dialogs/dialog-copy-scene/{ts,html}` — duplicates an existing
// SceneInstance under a new name, with every uuid in the graph rewritten
// (see copySceneModel.duplicateSceneInstance for that half + its two deviations).
// Opened from the SceneGroup "Duplicate" button via uiStore 'copyScene'.
//
// The scene list comes from globalObject.sceneTree (SceneGroup owns it, P7) — the
// old dialog took the same tree through a `@bindable tree` prop, and its template
// flattened `tree[].children` into one <mdc-select>. Selection is keyed by uuid
// because MUI's Select compares values by identity.
//
// P12: the hybrid algorithms run after loading the copy, to re-resolve reference
// attributes in the duplicate (no-op for every scene type but ObjectSpace/Statechange).
type SceneTypeNode = SceneType & { children?: SceneInstance[] };

export default function CopySceneDialog() {
  const open = useUiStore((s) => s.dialogs.copyScene);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [sceneInstances, setSceneInstances] = useState<SceneInstance[]>([]);
  const [selectedUuid, setSelectedUuid] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [loadingScenes, setLoadingScenes] = useState(false);

  // Flatten the tree each time the dialog opens (the old dialog's commented-out
  // constructor did this once; reading on open keeps it fresh after imports/creates).
  // The tree is lazy now (scene-tree-service), and duplicating needs the *hydrated*
  // scene — its class/relation/attribute instances are what gets cloned — so pull in
  // every type's instances before flattening.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSelectedUuid("");
    setName("");
    setDescription("");
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
    const uuid = event.target.value;
    setSelectedUuid(uuid);
    const instance = sceneInstances.find((si) => si.uuid === uuid);
    if (instance) setName(instance.name + " - Copy");
  }

  async function createNewScene() {
    if (selectedSceneInstance && instanceUtility.checkIfSceneInstance(selectedSceneInstance)) {
      const newSceneInstance = duplicateSceneInstance(selectedSceneInstance, name, description);

      await sceneInitiator.sceneInit();
      await instanceUtility.createTabContextSceneInstance(newSceneInstance);
      await persistencyHandler.loadPersistedModel(newSceneInstance);

      // set globalClassObject classes
      globalClassObject.initClasses();
      globalRelationclassObject.initRelationClasses();

      //check hybrid algorithms -> specifically for reference attributes --> we do not
      //give an attributeInstance as argument (P12: live)
      await hybridAlgorithmsService.checkHybridAlgorithms(null, newSceneInstance.class_instances);

      logger.log(`SceneInstance with name ${newSceneInstance.name} created`, "info");
    }

    eventBus.publish("updateSceneGroup");
    closeDialog("copyScene");
  }

  function cancel() {
    logger.log("cancel button clicked", "close");
    closeDialog("copyScene");
  }

  return (
    <Dialog open={open} onClose={cancel} maxWidth="sm" fullWidth>
      <DialogTitle>Enter your value</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {loadingScenes && <LinearProgress aria-label="loading scene instances" />}
          <FormControl fullWidth required disabled={loadingScenes}>
            <InputLabel id="copy-scene-instance-label">
              {loadingScenes ? "Loading scenes…" : "Select SceneInstance"}
            </InputLabel>
            <Select
              labelId="copy-scene-instance-label"
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

          {selectedSceneInstance && (
            <>
              <TextField
                label="Name"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
              />
              <TextField
                label="Description"
                multiline
                minRows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
              />
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() =>
            void createNewScene().catch((err) => logger.log(describeError(err), "error"))
          }
          disabled={!selectedSceneInstance}
        >
          Copy SceneInstance
        </Button>
        <Button onClick={cancel}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
