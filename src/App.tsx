import { Box, Typography } from "@mui/material";

// Placeholder shell. The real modeling client layout (top-nav-bar, toolbars,
// three-canvas, attribute-window, dialogs, collaboration awareness, …) is
// migrated view-by-view from ../mmar-modeling-client into src/views.
export default function App() {
  return (
    <Box
      sx={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
      }}
    >
      <Typography variant="h4">MMAR Modeling Client (React)</Typography>
      <Typography variant="body1" color="text.secondary">
        Scaffold ready — migration pending.
      </Typography>
    </Box>
  );
}
