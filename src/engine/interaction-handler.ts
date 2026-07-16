import { globalObject } from "@/engine/global-definition";
import { rayHelper } from "@/engine/ray-helper";

/**
 * P2 STUB — replaced by the full port in P5.
 *
 * The engine boot path needs `interactionHandler.onDocumentMouseDown` to bind as the
 * renderer `pointerdown` listener (see `initiator.initEventListeners` +
 * `scene-initiator.initTransformControls`). The real 5-mode interaction state machine
 * (old `resources/interaction_handler.ts`, 733 lines) is ported fresh in P5 — do NOT
 * treat this stub as the final port. For now `onDocumentMouseDown` only records the
 * clicked button / dragging flag and refreshes the raycaster, which is enough for the
 * empty P2 canvas.
 */
export class InteractionHandler {
  private globalObjectInstance = globalObject;
  private rayHelper = rayHelper;

  // left == 0, right == 2
  private clickedButton!: number;
  private dragging!: boolean;

  // function that is called on mouse click
  async onDocumentMouseDown(event: MouseEvent) {
    this.clickedButton = event.button;
    this.dragging = this.globalObjectInstance.transformControls.dragging;

    // set the raycaster
    this.globalObjectInstance.raycaster = this.rayHelper.shootRay(event);
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const interactionHandler = new InteractionHandler();
