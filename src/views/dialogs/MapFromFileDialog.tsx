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
import { instanceUtility } from "@/resources/services/instance-utility";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { useUiStore } from "@/resources/store/uiStore";
import { ROBOTIC_SYSTEM_SCENETYPE_UUID } from "@/constants";

/**
 * P9 port of `dialogs/dialog-map-from-file/{ts,html}` — imports a `.zip` holding a
 * URDF plus its referenced meshes into the open Robotic system scene.
 *
 * The dialog is only usable when the open tab's SceneInstance is of the Robotic
 * system scene type; otherwise it shows the original's status message instead of the
 * uploader. That eligibility gate, the zip parsing (unzipit — the P9 dep, and the
 * ONLY place in the client that unzips) and the UI are all live here.
 *
 * P12 STUB — the URDF half is not: `roboticsystem_algorithms` (createZipIndex /
 * processZipUrdf / meshCache) lands in P12 per plan §9. The two module-local no-ops
 * below stand in for it, mirroring the stub convention P5/P6/P8 used. P12 must:
 *   - delete both stubs and import { roboticsystemAlgorithms } from the ported module;
 *   - call roboticsystemAlgorithms.meshCache.clear() where clearMeshCache() is called;
 *   - replace createZipIndex(entries)/processZipUrdf(index) with the real calls
 *     (the old file typed entries as `Record<string, ZipEntry>`, a type re-exported
 *     from roboticsystem_algorithms).
 * Until then a zip is unzipped and its entry count logged, but no links/joints are
 * created — the dialog is inert by design, not broken.
 */

// P12: roboticsystemAlgorithms.meshCache.clear()
function clearMeshCache(): void {
  // no-op until P12
}

// P12: roboticsystemAlgorithms.createZipIndex(entries) -> processZipUrdf(zipIndex)
async function processZipUrdf(entries: Record<string, unknown>): Promise<void> {
  logger.log(
    `Zip read: ${Object.keys(entries).length} entries. URDF mapping arrives in P12.`,
    "info",
  );
}

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
      clearMeshCache();
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
      clearMeshCache();

      // Parse the zip in-memory. unzipit exposes a plain object of entries keyed by path.
      const { entries } = await unzipit.unzip(file);

      setFile(null);

      // Discover a URDF file in the zip and instantiate links/joints.
      await processZipUrdf(entries as unknown as Record<string, unknown>);
    } catch (e) {
      logger.log(`Mapping failed: ${describeError(e)}`, "error");
    } finally {
      // Ensure transient structures don't survive the import. Mesh data referenced by
      // created instances (urdfVizRep) stays alive as needed.
      clearMeshCache();
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
