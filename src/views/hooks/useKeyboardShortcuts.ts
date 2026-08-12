import { useEffect } from "react";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { deletionHandler } from "@/engine/deletion-handler";
import { mathUtility } from "@/resources/services/math-utility";
import { eventBus } from "@/resources/services/event-bus";
import { historyService } from "@/resources/services/history-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";
import { hasCommandModifier } from "@/resources/util/platform";

/**
 * P5 port of the old `resources/keyboard_handler.ts` — mousetrap is NOT installed
 * (plan §3.3, LOCKED: mousetrap -> plain `window.addEventListener('keydown')`).
 * The old handler registered its bindings in the class constructor (global for the
 * app lifetime); here they live in a React hook whose effect adds ONE `keydown`
 * listener and removes it on cleanup, so StrictMode's double-mount does not leak a
 * duplicate listener (plan §3.4.3). Mount this once from the app shell (P6).
 *
 * Bindings:
 *  - Delete            -> deletionHandler.onPressDelete()
 *  - ArrowLeft/Right   -> nudge selected object ±0.1 on X (rounded, precision 10)
 *  - ArrowUp/Down      -> nudge selected object ±0.1 on Y (rounded, precision 100)
 *  - Ctrl+S            -> preventDefault + publish 'ctrlPlusSPressed' (save dialog, P7)
 *  - Ctrl/⌘+Z          -> undo the active scene's last step
 *  - Ctrl/⌘+Shift+Z,
 *    Ctrl/⌘+Y          -> redo
 *
 * The undo/redo chords are the metamodeling twin's, down to the shared
 * `hasCommandModifier()` helper, so a user moving between the two clients presses the
 * same keys. They differ from that twin in ONE respect: here they are ignored while a
 * text field has focus, so Ctrl+Z inside an attribute input undoes the typing (the
 * browser's own edit history) rather than the model. That matches how this file already
 * treats Delete and the arrow keys — the metamodeling client has no equivalent inputs
 * over its canvas and so had no reason to make the distinction. Ctrl+S stays global so
 * the browser's own save dialog never appears.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    // Nudge the currently-selected object; no-op when nothing is selected. Reads the
    // engine's selected mesh directly (globalSelectedObject.object) so we never call
    // getObject() — which would touch the box helper — when there is no selection.
    const nudge = (axis: "x" | "y", delta: number, precision: number) => {
      if (!globalSelectedObject.object) return;
      const object = globalSelectedObject.getObject();
      mathUtility.roundPosOfObject(object, precision);
      object.position[axis] += delta;
      globalObject.render = true;

      // Same treatment a mouse drag gets: `afterTransformSync` lets the history service
      // flush the three.js -> gds write before snapshotting, and the coalesce key folds
      // a held-down arrow key into a single undo step instead of one per repeat.
      eventBus.publish("historyRecord", {
        label: "nudge",
        afterTransformSync: true,
        coalesceKey: `nudge:${object.uuid}`,
      });
    };

    const isEditableTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl+S / Cmd+S -> save (handled globally, even inside inputs).
      if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) {
        event.preventDefault();
        eventBus.publish("ctrlPlusSPressed");
        return;
      }

      // The remaining shortcuts must not fire while the user is typing.
      if (isEditableTarget(event.target)) return;

      // Undo / redo. `key` is lower-cased because Shift uppercases it; Alt-carrying
      // chords are left alone so they can mean something else.
      if (hasCommandModifier(event) && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === "z" || key === "y") {
          event.preventDefault();
          const step = key === "y" || event.shiftKey ? historyService.redo() : historyService.undo();
          void step.catch((err) => logger.log(`History step failed: ${describeError(err)}`, "error"));
          return;
        }
      }

      switch (event.key) {
        case "Delete":
          void deletionHandler.onPressDelete().catch((err) => logger.log(`Error on delete: ${String(err)}`, "error"));
          break;
        case "ArrowLeft":
          nudge("x", -0.1, 10);
          break;
        case "ArrowRight":
          nudge("x", 0.1, 10);
          break;
        case "ArrowUp":
          nudge("y", 0.1, 100);
          break;
        case "ArrowDown":
          nudge("y", -0.1, 100);
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
