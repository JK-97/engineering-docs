import { readFileSync } from "node:fs";
import path from "node:path";

import * as yaml from "yaml";

import { PREFIX_RE } from "./constants";
import { DocsError, UsageError } from "./errors";
import { state } from "./state";
import { expandHome, isDirectory, isFile, relpath } from "./util";

export function repoBoundary(root: string): string {
  let current = path.resolve(root);
  while (true) {
    if (isDirectory(path.join(current, ".git")) || isFile(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return path.resolve(root);
    }
    current = parent;
  }
}

export function templatesDir(): string {
  if (process.env.DOCS_TEMPLATES) {
    return path.resolve(expandHome(process.env.DOCS_TEMPLATES));
  }
  return path.join(
    packageRoot() ?? path.resolve(__dirname, ".."),
    "framework",
    "templates",
  );
}

/**
 * Locate the installed package root by the PROCESS.md it always ships.
 *
 * `dist/cli.cjs` sits one level below the package root; a source checkout
 * compiled from `src/` has the same shape.
 */
export function packageRoot(): string | null {
  const candidates = [
    path.resolve(__dirname, ".."),
    path.resolve(__dirname, "..", ".."),
  ];
  for (const candidate of candidates) {
    if (isFile(path.join(candidate, "PROCESS.md"))) {
      return candidate;
    }
  }
  return null;
}

/** Absolute path to the package's canonical PROCESS.md. */
export function processFile(): string | null {
  const root = packageRoot();
  return root === null ? null : path.join(root, "PROCESS.md");
}

export function profileSlug(profile: Record<string, unknown>): string {
  for (const key of ["id", "slug"]) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function readProfileFile(file: string): Record<string, unknown> {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (error) {
    throw new DocsError(`cannot read ${relpath(file)}: ${(error as Error).message}`);
  }
  let data: unknown;
  try {
    data = yaml.parse(text);
  } catch (error) {
    throw new DocsError(`cannot read ${relpath(file)}: ${(error as Error).message}`);
  }
  if (data === null || data === undefined) {
    return {};
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new DocsError(`${relpath(file)} must contain a YAML mapping`);
  }
  return data as Record<string, unknown>;
}

export function configure(root: string): void {
  const resolved = path.resolve(root);
  if (!isDirectory(resolved)) {
    throw new UsageError(`docs root is not a directory: ${root}`);
  }
  state.root = resolved;
  state.boundary = repoBoundary(resolved);
  state.projectId = "";
  state.mode = "empty";

  const profilePath = path.join(resolved, "project.yaml");
  if (isFile(profilePath)) {
    state.mode = "single";
    let profile: Record<string, unknown> = {};
    try {
      profile = readProfileFile(profilePath);
    } catch {
      // Load errors are reported by loadProjectProfile/check.
    }
    state.projectId = profileSlug(profile) || path.basename(resolved);
  }

  state.templates = templatesDir();
}

export function loadProjectProfile(): Record<string, unknown> {
  if (state.mode !== "single") {
    throw new UsageError(
      `no project.yaml in docs root: ${relpath(state.root)} (run \`engineering-docs init\` first)`,
    );
  }
  const profilePath = path.join(state.root, "project.yaml");
  if (!isFile(profilePath)) {
    throw new DocsError(`${relpath(profilePath)} is missing`);
  }
  return readProfileFile(profilePath);
}

export function projectPrefix(
  slug: string,
  profile: Record<string, unknown> = {},
): string {
  let candidate =
    typeof profile.prefix === "string" ? profile.prefix.trim().toUpperCase() : "";
  if (!candidate) {
    const letters = slug.replace(/[^A-Za-z]/g, "").toUpperCase();
    candidate = letters.slice(0, 3) || "DOC";
  }
  candidate = candidate.replace(/[^A-Z0-9]/g, "");
  if (candidate.length < 2) {
    candidate = `${candidate}X`.slice(0, 2);
  }
  if (!/^[A-Za-z]/.test(candidate)) {
    candidate = "DOC";
  }
  return candidate.slice(0, 6);
}

export function projectTitle(
  slug: string,
  profile: Record<string, unknown>,
): string {
  for (const key of ["title", "name"]) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return slug;
}

export function projectOwner(profile: Record<string, unknown>): string {
  for (const key of ["owner", "owners"]) {
    const value = profile[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];
      if (typeof first === "string" && first.trim()) {
        return first.trim();
      }
    }
  }
  return (
    process.env.GIT_AUTHOR_NAME ||
    process.env.USER ||
    process.env.USERNAME ||
    "unassigned"
  );
}

export function validatePrefix(value: string): boolean {
  return PREFIX_RE.test(value);
}
