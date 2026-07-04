// Bridge to the native Rust helper binary (serial enumeration + PlatformIO
// detect/compile/upload). The helper is a one-shot CLI invoked per operation;
// its build stream is line-delimited JSON (NDJSON) on stdout. Keeping
// serial/HID/pio in a standalone binary avoids Electron native-module rebuild
// pain.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { app } from "electron";

import type { SerialPort } from "./engine";

const isWin = process.platform === "win32";
const HELPER_BIN = isWin ? "simpanman-helper.exe" : "simpanman-helper";
const PIO_BIN = isWin ? "pio.exe" : "pio";

/** Locate the helper binary: explicit override → packaged resources → dev target dir. */
function helperPath(): string {
  const override = process.env.SIMPANMAN_HELPER;
  if (override && existsSync(override)) return override;

  if (app.isPackaged) {
    return path.join(process.resourcesPath, "helper", HELPER_BIN);
  }

  // Dev: prefer a release build, fall back to debug.
  const root = path.resolve(app.getAppPath());
  for (const profile of ["release", "debug"]) {
    const p = path.join(root, "helper", "target", profile, HELPER_BIN);
    if (existsSync(p)) return p;
  }
  // Last resort: rely on PATH.
  return HELPER_BIN;
}

/** Locate the bundled PlatformIO binary so the helper can find it (SIMPANMAN_PIO). */
function pioPath(): string | undefined {
  if (process.env.SIMPANMAN_PIO) return process.env.SIMPANMAN_PIO;
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, "helper", PIO_BIN);
    if (existsSync(p)) return p;
  }
  return undefined;
}

function helperEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const pio = pioPath();
  if (pio) env.SIMPANMAN_PIO = pio;
  return env;
}

/** Run a helper subcommand that prints one JSON value to stdout and exits. */
function runHelperJson<T>(args: string[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath(), args, { env: helperEnv() });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(err.trim() || `helper ${args[0]} exited with code ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(out) as T);
      } catch (e) {
        reject(new Error(`parsing helper output: ${(e as Error).message}`));
      }
    });
  });
}

/** Enumerate serial ports via `helper list-ports` → parsed JSON array. */
export function listSerialPorts(): Promise<SerialPort[]> {
  return runHelperJson<SerialPort[]>(["list-ports"]);
}

export type PioInfo = { available: boolean; version: string | null };

/** Detect PlatformIO via `helper pio-version` → parsed JSON. */
export function detectPio(): Promise<PioInfo> {
  return runHelperJson<PioInfo>(["pio-version"]);
}

export type HelperLog = { line: string; isErr: boolean };
export type HelperStatus = { success: boolean; exitCode: number };

type RunCallbacks = {
  onLog: (e: HelperLog) => void;
  onStatus: (e: HelperStatus) => void;
};

/** Spawn `helper <args>`, streaming its NDJSON events to the callbacks.
 * Resolves on success, rejects on non-zero exit. Shared by compile/upload. */
function runHelperStream(args: string[], cb: RunCallbacks): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath(), args, { env: helperEnv() });
    let lastStatus: HelperStatus | null = null;

    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      let msg: {
        type?: string;
        line?: string;
        isErr?: boolean;
        success?: boolean;
        exitCode?: number;
      };
      try {
        msg = JSON.parse(line);
      } catch {
        // Non-JSON line from the helper — surface it as a log line.
        cb.onLog({ line, isErr: false });
        return;
      }
      if (msg.type === "log") {
        cb.onLog({ line: msg.line ?? "", isErr: msg.isErr ?? false });
      } else if (msg.type === "status") {
        lastStatus = { success: msg.success ?? false, exitCode: msg.exitCode ?? -1 };
        cb.onStatus(lastStatus);
      }
    });

    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      const ok = lastStatus ? lastStatus.success : code === 0;
      if (ok) resolve();
      else reject(new Error(stderr.trim() || `helper exited with code ${code}`));
    });
  });
}

/** Run `helper compile` (build only, no upload) for a generated project directory. */
export function compileBoard(
  projectDir: string,
  envName: string,
  cb: RunCallbacks,
): Promise<void> {
  return runHelperStream(["compile", "--project-dir", projectDir, "--env", envName], cb);
}

/** Run `helper upload` (bootloader touch + build + upload) for a generated
 * project directory against a specific, already-confirmed port. */
export function uploadBoard(
  projectDir: string,
  envName: string,
  port: string,
  cb: RunCallbacks,
): Promise<void> {
  return runHelperStream(
    ["upload", "--project-dir", projectDir, "--env", envName, "--port", port],
    cb,
  );
}
