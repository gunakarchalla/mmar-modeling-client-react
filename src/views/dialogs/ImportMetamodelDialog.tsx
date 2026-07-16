import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemText,
  Stack,
  Typography,
} from "@mui/material";
import { SceneType } from "@gds";
import { globalObject } from "@/engine";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * P9 port of `dialogs/dialog-import-metamodel/{ts,html}` — loads exported SceneType
 * JSON from disk into globalObject.importSceneTypes AND globalObject.sceneTypes (so
 * the imported type is immediately available to the tree + the create-scene dialog),
 * then publishes 'updateSceneGroup'. As with import-model, nothing is sent to the
 * server and the "Load to database" button stays disabled (no handler upstream).
 *
 * PLAN CORRECTION: plan §9 P9 describes this dialog as "zip via unzipit". It is not —
 * the old uppy config restricts to `allowedFileTypes: ['.json']` and there is no zip
 * handling anywhere in its 81 lines. Only dialog-map-from-file unzips. Ported as the
 * source actually behaves (JSON only); logged in state.json discoveries.
 *
 * DEVIATION (bug fix): the original created ONE FileReader outside the file loop and
 * called readAsDataURL on it for every file, then attached the "load" listener AFTER
 * the loop. Each read cancels the previous one on a shared reader, so selecting N
 * files imported only the last — and the listener registration racing the reads made
 * even that timing-dependent. Reading each file with `await file.text()` imports every
 * selected file, which is plainly what the loop intended. (Same `.text()` vs
 * `atob(dataUrl.substring(29))` simplification as ImportModelDialog.)
 */
export default function ImportMetamodelDialog() {
  const open = useUiStore((s) => s.dialogs.importMetamodel);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (open) setFiles([]);
  }, [open]);

  async function loadLocal() {
    for (const file of files) {
      const result: unknown = JSON.parse(await file.text());

      // convert the json to a SceneType object (gds fromJS, never the app's
      // plainToInstance — see P3's class-transformer rule).
      const sceneType = SceneType.fromJS(result) as SceneType;
      globalObject.importSceneTypes.push(sceneType);
      globalObject.sceneTypes.push(sceneType);

      logger.log("sceneType: " + sceneType.uuid + " pushed to importSceneTypes", "info");
    }

    // publish the event to update the scene group
    eventBus.publish("updateSceneGroup");
    setFiles([]);
    closeDialog("importMetamodel");
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("importMetamodel")} maxWidth="sm" fullWidth>
      <DialogTitle>Upload some Metamodels:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button component="label" variant="outlined">
            Choose files
            <input
              hidden
              type="file"
              accept=".json"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </Button>
          {files.length > 0 ? (
            <List dense>
              {files.map((file) => (
                <ListItem key={file.name}>
                  <ListItemText primary={file.name} />
                </ListItem>
              ))}
            </List>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No files selected.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button
          onClick={() => void loadLocal().catch((err) => logger.log(describeError(err), "error"))}
          disabled={files.length === 0}
        >
          Load local
        </Button>
        {/* Disabled with no handler in the old template — kept for parity. */}
        <Button disabled>Load to database</Button>
      </DialogActions>
    </Dialog>
  );
}
