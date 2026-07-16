import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import type { AttributeInstance } from "@gds";
import { eventBus } from "@/resources/services/event-bus";
import { fileUtility } from "@/resources/services/file-utility";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";

/**
 * P8 port of `dialogs/dialog-upload-gltf/{ts,html}`. Reads a `.gltf` / `.referenceobject`
 * into the attribute instance's value as a string — glTF as text (it is JSON), a
 * `.referenceobject` as a data URL, exactly like the original's two `FileReader` paths.
 * Nothing is posted to the server: the value IS the model (P4's graphic_gltf accepts
 * `string | ArrayBuffer`).
 *
 * uppy → MUI file input (plan §3.3, LOCKED), with the old `allowedFileTypes`
 * restriction preserved as the input's `accept`.
 *
 * The old dialog published `gltfUploaded` on a 1 s `setTimeout` "to wait for the files
 * to be read", because uppy's read was fire-and-forget. Here the read is awaited, so
 * the event is published once the value is actually set — no timer, no race.
 *
 * `firstLevel` only ever chose between two uppy drag-drop target element ids
 * (`#dragdropfirstlevel` / `#dragdropsecondlevel`) so the dashboard was not mounted
 * twice. With uppy gone it has no behaviour left; kept as a prop for parity.
 */
interface Payload {
  attributeInstance: AttributeInstance;
}

interface UploadGltfDialogProps {
  firstLevel?: boolean;
}

export default function UploadGltfDialog({ firstLevel = true }: UploadGltfDialogProps) {
  void firstLevel; // vestigial — see the note above.

  const open = useUiStore((s) => s.dialogs.uploadGltf);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const payload = useUiStore((s) => s.dialogPayloads.uploadGltf) as Payload | undefined;
  const attributeInstance = payload?.attributeInstance;

  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) setFile(null);
  }, [open]);

  async function load() {
    if (!file || !attributeInstance) return;

    // if file name is .referenceobject, read as data url; otherwise read the glTF as text
    const isReferenceObject = file.name.includes(".referenceobject");
    const value = isReferenceObject ? await fileUtility.FiletoDataUrl(file) : await file.text();
    logger.log(isReferenceObject ? "Reference object uploaded" : "GLTF uploaded", "info");

    attributeInstance.value = value;

    //publish the event to update the scene group
    eventBus.publish("gltfUploaded", {
      attributeInstanceUuid: attributeInstance.uuid,
      fileUuid: "",
      attributeInstance,
    });
    closeDialog("uploadGltf");
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("uploadGltf")} maxWidth="sm" fullWidth>
      <DialogTitle>Upload GLTF:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button variant="outlined" component="label">
            Choose .gltf / .referenceobject
            <input
              hidden
              type="file"
              accept=".gltf,.referenceobject"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="upload-gltf-input"
            />
          </Button>
          <Typography variant="body2" color="text.secondary">
            {file ? file.name : "No file selected"}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => closeDialog("uploadGltf")}>Cancel</Button>
        <Button
          disabled={!file}
          onClick={() =>
            void load().catch((err) => logger.log("GLTF upload failed: " + describeError(err), "error"))
          }
        >
          Load
        </Button>
      </DialogActions>
    </Dialog>
  );
}
