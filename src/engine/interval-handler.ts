import { globalObject } from "@/engine/global-definition";

/**
 * Port of the old `resources/interval_handler.ts`. The original was already an empty
 * shell — its constructor and every method were commented out (the interval logic
 * lived in `three-canvas.ts`, which the React `ThreeCanvas` component now owns). It
 * is kept as an empty module singleton for structural parity so future work has a
 * home; it currently holds no behaviour.
 */
export class IntervalHandler {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private globalObjectInstance = globalObject;
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const intervalHandler = new IntervalHandler();
