import { useLogStore } from "@/resources/store/logStore";

/**
 * Thin shim replacing the Aurelia `Logger` service (resources/services/logger.ts).
 * The engine ports (P2+) keep their `this.logger.log(value, status)` calls working
 * by importing this object. It simply forwards to the logStore, which prepends to
 * logArray (newest first, like the original `unshift`) and raises a snackbar on
 * errors.
 */
export const logger = {
  log: (value: string, status: string): void => useLogStore.getState().log(value, status),
};

export type Logger = typeof logger;
