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
  },
});
