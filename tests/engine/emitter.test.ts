import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeToBuildDir } from "../../electron/engine";
import type { GeneratedProject } from "../../electron/engine";

const generated: GeneratedProject = {
  boardId: "board-a",
  files: [
    { relativePath: "platformio.ini", content: "[env:board_a]\n" },
    { relativePath: "src/main.cpp", content: "// v1\n" },
  ],
};

describe("writeToBuildDir", () => {
  let dir: string;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("writes all generated files under the given root", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "simpanman-test-"));
    await writeToBuildDir(dir, generated);

    const ini = await readFile(path.join(dir, "platformio.ini"), "utf8");
    const cpp = await readFile(path.join(dir, "src", "main.cpp"), "utf8");
    expect(ini).toBe("[env:board_a]\n");
    expect(cpp).toBe("// v1\n");
  });

  it("overwrites existing contents on a second call", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "simpanman-test-"));
    await writeToBuildDir(dir, generated);

    const updated: GeneratedProject = {
      boardId: "board-a",
      files: [
        { relativePath: "platformio.ini", content: "[env:board_a]\n" },
        { relativePath: "src/main.cpp", content: "// v2\n" },
      ],
    };
    await writeToBuildDir(dir, updated);

    const cpp = await readFile(path.join(dir, "src", "main.cpp"), "utf8");
    expect(cpp).toBe("// v2\n");
  });

  it("creates the root directory if it doesn't exist yet", async () => {
    const base = await mkdtemp(path.join(tmpdir(), "simpanman-test-"));
    dir = path.join(base, "nested", "builds", "board-a");
    await writeToBuildDir(dir, generated);
    const ini = await readFile(path.join(dir, "platformio.ini"), "utf8");
    expect(ini).toBe("[env:board_a]\n");
    dir = base; // clean up the actual temp root, not just the nested dir
  });
});
