import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseProject } from "../../electron/engine";
import type { Project } from "../../electron/engine";

const here = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(here, "../../examples");

/** Load one of the example `.spm` projects from examples/ (mirrors the Rust fixtures). */
export function loadFixture(name: string): Project {
  const content = readFileSync(path.join(examplesDir, name), "utf8");
  return parseProject(content);
}
