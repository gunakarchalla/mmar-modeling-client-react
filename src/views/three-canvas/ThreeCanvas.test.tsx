// @vitest-environment jsdom
//
// ThreeCanvas lifecycle (P2). The component mounts/unmounts on every tab switch, so
// its cleanup has to be exact:
//   - both 1s heartbeat intervals are cleared (no orphaned timers per visited tab);
//   - the ResizeObserver is disconnected and the mouseleave listener removed;
//   - the engine detach is deferred until the in-flight mount settles, and carries the
//     mount token so a superseded cleanup is a no-op.
//
// `@/engine` is mocked: importing it for real constructs a WebGLRenderer at module
// scope, which jsdom cannot provide.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, act } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  engine: { mount: vi.fn(), unmount: vi.fn() },
  resize: { resize: vi.fn() },
  globalObject: { render: false, runMechanism: false, tabContext: [] as unknown[] },
  rayHelper: { clearCursor: vi.fn() },
  logger: { log: vi.fn() },
  observe: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@/engine", () => ({
  engine: mocks.engine,
  resize: mocks.resize,
  globalObject: mocks.globalObject,
  rayHelper: mocks.rayHelper,
}));
vi.mock("@/resources/services/logger", () => ({ logger: mocks.logger }));

import ThreeCanvas from "./ThreeCanvas";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let queued microtasks (the mount promise chain) run to completion. */
const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.globalObject.render = false;
  mocks.globalObject.runMechanism = false;
  mocks.globalObject.tabContext = [];
  mocks.engine.mount.mockResolvedValue(7);

  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = mocks.observe;
      disconnect = mocks.disconnect;
      unobserve = vi.fn();
    },
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ThreeCanvas — mount", () => {
  it("mounts the engine into its own container element", async () => {
    const { container } = render(<ThreeCanvas />);
    await flush();

    expect(mocks.engine.mount).toHaveBeenCalledTimes(1);
    expect(mocks.engine.mount).toHaveBeenCalledWith(container.firstChild);
  });

  it("sizes the renderer and observes the container once mounted", async () => {
    render(<ThreeCanvas />);
    await flush();

    expect(mocks.resize.resize).toHaveBeenCalled();
    expect(mocks.observe).toHaveBeenCalledTimes(1);
  });

  it("logs instead of throwing when the engine fails to start", async () => {
    mocks.engine.mount.mockRejectedValue(new Error("no webgl"));

    render(<ThreeCanvas />);
    await flush();

    expect(mocks.logger.log).toHaveBeenCalledWith(expect.stringContaining("no webgl"), "error");
    expect(mocks.observe).not.toHaveBeenCalled();
  });
});

describe("ThreeCanvas — steady-render heartbeats", () => {
  it("flags render + runMechanism roughly once a second", async () => {
    vi.useFakeTimers();
    render(<ThreeCanvas />);

    expect(mocks.globalObject.render).toBe(false);
    await act(async () => { vi.advanceTimersByTime(1000); });

    expect(mocks.globalObject.render).toBe(true);
    expect(mocks.globalObject.runMechanism).toBe(true);
  });

  it("clears both intervals on unmount — no orphaned timers per visited tab", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<ThreeCanvas />);

    unmount();
    mocks.globalObject.render = false;
    await act(async () => { vi.advanceTimersByTime(5000); });

    expect(mocks.globalObject.render).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("ThreeCanvas — unmount", () => {
  it("disconnects the ResizeObserver and detaches the engine with its token", async () => {
    const { unmount } = render(<ThreeCanvas />);
    await flush();

    unmount();
    await flush();

    expect(mocks.disconnect).toHaveBeenCalledTimes(1);
    expect(mocks.engine.unmount).toHaveBeenCalledWith(7);
  });

  it("defers the detach until an in-flight mount settles", async () => {
    const gate = deferred<number>();
    mocks.engine.mount.mockReturnValue(gate.promise);

    const { unmount } = render(<ThreeCanvas />);
    unmount();

    expect(mocks.engine.unmount).not.toHaveBeenCalled();

    gate.resolve(3);
    await flush();

    expect(mocks.engine.unmount).toHaveBeenCalledWith(3);
  });

  it("never attaches a ResizeObserver when unmounted before the mount resolves", async () => {
    const gate = deferred<number>();
    mocks.engine.mount.mockReturnValue(gate.promise);

    const { unmount } = render(<ThreeCanvas />);
    unmount();
    gate.resolve(3);
    await flush();

    expect(mocks.observe).not.toHaveBeenCalled();
    expect(mocks.disconnect).not.toHaveBeenCalled();
  });
});

describe("ThreeCanvas — awareness cursor", () => {
  it("clears the collaboration cursor when the pointer leaves the canvas", async () => {
    const { container } = render(<ThreeCanvas />);
    await flush();

    (container.firstChild as HTMLElement).dispatchEvent(new MouseEvent("mouseleave"));

    expect(mocks.rayHelper.clearCursor).toHaveBeenCalledTimes(1);
  });
});
