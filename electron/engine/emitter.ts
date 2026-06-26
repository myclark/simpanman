// Generated-project assembly + on-disk emission — ported from server/src/codegen/emitter.rs.

import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { GeneratedBoard, GeneratedFile, GeneratedProject } from "./types";

/** Split a rendered board into the file list of a PlatformIO project. */
export function toGeneratedProject(
  boardId: string,
  generated: GeneratedBoard,
): GeneratedProject {
  const files: GeneratedFile[] = [
    { relativePath: "platformio.ini", content: generated.platformioIni },
    { relativePath: "src/main.cpp", content: generated.mainCpp },
  ];

  if (generated.boardJson != null) {
    files.push({
      relativePath: `boards/${boardId.replace(/-/g, "_")}.json`,
      content: generated.boardJson,
    });
  }

  return { boardId, files };
}

/** Write a generated project under the given root directory. */
export async function writeProjectFiles(
  root: string,
  generated: GeneratedProject,
): Promise<void> {
  for (const file of generated.files) {
    const dest = path.join(root, file.relativePath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, file.content);
  }
}

/** Write a generated project into a fresh temp directory and return its path. */
export async function writeToTempDir(generated: GeneratedProject): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "simpanman-"));
  await writeProjectFiles(root, generated);
  return root;
}
