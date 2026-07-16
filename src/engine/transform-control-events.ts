import { globalObject } from "@/engine/global-definition";

/**
 * P2 STUB — replaced by the full port in P4.
 *
 * `scene-initiator.initTransformControls` registers the TransformControls `change`
 * and `mouseUp` listeners against these two methods. The real behaviour (old
 * `resources/services/transform_control_events.ts`, 159 lines — snapping, rounding
 * via math-utility, coordinate propagation) is ported in P4. Until then they are
 * no-ops: nothing can be transformed on the empty P2 canvas.
 */
export class TransformControlsEvents {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private globalObjectInstance = globalObject;

  onTransformControlsPropertyChange() {
    // P4: round + propagate the transformed object's coordinates.
  }

  async onTransformControlsMouseUp() {
    // P4: persist the transform (coordinates updater + auto-save).
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const transformControlsEvents = new TransformControlsEvents();
