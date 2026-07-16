import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@gds": path.resolve(__dirname, "../mmar-global-data-structure"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // Node stays the default so store/service suites run without a DOM.
    // Component tests opt into jsdom per-file with a `@vitest-environment jsdom`
    // docblock — cheaper than a global switch, and it keeps the blast radius small.
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Scaffold has no tests yet; keep `npm test` green until migration adds them.
    passWithNoTests: true,
    // The live-server integration tests (*.integration.test.ts) do heavy work: the
    // in-container GET /metamodel/sceneTypes payload plus gds `Metamodel.fromJS`
    // revive takes ~4-5s, which overran the 5s default under parallel-file load
    // (P3 discovery). Bumped so live tests don't false-timeout; unit suites are
    // unaffected (they finish in ms).
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
