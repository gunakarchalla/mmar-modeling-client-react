import { useEffect } from "react";
import { Box } from "@mui/material";
import { styled } from "@mui/material/styles";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import TopNavBar from "@/views/top-nav-bar/TopNavBar";
import Toolbar from "@/views/toolbar/Toolbar";
import TabBar from "@/views/layout/TabBar";
import StateWindow from "@/views/state-window/StateWindow";
import LeftNav from "@/views/left-nav/LeftNav";
import RightNav from "@/views/right-nav/RightNav";
import ThreeCanvas from "@/views/three-canvas/ThreeCanvas";
import AppFooter from "@/views/footer/AppFooter";
import SignInDialog from "@/views/auth/SignInDialog";
import AppSnackbar from "@/views/common/AppSnackbar";
import LoadingWindow from "@/views/dialogs/LoadingWindow";
import CreateNewSceneDialog from "@/views/dialogs/CreateNewSceneDialog";
import SaveAsDialog from "@/views/dialogs/SaveAsDialog";
import CopySceneDialog from "@/views/dialogs/CopySceneDialog";
import DeleteSceneDialog from "@/views/dialogs/DeleteSceneDialog";
import ImportModelDialog from "@/views/dialogs/ImportModelDialog";
import ImportMetamodelDialog from "@/views/dialogs/ImportMetamodelDialog";
import MapFromFileDialog from "@/views/dialogs/MapFromFileDialog";
import UserInfoDialog from "@/views/dialogs/UserInfoDialog";
import ShareSceneDialog from "@/views/dialogs/ShareSceneDialog";
import AlgorithmDialog from "@/views/dialogs/AlgorithmDialog";
import { useAuthStore } from "@/resources/store/authStore";
import { useUiStore } from "@/resources/store/uiStore";
import { eventBus } from "@/resources/services/event-bus";
import { useKeyboardShortcuts } from "@/views/hooks/useKeyboardShortcuts";

// Draggable divider (copied from the metamodeling twin's MainBody). The library
// handles the drag mechanics; autoSaveId on the PanelGroup persists column widths.
const ResizeHandle = styled(PanelResizeHandle)(({ theme }) => ({
  width: 5,
  flex: "0 0 auto",
  backgroundColor: theme.palette.divider,
  cursor: "col-resize",
  transition: theme.transitions.create("background-color"),
  '&:hover, &[data-resize-handle-state="drag"]': {
    backgroundColor: theme.palette.primary.main,
  },
}));

// Port of `my-app.{ts,html}` + `main-body-tab-bar.html` — the whole page skeleton:
// TopNavBar, the toolbar row, the tab row (tabs | state window), the resizable
// 3-column body (LeftNav | ThreeCanvas | RightNav), the footer, plus the two
// always-present overlays (sign-in dialog + snackbar). The body is gated behind
// authentication; the sign-in dialog auto-opens when no user is logged in.
//
// my-app.attached() ran initiator.init()/initEventListeners() — that boot now
// happens inside ThreeCanvas via engine.mount(). AppLayout owns the app-level
// keyboard shortcuts (Ctrl+S/Delete/arrows) and the Ctrl+S -> Save dialog wiring.
export default function AppLayout() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const openDialog = useUiStore((s) => s.openDialog);

  // Mount the keyboard shortcuts once for the app (plan §5/§9 P6: Delete/arrows/Ctrl+S).
  useKeyboardShortcuts();

  // Ctrl+S publishes `ctrlPlusSPressed` (from useKeyboardShortcuts); the old
  // top-nav-bar opened the Save dialog on that event. Wire it to the uiStore saveAs
  // dialog (rendered in P9). Subscription is torn down on unmount.
  useEffect(() => {
    const sub = eventBus.subscribe("ctrlPlusSPressed", () => openDialog("saveAs"));
    return () => sub.dispose();
  }, [openDialog]);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopNavBar />

      {currentUser ? (
        <>
          {/* Toolbar row */}
          <Box sx={{ height: 40, flex: "0 0 auto", backgroundColor: "#f5f5f5", borderBottom: "1px solid #bdbdbd" }}>
            <Toolbar />
          </Box>

          {/* Tab row: tab bar (left) + state window (right) */}
          <Box sx={{ height: 52, flex: "0 0 auto", display: "flex", borderBottom: "1px solid #bdbdbd" }}>
            <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <TabBar />
            </Box>
            <Box sx={{ width: 220, flex: "0 0 auto", borderLeft: "1px solid #bdbdbd" }}>
              <StateWindow />
            </Box>
          </Box>

          {/* Main 3-column body */}
          <PanelGroup
            direction="horizontal"
            autoSaveId="mmar-modeling-panels"
            style={{ flex: 1, minHeight: 0 }}
          >
            <Panel defaultSize={20} minSize={12} maxSize={35}>
              <LeftNav />
            </Panel>
            <ResizeHandle />
            <Panel minSize={30}>
              <Box sx={{ height: "100%", width: "100%", backgroundColor: "#ffffff" }}>
                <ThreeCanvas />
              </Box>
            </Panel>
            <ResizeHandle />
            <Panel defaultSize={22} minSize={12} maxSize={40}>
              <RightNav />
            </Panel>
          </PanelGroup>
        </>
      ) : (
        <Box sx={{ flex: 1 }} />
      )}

      <AppFooter />

      {/* Non-dismissable sign-in dialog: opens whenever nobody is authenticated. */}
      <SignInDialog open={!currentUser} onClose={() => undefined} />
      <AppSnackbar />

      {/* P7 dialogs: loading window (driven by uiStore.loading) + create-new-scene. */}
      <LoadingWindow />
      <CreateNewSceneDialog />

      {/* P9 model-ops dialogs. All are uiStore-driven and render closed until their
          flag opens (TopNavBar's File menu, SceneGroup's buttons, StateWindow's Info
          button, Ctrl+S). The attribute-window dialogs deliberately live inside
          AttributeWindow instead — see P8's dialog-ownership note. */}
      <SaveAsDialog />
      <CopySceneDialog />
      <DeleteSceneDialog />
      <ImportModelDialog />
      <ImportMetamodelDialog />
      <MapFromFileDialog />
      <UserInfoDialog />
      <ShareSceneDialog />
      <AlgorithmDialog />
    </Box>
  );
}
