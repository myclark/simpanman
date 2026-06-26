// Bundle the Electron main process and preload script with esbuild.
// All node_modules stay external (electron-builder packs production deps); only
// our own TS — including the inlined firmware templates — is bundled.

import { build } from "esbuild";
import { rmSync } from "node:fs";

const outdir = "dist-electron";
rmSync(outdir, { recursive: true, force: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  packages: "external",
  sourcemap: true,
  logLevel: "info",
};

await Promise.all([
  build({
    ...common,
    entryPoints: { main: "electron/main.ts" },
    outdir,
    outExtension: { ".js": ".cjs" },
  }),
  build({
    ...common,
    entryPoints: { preload: "electron/preload.ts" },
    outdir,
    outExtension: { ".js": ".cjs" },
  }),
]);
