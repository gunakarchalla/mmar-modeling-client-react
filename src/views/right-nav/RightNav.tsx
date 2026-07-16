import { Box, Typography } from "@mui/material";
import { useStateStore } from "@/resources/store/stateStore";
import LogWindow from "@/views/log-window/LogWindow";
import AttributeWindow from "@/views/attribute-window/AttributeWindow";

// Frame port of `views/right-nav/right-nav.{ts,html}`. The old right-nav showed
// <simulation-window> in SimulationMode and <attribute-window> otherwise. The
// AttributeWindow landed in P8; the SimulationWindow is still P12, so that branch
// keeps its placeholder. The switch reads stateStore (the engine's one-way mirror).
// LogWindow (already ported) lives at the bottom of this column, matching the old
// main-body-tab-bar column3 (right-nav + log-window).
export default function RightNav() {
  const activeState = useStateStore((s) => s.activeState);
  const isSimulation = activeState === "SimulationMode";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Box sx={{ flex: 1, overflowY: "auto", p: 1, minHeight: 0 }}>
        {isSimulation ? (
          // P12: <SimulationWindow />
          <Typography variant="caption" color="text.secondary">
            Simulation window (P12)
          </Typography>
        ) : (
          <AttributeWindow firstLevel />
        )}
      </Box>
      <Box sx={{ flex: "0 0 40%", minHeight: 0, borderTop: "1px solid", borderColor: "divider" }}>
        <LogWindow />
      </Box>
    </Box>
  );
}
