import { defineConfig } from "vitest/config";

// Engine unit/snapshot tests run in Node (the engine is the former Rust backend
// ported to TS, exercised directly without Electron).
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/engine/**/*.test.ts", "src/**/*.test.ts"],
  },
});
