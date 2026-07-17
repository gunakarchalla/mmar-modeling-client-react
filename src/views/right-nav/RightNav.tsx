import { Box } from "@mui/material";
import { useStateStore } from "@/resources/store/stateStore";
import LogWindow from "@/views/log-window/LogWindow";
import AttributeWindow from "@/views/attribute-window/AttributeWindow";
import SimulationWindow from "@/views/simulation-window/SimulationWindow";

// Port of `views/right-nav/right-nav.{ts,html}`, now complete: the old right-nav showed
// <simulation-window> in SimulationMode and <attribute-window> otherwise (AttributeWindow
// landed in P8, SimulationWindow in P12). The switch reads stateStore (the engine's
// one-way mirror). LogWindow (already ported) lives at the bottom of this column,
// matching the old main-body-tab-bar column3 (right-nav + log-window).
//
// NOTE the old client kept <simulation-window> MOUNTED at all times and let it refresh
// on every 'tabChanged'; here it mounts only in SimulationMode, so it also refreshes on
// mount (see its header). That is what makes leaving/re-entering SimulationMode rebuild
// the sliders rather than show a stale list.
export default function RightNav() {
  const activeState = useStateStore((s) => s.activeState);
  const isSimulation = activeState === "SimulationMode";

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <Box sx={{ flex: 1, overflowY: "auto", p: 1, minHeight: 0 }}>
        {isSimulation ? <SimulationWindow /> : <AttributeWindow firstLevel />}
      </Box>
      <Box sx={{ flex: "0 0 40%", minHeight: 0, borderTop: "1px solid", borderColor: "divider" }}>
        <LogWindow />
      </Box>
    </Box>
  );
}
