import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import * as yaml from "yaml";

import { FRAMEWORK_VERSION } from "../constants";
import { packageRoot, processFile } from "../config";
import { DocsError } from "../errors";
import { isFile, splitFrontMatter } from "../util";
import type { InstallSkillArgs } from "./types";

interface SkillMetadata {
  metadata?: { standard_version?: unknown };
}

function readSkillVersion(file: string): string {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new DocsError(`cannot read skill source: ${(error as Error).message}`);
  }
  const { front } = splitFrontMatter(text);
  if (front === null) {
    throw new DocsError(`skill source is missing front matter: ${file}`);
  }
  let parsed: SkillMetadata;
  try {
    parsed = (yaml.parse(front) ?? {}) as SkillMetadata;
  } catch (error) {
    throw new DocsError(`invalid skill front matter: ${(error as Error).message}`);
  }
  const version = parsed.metadata?.standard_version;
  if (typeof version !== "string" || !version.trim()) {
    throw new DocsError(
      `skill front matter is missing metadata.standard_version: ${file}`,
    );
  }
  return version.trim();
}

function skillDestination(args: InstallSkillArgs): string {
  if (args.repo) {
    return path.join(
      path.resolve(args.repo),
      ".opencode",
      "skills",
      "project-docs",
    );
  }
  const configHome = process.env.XDG_CONFIG_HOME
    ? path.resolve(process.env.XDG_CONFIG_HOME)
    : path.join(os.homedir(), ".config");
  return path.join(configHome, "opencode", "skills", "project-docs");
}

/**
 * Install the project-docs skill with its generated standard copy.
 *
 * The skill source is the package's `framework/skills/project-docs` directory,
 * which contains only `SKILL.md`. `references/PROCESS.md` is generated from the
 * package's canonical PROCESS.md at install time.
 */
export function cmdInstallSkill(args: InstallSkillArgs): number {
  const root = packageRoot();
  const processPath = processFile();
  if (root === null || processPath === null) {
    throw new DocsError("cannot locate PROCESS.md in the installed package");
  }
  const source = path.join(root, "framework", "skills", "project-docs");
  const skillFile = path.join(source, "SKILL.md");
  if (!isFile(skillFile)) {
    throw new DocsError(
      `skill source is incomplete: ${source} (expected SKILL.md)`,
    );
  }
  const skillVersion = readSkillVersion(skillFile);
  if (skillVersion !== FRAMEWORK_VERSION) {
    throw new DocsError(
      `skill metadata.standard_version ${skillVersion} does not match package version ${FRAMEWORK_VERSION}`,
    );
  }

  const destination = skillDestination(args);
  if (existsSync(destination)) {
    if (!args.force) {
      throw new DocsError(`refusing to overwrite ${destination}`);
    }
    rmSync(destination, { recursive: true, force: true });
  }
  const references = path.join(destination, "references");
  mkdirSync(references, { recursive: true });
  copyFileSync(skillFile, path.join(destination, "SKILL.md"));
  copyFileSync(processPath, path.join(references, "PROCESS.md"));
  process.stdout.write(`Installed project-docs skill at ${destination}\n`);
  return 0;
}
