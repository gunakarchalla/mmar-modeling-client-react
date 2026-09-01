import type { TransformControls } from "three/examples/jsm/controls/TransformControls.js";

/**
 * Keeps a LIVE local translate drag from fighting a peer's concurrent one.
 *
 * `coordinates_2d` is a Y.Map of three independent keys, so Yjs already merges an
 * x-drag against a y-drag per axis — provided each peer writes only the axes it moved
 * (see the coordinates case in y-mapping). That merge still gets undone on screen,
 * because three's TransformControls recomputes the WHOLE position from a snapshot
 * taken at pointer-down:
 *
 *     if ( axis.indexOf( 'Y' ) === - 1 ) this._offset.y = 0;
 *     object.position.copy( this._offset ).add( this._positionStart );
 *
 * For an axis the local gizmo does not own the offset is zeroed, so the object is
 * pinned to `_positionStart` on that axis for the whole drag: a peer's merged value is
 * written onto the mesh, then reverted by the next pointer-move, then republished as
 * OUR value by the animator's coordinates pass — a tug-of-war lasting as long as both
 * users hold their arrows. Moving the baseline is what makes the merge stick.
 *
 * Both helpers are no-ops unless a translate drag of that exact object is in flight,
 * so the ordinary path (nobody dragging) costs one property read.
 */

export type Axis = "x" | "y" | "z";

export const AXES: readonly Axis[] = ["x", "y", "z"];

/** The subset of TransformControls this module touches. */
type DragControls = Pick<TransformControls, "object" | "mode" | "axis" | "dragging" | "space"> & {
  /**
   * The pointer-down position snapshot. Underscore-prefixed but a plain field, not a
   * `#private` one, so it is reachable — and it is the only baseline the translate
   * branch adds its offset to. Pinned to three 0.169 by package.json.
   */
  _positionStart?: { x: number; y: number; z: number };
};

/**
 * The axes the local user is currently authoring for `objectUuid` — the ones a remote
 * write must NOT be allowed to move, because the pointer would only take them back.
 *
 * In LOCAL space the gizmo rotates its offset into the object's frame before adding it,
 * so a single-arrow drag can move all three stored components and per-axis ownership
 * stops meaning anything; every axis is reported as owned there, which degrades to the
 * previous last-writer-wins behaviour rather than to a wrong merge. The app never calls
 * `setSpace`, so this is a guard for a future caller, not the live path.
 */
export function locallyDraggedAxes(controls: unknown, objectUuid: string): Set<Axis> {
  const drag = controls as DragControls | undefined;
  if (!drag?.dragging || drag.mode !== "translate" || drag.object?.uuid !== objectUuid) return new Set();
  if (drag.space === "local") return new Set(AXES);
  const axis = drag.axis;
  if (!axis) return new Set();
  return new Set(AXES.filter((a) => axis.includes(a.toUpperCase())));
}

/**
 * Move the in-flight drag's baseline on one axis, so the next pointer-move keeps the
 * value a peer just merged in instead of restoring the pre-drag one. Only ever called
 * for an axis `locallyDraggedAxes` reported as NOT owned, where the gizmo's offset is
 * zero and the baseline is therefore the whole of the rendered position.
 */
export function rebaseDragBaseline(controls: unknown, objectUuid: string, axis: Axis, value: number): void {
  const drag = controls as DragControls | undefined;
  if (!drag?.dragging || drag.mode !== "translate" || drag.object?.uuid !== objectUuid) return;
  const baseline = drag._positionStart;
  if (!baseline) return;
  baseline[axis] = value;
}
