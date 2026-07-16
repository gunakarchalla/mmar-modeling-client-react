import { create } from "zustand";

export type LogEntry = { value: string; status: string };

export type SnackbarSeverity = "error" | "info" | "success" | "warning";

export interface SnackbarState {
  open: boolean;
  message: string;
  severity: SnackbarSeverity;
}

interface LogState {
  logArray: LogEntry[];
  snackbar: SnackbarState;
  /** Mirrors Logger.log: console.error + snackbar on error, prepends to logArray. */
  log: (value: string, status: string) => void;
  closeSnackbar: () => void;
}

export const useLogStore = create<LogState>((set) => ({
  logArray: [],
  snackbar: { open: false, message: "", severity: "info" },

  log: (value, status) => {
    if (status === "error") {
      console.error(value);
      set({ snackbar: { open: true, message: value, severity: "error" } });
    }
    // original Logger uses unshift -> newest first
    set((s) => ({ logArray: [{ value, status }, ...s.logArray] }));
  },

  closeSnackbar: () => set((s) => ({ snackbar: { ...s.snackbar, open: false } })),
}));
