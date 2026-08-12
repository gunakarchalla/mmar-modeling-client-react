import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";
import * as unzipit from "unzipit";
import {
  roboticsystemAlgorithms,
  type ZipEntry,
} from "@/engine/hybrid-algorithms/roboticsystem-algorithms";
import { instanceUtility } from "@/resources/services/instance-utility";
import { historyService } from "@/resources/services/history-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";
import { ROBOTIC_SYSTEM_SCENETYPE_UUID } from "@/constants";

/**
 * P9 port of `dialogs/dialog-map-from-file/{ts,html}` — imports a `.zip` holding a
 * URDF plus its referenced meshes into the open Robotic system scene. COMPLETED in P12:
 * the URDF half (roboticsystem-algorithms) is now live, so a zip really does create
 * Link/Joint instances.
 *
 * The dialog is only usable when the open tab's SceneInstance is of the Robotic
 * system scene type; otherwise it shows the original's status message instead of the
 * uploader. The zip parsing uses unzipit (the P9 dep, and the ONLY place in the client
 * that unzips); its entries are indexed by roboticsystem-algorithms so the URDF's mesh
 * references resolve against the in-memory archive rather than over HTTP.
 */

export default function MapFromFileDialog() {
  const open = useUiStore((s) => s.dialogs.mapFromFile);
  const closeDialog = useUiStore((s) => s.closeDialog);

  const [showUploader, setShowUploader] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // Port of refreshEligibility(). Runs on open (the old dialog ran it in both its
  // `openDialogMapFromFile` subscription and attached()).
  const refreshEligibility = useCallback(async () => {
    const sceneInstance = await instanceUtility.getTabContextSceneInstance();
    if (!sceneInstance) {
      setShowUploader(false);
      setStatusMessage("Open a scene instance for mapping from a file.");
      return;
    }
    if (sceneInstance.uuid_scene_type === ROBOTIC_SYSTEM_SCENETYPE_UUID) {
      setShowUploader(true);
      setStatusMessage("Upload a .zip file containing a URDF and its referenced meshes.");
      return;
    }
    setShowUploader(false);
    // "feasture" typo is in the old source; kept verbatim.
    setStatusMessage("This feasture is currently available only for the Robotic System scene type.");
  }, []);

  useEffect(() => {
    if (!open) {
      // Port of detaching()/cleanup(): release the transient import cache on close.
      roboticsystemAlgorithms.meshCache.clear();
      return;
    }
    setFile(null);
    void refreshEligibility().catch((err) => logger.log(describeError(err), "error"));
  }, [open, refreshEligibility]);

  async function upload() {
    if (!showUploader || !file) return;

    // ensure it's a .zip by name or type
    const isZip = file.type === "application/zip" || file.name.toLowerCase().endsWith(".zip");
    if (!isZip) {
      // the old dialog ignored non-zip files silently; the accept filter already
      // makes this hard to hit, so a log beats silence without changing the flow.
      logger.log("Mapping skipped: not a .zip file", "info");
      return;
    }

    try {
      // Clear any previous import cache so this run only caches what it needs.
      roboticsystemAlgorithms.meshCache.clear();

      // Parse the zip in-memory. unzipit exposes a plain object of entries keyed by path.
      const { entries } = await unzipit.unzip(file);

      setFile(null);

      // Index the entries by path/base name, then discover a URDF file in the zip and
      // instantiate links/joints from it.
      const zipIndex = roboticsystemAlgorithms.createZipIndex(entries as unknown as Record<string, ZipEntry>);
      await roboticsystemAlgorithms.processZipUrdf(zipIndex);

      // A URDF import instantiates every link and joint at once. It is one user action,
      // so it is one undo step — with no touched list, which makes the history service
      // diff the whole scene to work out what the import produced.
      historyService.record("map from file");
    } catch (e) {
      logger.log(`Mapping failed: ${describeError(e)}`, "error");
    } finally {
      // Ensure transient structures don't survive the import. Mesh data referenced by
      // created instances (urdfVizRep) stays alive as needed.
      roboticsystemAlgorithms.meshCache.clear();
    }
    closeDialog("mapFromFile");
  }

  return (
    <Dialog open={open} onClose={() => closeDialog("mapFromFile")} maxWidth="sm" fullWidth>
      <DialogTitle>Map file to Scene Instance</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {statusMessage}
          </Typography>
          {showUploader && (
            <>
              <Button component="label" variant="outlined">
                Choose .zip file
                <input
                  hidden
                  type="file"
                  accept=".zip"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Button>
              {file && <Typography variant="body2">{file.name}</Typography>}
            </>
          )}
        </Stack>
      </DialogContent>
      {showUploader && (
        <DialogActions>
          <Button
            onClick={() => void upload().catch((err) => logger.log(describeError(err), "error"))}
            disabled={!file}
          >
            Upload
          </Button>
        </DialogActions>
      )}
    </Dialog>
  );
}
