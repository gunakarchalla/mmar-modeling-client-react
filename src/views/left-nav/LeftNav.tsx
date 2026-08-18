import { Box, Divider } from "@mui/material";
import { useTabsStore } from "@/resources/store/tabsStore";
import SceneGroup from "@/views/scenegroup/SceneGroup";
import ClassButtonGroup from "@/views/palette/ClassButtonGroup";
import RelationclassButtonGroup from "@/views/palette/RelationclassButtonGroup";

// Left column: the scene tree, plus the class and relation-class palettes — the two
// palettes only once a tab is open, which is derived reactively from `tabsStore`.
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
