import { useEffect } from "react";
import { globalObject } from "@/engine/global-definition";
import { globalSelectedObject } from "@/engine/global-selected-object";
import { deletionHandler } from "@/engine/deletion-handler";
import { mathUtility } from "@/resources/services/math-utility";
import { eventBus } from "@/resources/services/event-bus";
import { logger } from "@/resources/services/logger";

/**
 * P5 port of the old `resources/keyboard_handler.ts` — mousetrap is NOT installed
 * (plan §3.3, LOCKED: mousetrap -> plain `window.addEventListener('keydown')`).
 * The old handler registered its bindings in the class constructor (global for the
 * app lifetime); here they live in a React hook whose effect adds ONE `keydown`
 * listener and removes it on cleanup, so StrictMode's double-mount does not leak a
 * duplicate listener (plan §3.4.3). Mount this once from the app shell (P6).
 *
 * Bindings (identical to the original):
 *  - Delete            -> deletionHandler.onPressDelete()
 *  - ArrowLeft/Right   -> nudge selected object ±0.1 on X (rounded, precision 10)
 *  - ArrowUp/Down      -> nudge selected object ±0.1 on Y (rounded, precision 100)
 *  - Ctrl+S            -> preventDefault + publish 'ctrlPlusSPressed' (save dialog, P7)
 *
 * The arrow/Delete bindings are ignored while a text input is focused (mousetrap's
 * default behaviour, reproduced here); Ctrl+S is always handled so the browser's own
 * save dialog never appears.
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
