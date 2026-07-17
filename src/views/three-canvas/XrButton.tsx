import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { engine } from "@/engine";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";

// Port of the old `initiator.ts:94-112` XRButton wiring. The old client created
// three's XRButton bound to the single renderer and appended it to `document.body`,
// then a 1s polling interval nudged its `bottom` to `60px` once the DOM node existed.
//
// In React the button is an overlay on the MiddleBody instead of a document.body
// child (plan §9 P13). We wait for the engine to finish its one-time init (the
// renderer must exist before XRButton.createButton reads it) and then append the
// button into a locally-positioned overlay div, setting `bottom: 60px` directly —
// no polling interval needed since we own the element the moment createXRButton
// returns. engine.createXRButton() also calls arInitiator.enableXR(), so the
// sessionstart/sessionend listeners are (idempotently) registered here as well as
// at mount; that redundancy is what keeps XR working across canvas remounts.
//
// StrictMode double-mount and per-tab canvas remounts are safe: the effect removes
// its button on cleanup, and a superseded/awaited-away mount simply skips the append.
export default function XrButton() {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let button: HTMLElement | undefined;

    void engine
      .whenReady()
      .then(() => {
        const host = overlayRef.current;
        if (disposed || !host) return;
        button = engine.createXRButton();
        // The old client forced the button up from three's default bottom:20px so it
        // clears the app footer. Reproduce that here (three sets position:absolute).
        button.style.bottom = "60px";
        host.appendChild(button);
      })
      .catch((err: unknown) => {
        // A device without WebXR still surfaces a disabled "XR NOT SUPPORTED" button
        // from three itself; a genuine failure here just means no button — log, do not
        // crash the canvas host.
        logger.log(`XR button could not be created: ${describeError(err)}`, "error");
      });

    return () => {
      disposed = true;
      button?.parentElement?.removeChild(button);
    };
  }, []);

  // A transparent, non-interactive overlay pinned to the MiddleBody; only the button
  // it hosts is clickable (pointerEvents re-enabled on the child by three's styles).
  return (
    <Box
      ref={overlayRef}
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 5,
        "& > *": { pointerEvents: "auto" },
      }}
    />
  );
}
