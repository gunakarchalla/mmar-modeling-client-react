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
 * P8 port of `dialogs/dialog-upload-image/{ts,html}`. Reads an image into the attribute
 * instance's value as a full data URL (the old code kept the `data:image/...;base64,`
 * prefix — the line that stripped it is commented out in the original, and the vizrep
 * code strings expect the prefix), then refreshes the vizrep.
 *
 * uppy → MUI file input (plan §3.3, LOCKED); the old `allowedFileTypes` list becomes
 * the input's `accept`. As in UploadGltfDialog, the original's 1 s `setTimeout` before
 * publishing is gone because the read is awaited here.
 *
 * The old dialog called `vizrepUpdateChecker.checkForVizRepUpdate(...)` directly; we
 * publish `checkForVizRepUpdateByAttributeInstance` (plan §5), which P4's
 * vizrep-update-checker subscribes to.
 */
interface Payload {
  attributeInstance: AttributeInstance;
}

interface UploadImageDialogProps {
  /** Vestigial (old uppy drag-drop target id switch) — see UploadGltfDialog. */
  firstLevel?: boolean;
}

export default function UploadImageDialog({ firstLevel = true }: UploadImageDialogProps) {
  void firstLevel;

  const open = useUiStore((s) => s.dialogs.uploadImage);
  const closeDialog = useUiStore((s) => s.closeDialog);
  const payload = useUiStore((s) => s.dialogPayloads.uploadImage) as Payload | undefined;
  const attributeInstance = payload?.attributeInstance;

  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) setFile(null);
  }, [open]);

  async function load() {
    if (!file || !attributeInstance) return;

    //when a file is loaded, convert it to base64 string
    attributeInstance.value = await fileUtility.FiletoDataUrl(file);

    eventBus.publish("checkForVizRepUpdateByAttributeInstance", attributeInstance);
    //publish the event to update the scene group
    eventBus.publish("imageUploaded", {
      attributeInstanceUuid: attributeInstance.uuid,
      fileUuid: "",
      attributeInstance,
    });
    closeDialog("uploadImage");
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("uploadImage")} maxWidth="sm" fullWidth>
      <DialogTitle>Image:</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Button variant="outlined" component="label">
            Choose image
            <input
              hidden
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.svg,.webp,.bmp,.tiff"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              data-testid="upload-image-input"
            />
          </Button>
          <Typography variant="body2" color="text.secondary">
            {file ? file.name : "No file selected"}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => closeDialog("uploadImage")}>Cancel</Button>
        <Button
          disabled={!file}
          onClick={() =>
            void load().catch((err) => logger.log("Image upload failed: " + describeError(err), "error"))
          }
        >
          Load
        </Button>
      </DialogActions>
    </Dialog>
  );
}
