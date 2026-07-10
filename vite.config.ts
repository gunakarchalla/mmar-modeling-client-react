import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.PORT ?? "8085"),
    host: true,
  },
  preview: {
    port: parseInt(process.env.PORT ?? "8085"),
    host: true,
  },
  resolve: {
    alias: {
      "@gds": path.resolve(__dirname, "../mmar-global-data-structure"),
      "@": path.resolve(__dirname, "src"),
      // The shared gds `User` DTO statically imports the Node-only
      // `jsonwebtoken` (for server-side jwt.sign). Stub it out so it never
      // reaches the browser bundle, where it crashes on Node's Buffer.
      jsonwebtoken: path.resolve(__dirname, "src/stubs/jsonwebtoken.ts"),
    },
  },
  optimizeDeps: {
    // Keep jsonwebtoken out of the esbuild dep pre-bundle, otherwise the
    // optimizer grabs the real (Node-only) package before resolve.alias can
    // redirect it. Excluded => the import flows through resolve.alias -> stub.
    exclude: ["jsonwebtoken"],
  },
});
