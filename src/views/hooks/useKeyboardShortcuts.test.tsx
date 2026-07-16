// @vitest-environment jsdom
//
// useKeyboardShortcuts (P5) is mounted by the P6 app shell. This covers the one
// binding the shell depends on for the Save dialog: Ctrl+S publishes the
// `ctrlPlusSPressed` bus event (and prevents the browser's own save dialog). The
// engine leaves are mocked (the real ones build a WebGLRenderer); eventBus is real.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

vi.mock("@/engine/global-definition", () => ({ globalObject: { render: false } }));
vi.mock("@/engine/global-selected-object", () => ({ globalSelectedObject: { object: null } }));
vi.mock("@/engine/deletion-handler", () => ({ deletionHandler: { onPressDelete: vi.fn() } }));
vi.mock("@/resources/services/math-utility", () => ({ mathUtility: { roundPosOfObject: vi.fn() } }));

import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { eventBus } from "@/resources/services/event-bus";

beforeEach(() => cleanup());

describe("useKeyboardShortcuts", () => {
  it("publishes ctrlPlusSPressed on Ctrl+S and prevents the default", () => {
    const handler = vi.fn();
    const sub = eventBus.subscribe("ctrlPlusSPressed", handler);
    renderHook(() => useKeyboardShortcuts());

    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    sub.dispose();
  });
});
