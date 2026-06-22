import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
) as { version: string };

// The local Rust server (see server/src/server.rs). Override with
// SIMPANMAN_PORT to match a non-default backend port during development.
const apiPort = process.env.SIMPANMAN_PORT ?? "8787";
const apiTarget = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    proxy: {
      "/api/events": { target: apiTarget, ws: true },
      "/api": { target: apiTarget },
    },
  },
  build: {
    target: "es2022",
  },
});
