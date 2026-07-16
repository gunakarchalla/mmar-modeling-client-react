import { Box, Divider } from "@mui/material";
import { useTabsStore } from "@/resources/store/tabsStore";
import SceneGroup from "@/views/scenegroup/SceneGroup";
import ClassButtonGroup from "@/views/palette/ClassButtonGroup";
import RelationclassButtonGroup from "@/views/palette/RelationclassButtonGroup";

// Port of `views/left-nav/left-nav.{ts,html}`. The old left-nav rendered
// <scenegroup> always and, only when a tab is open, the <class-buttongroup> +
// <relationclass-buttongroup> palettes. P7 fills the frame with the real
// SceneGroup tree + the two palette button-groups.
//
// The old client tracked "openTab" via the `tabChanged` event
// (`selectedTab >= 0`). We derive the same signal reactively from tabsStore.
export default function LeftNav() {
  const openTab = useTabsStore((s) => s.selectedTab >= 0 && s.tabs.length > 0);

  return (
    <Box sx={{ height: "100%", overflowY: "auto", p: 1 }}>
      <SceneGroup />

      {openTab && (
        <>
          <Divider sx={{ my: 1 }} />
          <ClassButtonGroup />
          <Divider sx={{ my: 1 }} />
          <RelationclassButtonGroup />
        </>
      )}
    </Box>
  );
}
