import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import * as yaml from "yaml";

import {
  FRAMEWORK_VERSION,
  PACKAGE_NAME,
  PREFIX_RE,
  PROJECT_SLUG_RE,
  TYPES,
} from "../constants";
import { projectPrefix, templatesDir } from "../config";
import { DocsError, UsageError } from "../errors";
import { state } from "../state";
import {
  INIT_DESIGN_SCOPE,
  INIT_DESIGN_SUMMARY,
  INIT_SUBDIRS,
  initReadme,
  templateBody,
} from "../templates";
import {
  anyEntries,
  isDirectory,
  isFile,
  renderDocument,
  resolveRoot,
  slugify,
  todayISO,
  warn,
  writeNewFile,
} from "../util";
import type { InitArgs } from "./types";

function displayPath(target: string): string {
  const relative = path.relative(process.cwd(), path.resolve(target));
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }
  if (!relative) {
    return ".";
  }
  return path.resolve(target);
}

function yamlDump(value: unknown): string {
  return yaml
    .stringify(value, {
      lineWidth: 0,
      singleQuote: true,
      indentSeq: false,
    })
    .replace(/^(created|updated): (\d{4}-\d{2}-\d{2})$/gm, "$1: '$2'");
}

/**
 * Scaffold a docs root with project content only.
 *
 * The CLI, the standard, and the templates stay in the installed package; they
 * are never copied into the docs root.
 */
export function cmdInit(args: InitArgs): number {
  const root = resolveRoot(args.root);
  state.root = root;
  state.templates = templatesDir();
  const profilePath = path.join(root, "project.yaml");

  if (existsSync(profilePath)) {
    throw new DocsError(
      `refusing to overwrite existing ${displayPath(profilePath)}; init only runs once per root`,
    );
  }
  if (existsSync(root) && !isDirectory(root)) {
    throw new UsageError(`docs root is not a directory: ${displayPath(root)}`);
  }
  if (isDirectory(root) && anyEntries(root) && !args.force) {
    throw new DocsError(
      `docs root is not empty: ${displayPath(root)} (pass --force to add missing files; existing files are never overwritten)`,
    );
  }

  const projectId = (args.id ?? "").trim() || slugify(path.basename(root));
  if (!projectId) {
    throw new UsageError("cannot derive --id; pass --id explicitly");
  }
  if (!PROJECT_SLUG_RE.test(projectId)) {
    throw new UsageError(
      `invalid project id: ${projectId} (use lowercase ASCII kebab-case)`,
    );
  }
  const prefix = (args.prefix ?? "").trim().toUpperCase() || projectPrefix(projectId);
  if (!PREFIX_RE.test(prefix)) {
    throw new UsageError(
      `invalid project prefix: ${prefix} (use 2-6 uppercase letters/digits, starting with a letter)`,
    );
  }
  const name = (args.name ?? "").trim() || projectId;
  const summary = (args.summary ?? "").trim() || "TODO: one-sentence project summary";
  const owner =
    (args.owner ?? "").trim() ||
    process.env.GIT_AUTHOR_NAME ||
    process.env.USER ||
    process.env.USERNAME ||
    "unassigned";
  const todayText = todayISO();

  const missing = TYPES.filter(
    (kind) => !isFile(path.join(state.templates, `${kind}.md`)),
  );
  if (missing.length > 0) {
    throw new DocsError(
      `template directory is incomplete: ${displayPath(state.templates)} (missing: ${missing.join(", ")})`,
    );
  }

  const profile: Record<string, unknown> = {
    id: projectId,
    name,
    prefix,
    summary,
    status: "active",
    owner,
    standard_version: FRAMEWORK_VERSION,
    created: todayText,
    updated: todayText,
  };

  const designMeta: Record<string, unknown> = {
    id: `${prefix}-DES-001`,
    project: projectId,
    type: "design",
    status: "draft",
    title: "System overview",
    summary: INIT_DESIGN_SUMMARY,
    created: todayText,
    created_source: "engineering-docs init",
    completed: null,
    completed_source: null,
    updated: todayText,
    last_verified: null,
    owner,
    related: [],
    supersedes: null,
    superseded_by: null,
    parent: null,
    scope: INIT_DESIGN_SCOPE,
    owns: ["TODO: system boundary owned by this design"],
    does_not_own: ["TODO: adjacent boundary this design does not own"],
    interfaces: [],
    implementation: "none",
  };
  const designValues: Record<string, string> = {
    id: String(designMeta.id),
    project: projectId,
    project_name: name,
    prefix,
    type: "design",
    status: "draft",
    title: "System overview",
    summary: INIT_DESIGN_SUMMARY,
    owner,
    date: todayText,
    created: todayText,
    updated: todayText,
    slug: "system-overview",
    design: "",
    parent: "",
    issue: "",
    activation_trigger: "",
    commit: "",
    commits: "TBD",
  };
  const designContent = renderDocument(
    designMeta,
    templateBody("design", designValues),
  );

  try {
    mkdirSync(root, { recursive: true });
    for (const directory of INIT_SUBDIRS) {
      mkdirSync(path.join(root, directory), { recursive: true });
    }
  } catch (error) {
    throw new DocsError(
      `cannot scaffold ${displayPath(root)}: ${(error as Error).message}`,
    );
  }

  const scaffold: Array<[string, string]> = [
    [profilePath, yamlDump(profile)],
    [path.join(root, "README.md"), initReadme(FRAMEWORK_VERSION)],
    [path.join(root, "designs", "system-overview.md"), designContent],
  ];
  const kept: string[] = [];
  for (const [target, content] of scaffold) {
    if (existsSync(target)) {
      warn(`keeping existing ${displayPath(target)}`);
      kept.push(target);
      continue;
    }
    writeNewFile(target, content);
  }

  process.stdout.write(`Initialized docs root at ${displayPath(root)}\n`);
  if (kept.length > 0) {
    process.stdout.write(
      `Kept ${kept.length} existing file(s); nothing was overwritten.\n`,
    );
  }
  process.stdout.write("Next steps:\n");
  process.stdout.write(
    `  1. Edit ${displayPath(path.join(root, "designs", "system-overview.md"))} to describe the current system.\n`,
  );
  process.stdout.write(
    `  2. npx ${PACKAGE_NAME}@${FRAMEWORK_VERSION} --root ${displayPath(root)} index\n`,
  );
  process.stdout.write(
    `  3. npx ${PACKAGE_NAME}@${FRAMEWORK_VERSION} --root ${displayPath(root)} check\n`,
  );
  return 0;
}
