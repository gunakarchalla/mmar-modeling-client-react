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
import { SceneInstance } from "@gds";
import { globalObject } from "@/engine";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { eventBus } from "@/resources/services/event-bus";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * P9 port of `dialogs/dialog-import-model/{ts,html}` — loads exported SceneInstance
 * JSON files from disk into globalObject.importSceneInstances, then publishes
 * 'updateSceneGroup' so SceneGroup folds them into the tree (P7's updateTree).
 * Nothing is sent to the server: the old "Load to database" button was `disabled`
 * with no handler, and is kept disabled here for parity.
 *
 * uppy → MUI file input (plan §3.3 LOCKED); the old uppy `allowedFileTypes:
 * ['.json', '.zip']` becomes the input's `accept`. Multiple files are supported, as
 * in the original.
 *
 * TWO deliberate simplifications, both matching what P8's upload dialogs did:
 *
 * 1. Files are read with `await file.text()` instead of the old
 *    `readAsDataURL` → `atob(string.substring(29))` dance. The magic 29 was the
 *    length of the `data:application/json;base64,` prefix — reading the text
 *    directly yields the same JSON without depending on that prefix's length.
 * 2. The old code published 'updateSceneGroup' on a 1 s `setTimeout` "to wait for
 *    the files to be read", because its FileReader callbacks were fire-and-forget.
 *    The reads are awaited here, so the publish happens once the instances are
 *    actually pushed — no timer, no race.
 *
 * `.zip` is in `accept` because the original allowed it, but the original had no zip
 * branch either: it fed the bytes straight to JSON.parse, which throws. A zip
 * therefore surfaces as a logged parse error rather than silently doing nothing.
 * (Only dialog-map-from-file actually unzips — plan §9's "import-metamodel ... zip
 * via unzipit" does not match the source; see state.json discoveries.)
 */
export default function ImportModelDialog() {
  const open = useUiStore((s) => s.dialogs.importModel);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [files, setFiles] = useState<File[]>([]);

  useEffect(() => {
    if (open) setFiles([]);
  }, [open]);

  async function loadLocal() {
    for (const file of files) {
      const result: unknown = JSON.parse(await file.text());

      // convert the json to a SceneInstance object.
      // gds fromJS, NOT the app's plainToInstance (P3): the app's copy of
      // class-transformer lacks gds's @Type metadata and would leave nested
      // class_instances as plain Objects, breaking every instanceof downstream.
      const sceneInstance = SceneInstance.fromJS(result) as SceneInstance;
      globalObject.importSceneInstances.push(sceneInstance);
      logger.log("sceneInstance: " + sceneInstance.uuid + " pushed to importSceneInstances", "info");
    }

    // publish the event to update the scene group
    eventBus.publish("updateSceneGroup");
    setFiles([]);
    closeDialog("importModel");
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("importModel")} maxWidth="sm" fullWidth>
      <DialogTitle>Upload some Models:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button component="label" variant="outlined">
            Choose files
            <input
              hidden
              type="file"
              accept=".json,.zip"
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
