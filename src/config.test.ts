import { describe, it, expect } from "vitest";
import { API_URL, SYNC_URL, resolveBackendUrl } from "./config";

// LAN workaround: the backends are absolute URLs on their own ports, with the
// host swapped to whatever host served the page. See config.ts — note this is
// HTTP-only by construction.

describe("defaults", () => {
  it("point at the backends' published ports", () => {
    // vitest's node env has no `window`, so the configured values pass through.
    expect(API_URL).toBe("http://localhost:8000");
    expect(SYNC_URL).toBe("ws://localhost:8060");
  });
});

describe("resolveBackendUrl", () => {
  it("swaps a loopback host for the host that served the page", () => {
    expect(resolveBackendUrl("http://localhost:8000", "192.168.1.42")).toBe(
      "http://192.168.1.42:8000",
    );
    expect(resolveBackendUrl("ws://localhost:8060", "192.168.1.42")).toBe(
      "ws://192.168.1.42:8060",
    );
  });

  it("rewrites the other local-only spellings too", () => {
    expect(resolveBackendUrl("http://127.0.0.1:8000", "my-laptop")).toBe(
      "http://my-laptop:8000",
    );
    expect(resolveBackendUrl("http://0.0.0.0:8000", "10.0.0.5")).toBe(
      "http://10.0.0.5:8000",
    );
  });

  it("leaves the URL alone when the page is served from localhost", () => {
    expect(resolveBackendUrl("http://localhost:8000", "localhost")).toBe(
      "http://localhost:8000",
    );
    expect(resolveBackendUrl("http://localhost:8000", "127.0.0.1")).toBe(
      "http://localhost:8000",
    );
  });

  it("honours an explicitly configured non-local host verbatim", () => {
    expect(resolveBackendUrl("http://mmar.example.org:8000", "192.168.1.42")).toBe(
      "http://mmar.example.org:8000",
    );
  });

  it("preserves the scheme — it never upgrades http to https", () => {
    // Deliberate: neither backend terminates TLS, so an upgraded scheme would
    // fail the handshake rather than fix mixed content. See config.ts.
    expect(resolveBackendUrl("http://localhost:8000", "192.168.1.42")).toMatch(/^http:/);
  });

  it("never leaves a trailing slash, which would double up on the joined path", () => {
    // Callers build URLs as `${API_URL}/${path}`, so a trailing "/" gives "//".
    expect(resolveBackendUrl("http://localhost:8000/", "192.168.1.42")).toBe(
      "http://192.168.1.42:8000",
    );
  });

  it("passes the value through when there is no DOM to derive a host from", () => {
    expect(resolveBackendUrl("http://localhost:8000", undefined)).toBe(
      "http://localhost:8000",
    );
  });

  it("passes through a value that is not a parseable URL", () => {
    expect(resolveBackendUrl("not-a-url", "192.168.1.42")).toBe("not-a-url");
  });
});
