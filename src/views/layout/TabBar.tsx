import { SyntheticEvent } from "react";
import { Box, Tabs, Tab, IconButton } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { useTabsStore } from "@/resources/store/tabsStore";
import { switchToTab, closeTab } from "./tabActions";

// Port of the tab bar half of `main-body-tab-bar.html` (the mdc-tab-bar repeat over
// tabContext). Each tab shows the SceneInstance name + a close ×. Selecting a tab
// runs switchToTab (engine scene swap + store), closing runs closeTab. Both keep
// tabsStore and globalObject.tabContext in sync (see tabActions).
export default function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const selectedTab = useTabsStore((s) => s.selectedTab);

  function handleChange(_e: SyntheticEvent, value: number) {
    void switchToTab(value);
  }

  function handleClose(e: SyntheticEvent, index: number) {
    e.stopPropagation();
    void closeTab(index);
  }

  return (
    <Tabs
      value={selectedTab >= 0 && selectedTab < tabs.length ? selectedTab : false}
      onChange={handleChange}
      variant="scrollable"
      scrollButtons="auto"
      sx={{ minHeight: 40, height: "100%" }}
    >
      {tabs.map((tab, index) => (
        <Tab
          key={tab.uuid}
          value={index}
          sx={{ minHeight: 40, textTransform: "none", pr: 0.5 }}
          label={
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {tab.name || "(unnamed)"}
              <IconButton
                component="span"
                size="small"
                onClick={(e) => handleClose(e, index)}
                aria-label={`close ${tab.name}`}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          }
        />
      ))}
    </Tabs>
  );
}
