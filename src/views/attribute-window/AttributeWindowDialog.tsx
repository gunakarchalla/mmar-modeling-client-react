import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from "@mui/material";
import { logger } from "@/resources/services/logger";
import AttributeWindow from "./AttributeWindow";

/**
 * P8 port of `dialogs/dialog-attribute-window/{ts,html}` — the "second level" attribute
 * window: the same window again, inside a dialog, at `firstLevel={false}`.
 *
 * IT IS NOT RENDERED ANYWHERE, and that is faithful: in the old client BOTH ends of
 * this feature are commented out — the button that opened it
 * (attribute-window.html:42-44, `<button ... click.trigger="attributeDialog.open()">`)
 * and the `<mdc-dialog view-model.ref="attributeDialog">` that hosted it
 * (attribute-window.html:177-179). So `dialog-attribute-window` is dead code upstream:
 * nothing can open it. It is ported here so the parity audit in P13 finds it, and so a
 * future phase that wants the feature only has to render it.
 *
 * Consequence: the `firstLevel` bindable it exists to set is vestigial. Its only other
 * job was choosing between two uppy drag-drop element ids in the gltf/image upload
 * dialogs, and uppy is dropped (plan §3.3). See state.json → discoveries (P8).
 */
interface AttributeWindowDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function AttributeWindowDialog({ open, onClose }: AttributeWindowDialogProps) {
  function close() {
    logger.log("close", "close");
    onClose();
  }

  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <DialogTitle>Attribute Window</DialogTitle>
      <DialogContent>
        <AttributeWindow firstLevel={false} />
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
