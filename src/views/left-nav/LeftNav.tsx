import { Box, Divider, Typography } from "@mui/material";
import { useTabsStore } from "@/resources/store/tabsStore";

// Frame port of `views/left-nav/left-nav.{ts,html}`. The old left-nav rendered
// <scenegroup> always and, only when a tab is open, the <class-buttongroup> +
// <relationclass-buttongroup> palettes. Those three views are ported in P7
// (scenegroup + persistency) — here we render the frame and placeholders so the
// column exists and reacts to whether a tab is open.
//
// The old client tracked "openTab" via the `tabChanged` event
// (`selectedTab >= 0`). We derive the same signal reactively from tabsStore
// (selectedTab >= 0) instead of subscribing to the bus.
export default function LeftNav() {
  const openTab = useTabsStore((s) => s.selectedTab >= 0 && s.tabs.length > 0);

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 1 }}>
      {/* P7: <SceneGroup /> — scene-type tree + open-on-double-click */}
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        Scenes
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Scene tree (P7)
      </Typography>

      {openTab && (
        <>
          <Divider sx={{ my: 1 }} />
          {/* P7: <ClassButtonGroup /> + <RelationclassButtonGroup /> palettes */}
          <Typography variant="caption" color="text.secondary">
            Class / relationclass palette (P7)
          </Typography>
        </>
      )}
    </Box>
  );
}
