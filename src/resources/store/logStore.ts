import { useEffect, useState } from "react";
import { create } from "zustand";

export type LogEntry = { value: string; status: string };

/**
 * Cap on retained log entries. The old Aurelia `Logger` kept an unbounded array, but
 * it mutated it in place (`unshift`) and Aurelia batched the DOM updates. Here every
 * `log()` allocates a fresh array and synchronously re-renders LogWindow (mounted in
 * RightNav), which maps a heavy MUI <Tooltip> per entry. Bulk operations that log
 * thousands of times (e.g. a URDF import mapping a file to a scene instance) would
 * otherwise be O(n²) in both the array copy and the rendered row count. Keeping only
 * the most recent entries bounds both — the log is a live status panel, not an audit
 * trail, so trimming old rows is safe.
 */
const MAX_LOG_ENTRIES = 500;

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
    // original Logger uses unshift -> newest first. Slice before spreading so the copy
    // (and the downstream LogWindow render) stays bounded to MAX_LOG_ENTRIES rather
    // than growing with every call.
    set((s) => ({ logArray: [{ value, status }, ...s.logArray.slice(0, MAX_LOG_ENTRIES - 1)] }));
  },

  closeSnackbar: () => set((s) => ({ snackbar: { ...s.snackbar, open: false } })),
}));

/**
 * Throttled read of `logArray` for the LogWindow panel.
 *
 * `logArray` mutates once per `logger.log()` call. Bulk engine operations — most
 * notably mapping a URDF file onto a scene instance, which creates hundreds of
 * class/attribute instances and logs "created"/"done" for each — fire thousands of
 * log calls in a tight (micro-task) chain. Subscribing to `logArray` directly (a new
 * array reference every call) would re-render LogWindow, and reconcile its up-to-500
 * MUI <Tooltip> rows, once *per log entry* — seconds of wasted work that made the
 * import feel ~10s slower than the old Aurelia client (which batched its DOM updates).
 *
 * This hook instead coalesces bursts into a single React update: each store change
 * schedules at most one trailing flush (a macro-task), so all the log calls emitted
 * while the engine loop holds the thread collapse into one re-render once it yields.
 * The store itself stays synchronous, so `getState().logArray` is always current.
 */
export function useThrottledLogArray(): LogEntry[] {
  const [snapshot, setSnapshot] = useState<LogEntry[]>(() => useLogStore.getState().logArray);

  useEffect(() => {
    let scheduled: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      scheduled = null;
      setSnapshot(useLogStore.getState().logArray);
    };

    const unsubscribe = useLogStore.subscribe((state, prev) => {
      // Only react to logArray changes (not snackbar toggles).
      if (state.logArray === prev.logArray) return;
      if (scheduled != null) return; // a flush is already pending -> coalesce
      scheduled = setTimeout(flush, 0);
    });

    // Catch up on anything logged between the initial render and this effect running.
    flush();

    return () => {
      unsubscribe();
      if (scheduled != null) clearTimeout(scheduled);
    };
  }, []);

  return snapshot;
}
