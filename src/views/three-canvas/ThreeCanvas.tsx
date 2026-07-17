import { useEffect, useRef } from "react";
import { Box } from "@mui/material";
import { engine, resize, globalObject, rayHelper } from "@/engine";
import { hybridAlgorithmsService } from "@/engine/hybrid-algorithms/hybrid-algorithms-service";
import { logger } from "@/resources/services/logger";
import { describeError } from "@/resources/util/describe-error";

// Port of the old `views/three-canvas/three-canvas.{ts,html}`. The old client found
// the canvas container via `document.getElementById('container')` + a polling
// interval; in React we pass the container element straight into engine.mount()
// (plan §3.1). The engine is mounted ONCE (ref + empty-dep useEffect);
// engine.mount/unmount are idempotent (mount-token pattern) so StrictMode's
// double-invoke and per-tab remounts are safe. A ResizeObserver keeps the renderer +
// cameras in sync with the container size (replacing the old window 'resize' listener,
// which the engine still also registers).
//
// Two consequences of the mount/unmount lifecycle drive the cleanup:
//   1. the detach must wait for an in-flight engine.mount() before running, else
//      init() finishes after unmount and leaves a render loop on a detached canvas;
//   2. a cleanup landing after a newer mount must not detach that newer mount's
//      canvas — hence the mount token passed to engine.unmount().
//
// The old `attached()` set up TWO 1-second heartbeat intervals; both are preserved
// (plan §3.4.5 — keep every steady-render tick). See the interval bodies below.
export default function ThreeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let observer: ResizeObserver | undefined;

    // Deactivate the awareness cursor when the pointer leaves the 3D canvas, so peers
    // stop drawing our arrow (P11). A no-op when the active tab has no shared session.
    const onMouseLeave = () => rayHelper.clearCursor();
    el.addEventListener("mouseleave", onMouseLeave);

    const mounted = engine
      .mount(el)
      .then((token) => {
        if (disposed) return token;
        // Match the renderer/cameras to the actual container size, then keep them synced.
        resize.resize();
        observer = new ResizeObserver(() => resize.resize());
        observer.observe(el);
        return token;
      })
      .catch((err: unknown) => {
        // A failing init (e.g. no WebGL context) must surface as a log line, not as an
        // unhandled rejection that takes the canvas host down.
        logger.log(`3D canvas could not start: ${describeError(err)}`, "error");
        return undefined;
      });

    // Heartbeat #1 — "set steady rendering at least every second". The animator only
    // draws a frame when globalObject.render === true; some update paths mutate meshes
    // without setting it, so this tick guarantees the canvas keeps refreshing. It also
    // arms runMechanism so the animator ticks mechanism code strings (P3).
    const steadyRender = setInterval(() => {
      globalObject.render = true;
      globalObject.runMechanism = true;
    }, 1000);

    // Heartbeat #2 — periodically refresh hybrid-algorithm attributes for the open
    // scene (P12: live). Today this only does work for a Statechange scene, where it
    // reads each Reference object's three.js pose back into its pose attributes; for
    // every other scene type the service returns immediately.
    const hybridRefresh = setInterval(() => {
      if (globalObject.tabContext.length > 0) {
        void hybridAlgorithmsService
          .updateHybridAlgorithmAttributes()
          .catch((err) => logger.log(`Hybrid algorithm refresh failed: ${describeError(err)}`, "error"));
      }
    }, 1000);

    return () => {
      disposed = true;
      clearInterval(steadyRender);
      clearInterval(hybridRefresh);
      el.removeEventListener("mouseleave", onMouseLeave);
      observer?.disconnect();
      // Detach only once the mount has settled, and only if this mount still owns the
      // engine (token check inside unmount).
      void mounted.then((token) => engine.unmount(token));
    };
  }, []);

  return (
    <Box
      ref={containerRef}
      className="three_canvas"
      id="container"
      sx={{ position: "relative", width: "100%", height: "100%", bgcolor: "#ffffff", overflow: "hidden" }}
    />
  );
}
