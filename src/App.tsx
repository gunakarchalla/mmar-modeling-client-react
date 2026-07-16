import { Box, Button, Typography } from "@mui/material";
import { useAuthStore } from "@/resources/store/authStore";
import { useStateStore } from "@/resources/store/stateStore";
import SignInDialog from "@/views/auth/SignInDialog";
import AppSnackbar from "@/views/common/AppSnackbar";
import ThreeCanvas from "@/views/three-canvas/ThreeCanvas";

// Temporary P2 shell: sign-in gating + a bare three.js canvas so the engine boot
// path (engine.mount -> initiator.init -> scene/cameras/controls) can be exercised
// end to end. A thin header shows the logged-in user, the active interaction state
// (mirrored from the engine via stateStore) and Logout. P6 replaces this body with
// the real modeling layout (AppLayout: top nav, toolbars, tabs, left/right nav, …).
export default function App() {
  const currentUser = useAuthStore((s) => s.currentUser);
  const logout = useAuthStore((s) => s.logout);
  const activeState = useStateStore((s) => s.activeState);

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {currentUser ? (
        <>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 2,
              py: 1,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="h6">MMAR Modeling Client (React)</Typography>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {activeState || "—"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {currentUser.username}
                {currentUser.isAdmin ? " (admin)" : ""}
              </Typography>
              <Button variant="outlined" size="small" onClick={logout}>
                Logout
              </Button>
            </Box>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ThreeCanvas />
          </Box>
        </>
      ) : (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <Typography variant="h4">MMAR Modeling Client (React)</Typography>
          <Typography variant="body1" color="text.secondary">
            Please sign in to continue.
          </Typography>
        </Box>
      )}

      {/* Open whenever nobody is authenticated; it closes itself on successful login. */}
      <SignInDialog open={!currentUser} onClose={() => undefined} />
      <AppSnackbar />
    </Box>
  );
}
