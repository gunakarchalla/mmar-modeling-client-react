import { Box, IconButton, Tooltip, Button } from "@mui/material";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import UndoIcon from "@mui/icons-material/Undo";
import RedoIcon from "@mui/icons-material/Redo";
import DeleteIcon from "@mui/icons-material/Delete";
import { engine, deletionHandler } from "@/engine";
import { useAuthStore } from "@/resources/store/authStore";
import { logger } from "@/resources/services/logger";
import CameraToggle from "./CameraToggle";
import AutoSave from "./AutoSave";

// Vertical divider matching the old `.vl` rule (1px light-grey separator).
function VDivider() {
  return <Box sx={{ borderLeft: "1px solid #bdbdbd", height: 24, mx: 0.5 }} />;
}

// Port of `views/toolbar-container/toolbar-container.{ts,html}`. Zoom/Undo/Redo are
// disabled stubs (the old handlers only logged). Delete drives the deletion handler.
// Logout replaces the old localStorage-remove + reload with authStore.logout (which
// re-shows the sign-in dialog). AutoSave + CameraToggle are separate components.
// The user-legend (right side) arrives in P11.
export default function Toolbar() {
  const logout = useAuthStore((s) => s.logout);

  function onDelete() {
    logger.log("delete", "info");
    if (!engine.isInitialized) return;
    deletionHandler.onPressDelete();
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", width: "100%", height: "100%", px: 1 }}>
      <Button variant="outlined" size="small" onClick={() => logout()} sx={{ mr: 1 }}>
        Logout
      </Button>

      <Tooltip title="zoom in">
        <span>
          <IconButton size="small" disabled onClick={() => logger.log("zoomIn", "info")}>
            <ZoomInIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="zoom out">
        <span>
          <IconButton size="small" disabled onClick={() => logger.log("zoomOut", "info")}>
            <ZoomOutIcon />
          </IconButton>
        </span>
      </Tooltip>

      <VDivider />
      <AutoSave />
      <VDivider />

      <Tooltip title="undo">
        <span>
          <IconButton size="small" disabled onClick={() => logger.log("undo", "info")}>
            <UndoIcon />
          </IconButton>
        </span>
      </Tooltip>
      <Tooltip title="redo">
        <span>
          <IconButton size="small" disabled onClick={() => logger.log("redo", "info")}>
            <RedoIcon />
          </IconButton>
        </span>
      </Tooltip>

      <VDivider />
      <Tooltip title="delete">
        <IconButton size="small" onClick={onDelete}>
          <DeleteIcon />
        </IconButton>
      </Tooltip>
      <VDivider />

      <CameraToggle />

      <Box sx={{ flex: 1 }} />
      {/* P11: <UserLegend /> — collaboration presence chips */}
    </Box>
  );
}
