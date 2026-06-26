import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Renderer for the Electron app. `base: "./"` makes asset URLs relative so the
// built index.html loads correctly over file:// in the packaged app. The former
// /api → Rust-server proxy is gone: the renderer now talks to the main process
// over the preload IPC bridge (window.api).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "./",
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
