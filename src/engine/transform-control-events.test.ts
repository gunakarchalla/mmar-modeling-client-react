// @vitest-environment jsdom
//
// Regression tests for the transform-gizmo mouse-up handler. global-definition builds a
// THREE.WebGLRenderer at module scope (needs a GL canvas), so it is replaced with a
// light fake carrying only the fields this handler touches; THREE itself stays REAL.
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as THREE from "three";
import { SceneInstance } from "@gds";

const fakeGlobalObject = vi.hoisted(() => ({
  transformControls: undefined as any,
  scene: undefined as unknown as THREE.Scene,
  boxHelper: undefined as unknown as THREE.BoxHelper,
  sharedDocServiceRef: undefined as any,
  selectedTab: 0,
  tabContext: [] as any[],
  render: false,
}));

vi.mock("@/engine/global-definition", () => ({ globalObject: fakeGlobalObject }));
vi.mock("@/resources/services/instance-utility", () => ({
  instanceUtility: {
    getTabContextSceneInstance: vi.fn(async () => SceneInstance.fromJS({ uuid: "s-1", class_instances: [], relationclasses_instances: [] })),
    getAllPortInstancesOfTabContext: vi.fn(async () => []),
  },
}));
vi.mock("@/resources/collaboration/local-change-publisher", () => ({ publishLocalChange: vi.fn() }));

import { transformControlsEvents } from "./transform-control-events";
import { eventBus } from "@/resources/services/event-bus";

/** Stands in for TransformControls: only `object` and `mode` are read by the handler. */
function fakeControls(object: THREE.Object3D | undefined, mode: string) {
  return { object, mode };
}

beforeEach(() => {
  fakeGlobalObject.scene = new THREE.Scene();
  fakeGlobalObject.render = false;
});

describe("onTransformControlsMouseUp", () => {
  /**
   * The reported crash: the listener is registered per TransformControls instance but
   * the handler resolves the controls through globalObject, so a mouseUp dispatched by
   * a leaked instance is read against the current, EMPTY one. Its default mode is
   * "scale" — the branch that dereferences `object.userData`.
   */
  it("does not throw when the mouseUp arrives with nothing attached in scale mode", async () => {
    fakeGlobalObject.transformControls = fakeControls(undefined, "scale");
    await expect(transformControlsEvents.onTransformControlsMouseUp()).resolves.toBeUndefined();
  });

  it("does not throw with nothing attached in translate or rotate mode either", async () => {
    for (const mode of ["translate", "rotate"]) {
      fakeGlobalObject.transformControls = fakeControls(undefined, mode);
      await expect(transformControlsEvents.onTransformControlsMouseUp()).resolves.toBeUndefined();
    }
  });

  it("does not throw when the controls themselves are gone", async () => {
    fakeGlobalObject.transformControls = undefined;
    await expect(transformControlsEvents.onTransformControlsMouseUp()).resolves.toBeUndefined();
  });

  it("records NO undo step for a mouseUp with nothing attached", async () => {
    const recorded: unknown[] = [];
    const sub = eventBus.subscribe("historyRecord", (p) => recorded.push(p));
    fakeGlobalObject.transformControls = fakeControls(undefined, "scale");

    await transformControlsEvents.onTransformControlsMouseUp();
    sub.dispose();

    // There was no drag, so an undo step here would be a phantom one.
    expect(recorded).toEqual([]);
  });

  it("still handles a real completed scale drag", async () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.scale.set(3, 3, 3);
    const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    mesh.add(child);
    fakeGlobalObject.transformControls = fakeControls(mesh, "scale");
    const recorded: any[] = [];
    const sub = eventBus.subscribe("historyRecord", (p) => recorded.push(p));

    await transformControlsEvents.onTransformControlsMouseUp();
    sub.dispose();

    expect(mesh.userData.custom_variables.scale).toBe(mesh.scale);
    // Children are counter-scaled so their absolute size is unchanged.
    expect(child.scale.x).toBeCloseTo(1 / 3);
    expect(recorded[0].label).toBe("scale");
    expect(fakeGlobalObject.render).toBe(true);
  });
});
