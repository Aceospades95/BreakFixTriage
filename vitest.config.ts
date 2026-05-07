import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Round-11 §2D — the `server-only` package is a runtime-zero
      // shim that the Next.js bundler resolves; vitest doesn't, so
      // imports of server-marked modules from a test crash. Map to
      // a no-op so the integration suite can pull in lib code that
      // declares `import "server-only"` at the top of the file.
      "server-only": path.resolve(__dirname, "./tests/shims/server-only.ts"),
    },
  },
});
