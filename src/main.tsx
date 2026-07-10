import "reflect-metadata";

import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";

// Palette tuned to the original styles/color_definition.scss
// ($primary #9ec8e1, $primary-light #BDD9EB, $secondary #ff8a65, $error #ff4747,
//  $enableGreen #4CAF50/#388E3C, $disableRed #F44336/#D32F2F).
const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#9ec8e1", light: "#BDD9EB" },
    secondary: { main: "#ff8a65" },
    error: { main: "#ff4747" },
    success: { main: "#4CAF50", dark: "#388E3C" },
    background: { default: "#ffffff" },
  },
  components: {
    // Tooltips with arrows mirror the MDC tooltip look used throughout the
    // original; buttons keep mixed-case labels (MUI defaults to UPPERCASE).
    MuiTooltip: { defaultProps: { arrow: true } },
    // All buttons render black regardless of variant/color. The per-variant
    // overrides win over MUI's internal color styles, so even buttons that
    // pass color="inherit"/"primary" end up black.
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none" },
        text: {
          color: "#000000",
          "&.Mui-disabled": { color: "rgba(0, 0, 0, 0.26)" },
        },
        outlined: {
          color: "#000000",
          borderColor: "#000000",
          "&:hover": {
            borderColor: "#000000",
            backgroundColor: "rgba(0, 0, 0, 0.04)",
          },
          "&.Mui-disabled": {
            color: "rgba(0, 0, 0, 0.26)",
            borderColor: "rgba(0, 0, 0, 0.12)",
          },
        },
        contained: {
          color: "#ffffff",
          backgroundColor: "#000000",
          "&:hover": { backgroundColor: "#1a1a1a" },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: "#000000",
          "&.Mui-disabled": { color: "rgba(0, 0, 0, 0.26)" },
        },
      },
    },
  },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
