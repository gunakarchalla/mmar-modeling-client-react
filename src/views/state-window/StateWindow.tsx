import { useEffect, useState } from "react";
import { Box, Button } from "@mui/material";
import PanoramaIcon from "@mui/icons-material/Panorama";
import InfoIcon from "@mui/icons-material/Info";
import { engine, globalStateObject } from "@/engine";
import { useStateStore } from "@/resources/store/stateStore";
import { useUiStore } from "@/resources/store/uiStore";

// Port of `views/state-window/state-window.{ts,html}`. Shows the active
// interaction state (read reactively from stateStore, the engine's one-way mirror
// — plan §3.2), a "View Mode" button that puts the engine into ViewMode, and an
// "Info" button that opens the user-info dialog (rendered in P9) and blinks red
// 10× on mount (blinkInfoButton).
export default function StateWindow() {
  const activeState = useStateStore((s) => s.activeState);
  const openDialog = useUiStore((s) => s.openDialog);
  const [infoRed, setInfoRed] = useState(false);

  // blinkInfoButton(): toggle red 10 times every 0.5s, then stop. Cleaned up on
  // unmount so StrictMode's double-mount does not leave a stray interval.
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setInfoRed(i % 2 === 0);
      i++;
      if (i === 20) {
        setInfoRed(false);
        clearInterval(interval);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // ViewMode (state 1). onStateChange touches transformControls/orbitControls, which
  // exist only after the engine has mounted — guard so a pre-mount click is a no-op
  // (P5 note: never call setState from a component before the canvas is mounted).
  function viewClicked() {
    if (!engine.isInitialized) return;
    globalStateObject.setState(1);
  }

  return (
    <Box
      sx={{
        height: "100%",
        width: "100%",
        textAlign: "center",
        alignContent: "center",
        fontSize: "8pt",
      }}
    >
      State: {activeState || "—"}
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
        <Button size="small" onClick={viewClicked} sx={{ flex: 1 }} startIcon={<PanoramaIcon />}>
          View Mode
        </Button>
        <Button
          size="small"
          onClick={() => openDialog("userInfo")}
          sx={{ flex: 1, color: infoRed ? "red" : undefined }}
          startIcon={<InfoIcon />}
        >
          Info
        </Button>
      </Box>
    </Box>
  );
}
