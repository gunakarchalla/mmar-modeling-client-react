import { Box, Typography } from "@mui/material";
import { useStateStore } from "@/resources/store/stateStore";
import LogWindow from "@/views/log-window/LogWindow";

// Frame port of `views/right-nav/right-nav.{ts,html}`. The old right-nav showed
// <simulation-window> in SimulationMode and <attribute-window> otherwise. The
// AttributeWindow lands in P8 and the SimulationWindow in P12; here we render the
// frame with placeholders that switch on the active state (read from stateStore,
// the engine's one-way mirror). LogWindow (already ported) lives at the bottom of
// this column, matching the old main-body-tab-bar column3 (right-nav + log-window).
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
          // P8: <AttributeWindow firstLevel />
          <Typography variant="caption" color="text.secondary">
            Attribute window (P8)
          </Typography>
        )}
      </Box>
      <Box sx={{ flex: "0 0 40%", minHeight: 0, borderTop: "1px solid", borderColor: "divider" }}>
        <LogWindow />
      </Box>
    </Box>
  );
}
