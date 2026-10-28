import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

import {
  ID_RE,
  PROJECT_SLUG_RE,
  PREFIX_RE,
  TYPES,
  TYPE_LABELS,
  TYPE_PREFIX,
  TYPE_STATUSES,
  type DocType,
} from "./constants";
import { DocsError } from "./errors";
import { loadProjectProfile, projectOwner, projectPrefix, projectTitle } from "./config";
import { type Doc, loadAllDocs } from "./documents";
import { state } from "./state";
import {
  commitList,
  isStringList,
  isoDate,
  mdText,
  parseDate,
  relationList,
  relpath,
} from "./util";

const HISTORY_STATUSES = new Set(["superseded", "rejected", "withdrawn"]);

function llmsDocLine(doc: Record<string, unknown>): string {
  const docSummary = String(doc.summary ?? "");
  const suffix = docSummary ? ` - ${mdText(docSummary)}` : "";
  return `- [${String(doc.id ?? "")} - ${mdText(doc.title ?? doc.id ?? "")}](${String(
    doc.path ?? "",
  )}) - ${String(doc.type ?? "")} - ${String(doc.status ?? "")}${suffix}`;
}

function entryText(
  meta: Record<string, unknown>,
  key: string,
  rel: string,
): string {
  const value = meta[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new DocsError(
      `cannot index ${rel}: ${key} must be a non-empty string`,
    );
  }
  return value;
}

function entryDate(
  meta: Record<string, unknown>,
  key: string,
  rel: string,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(meta, key)) {
    return null;
  }
  const raw = meta[key];
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  const parsed = parseDate(raw);
  if (!parsed) {
    throw new DocsError(
      `cannot index ${rel}: ${key} must be YYYY-MM-DD or null`,
    );
  }
  return parsed.toISOString().slice(0, 10);
}

function entryList(
  meta: Record<string, unknown>,
  key: string,
  rel: string,
): string[] {
  const value = meta[key];
  if (value === null || value === undefined) {
    return [];
  }
  if (!isStringList(value)) {
    throw new DocsError(
      `cannot index ${rel}: ${key} must be a list of strings`,
    );
  }
  const result: string[] = [];
  for (const item of value) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

function entryCommits(
  meta: Record<string, unknown>,
  rel: string,
): string[] {
  const commits = commitList(meta.commits);
  if (commits === null) {
    throw new DocsError(
      `cannot index ${rel}: commits must be a list of strings`,
    );
  }
  const result: string[] = [];
  for (const item of commits) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

function entryRelation(
  meta: Record<string, unknown>,
  key: string,
  rel: string,
): string[] {
  const parsed = relationList(meta[key]);
  if (parsed === null) {
    throw new DocsError(
      `cannot index ${rel}: ${key} must be an id, a list of ids, or null`,
    );
  }
  return parsed;
}

function entryId(
  meta: Record<string, unknown>,
  key: string,
  rel: string,
  kind: string,
): string | null {
  const value = meta[key];
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value !== "string") {
    throw new DocsError(`cannot index ${rel}: ${key} must be an id or null`);
  }
  const match = ID_RE.exec(value);
  if (!match || match.groups?.kind !== kind) {
    throw new DocsError(
      `cannot index ${rel}: ${key} must be a ${kind} id or null`,
    );
  }
  return value;
}

export function catalogEntry(
  doc: Doc,
  children: readonly string[],
): Record<string, unknown> {
  const meta = doc.meta;
  const rel = doc.rel;
  const docType = meta.type;
  const status = meta.status;
  if (!(TYPES as readonly string[]).includes(String(docType))) {
    throw new DocsError(`cannot index ${rel}: invalid type`);
  }
  const type = docType as DocType;
  if (!TYPE_STATUSES[type].includes(status as never)) {
    throw new DocsError(
      `cannot index ${rel}: status ${status} is not valid for ${type}`,
    );
  }
  const rawId = meta.id;
  const idMatch = typeof rawId === "string" ? ID_RE.exec(rawId) : null;
  if (!idMatch) {
    throw new DocsError(`cannot index ${rel}: invalid id`);
  }
  if (idMatch.groups?.kind !== TYPE_PREFIX[type]) {
    throw new DocsError(
      `cannot index ${rel}: id prefix does not match type`,
    );
  }

  const entry: Record<string, unknown> = {
    id: rawId,
    project: doc.project,
    type,
    status,
    title: entryText(meta, "title", rel),
    summary: entryText(meta, "summary", rel),
    path: rel,
    created: entryDate(meta, "created", rel),
    completed: entryDate(meta, "completed", rel),
    updated: entryDate(meta, "updated", rel),
    last_verified: entryDate(meta, "last_verified", rel),
    owner: entryText(meta, "owner", rel),
    related: entryRelation(meta, "related", rel),
    supersedes: entryRelation(meta, "supersedes", rel),
    superseded_by: entryRelation(meta, "superseded_by", rel),
  };
  for (const key of ["created_source", "completed_source"]) {
    const value = meta[key];
    entry[key] = typeof value === "string" && value.trim() ? value.trim() : null;
  }

  switch (type) {
    case "design": {
      entry.parent = entryId(meta, "parent", rel, "DES");
      entry.scope = typeof meta.scope === "string" ? meta.scope : "";
      entry.owns = entryList(meta, "owns", rel);
      entry.does_not_own = entryList(meta, "does_not_own", rel);
      entry.interfaces = entryList(meta, "interfaces", rel);
      const implementation = meta.implementation;
      if (!["none", "partial", "complete"].includes(String(implementation))) {
        throw new DocsError(
          `cannot index ${rel}: implementation must be none, partial, or complete`,
        );
      }
      entry.implementation = implementation;
      entry.children = [...children].sort();
      break;
    }
    case "proposal": {
      const issue = meta.issue;
      if (
        typeof issue === "boolean" ||
        (issue !== null &&
          issue !== undefined &&
          typeof issue !== "string" &&
          typeof issue !== "number")
      ) {
        throw new DocsError(
          `cannot index ${rel}: issue must be a number, URL, or null`,
        );
      }
      entry.issue = issue === undefined ? null : issue;
      entry.design = entryId(meta, "design", rel, "DES");
      entry.activation_trigger =
        typeof meta.activation_trigger === "string"
          ? meta.activation_trigger
          : null;
      break;
    }
    case "decision": {
      entry.options = entryList(meta, "options", rel);
      entry.decision = typeof meta.decision === "string" ? meta.decision : "";
      entry.consequences = entryList(meta, "consequences", rel);
      break;
    }
    case "record": {
      entry.commits = entryCommits(meta, rel);
      entry.proposal = entryId(meta, "proposal", rel, "PROP");
      entry.evidence = entryList(meta, "evidence", rel);
      break;
    }
    case "report": {
      entry.method = typeof meta.method === "string" ? meta.method : "";
      entry.findings = entryList(meta, "findings", rel);
      entry.limitations = entryList(meta, "limitations", rel);
      break;
    }
    case "reference": {
      entry.read_when = entryList(meta, "read_when", rel);
      break;
    }
  }
  return entry;
}

function childrenMap(docs: readonly Doc[]): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const doc of docs) {
    if (doc.meta.type !== "design") {
      continue;
    }
    const parent = doc.meta.parent;
    if (typeof parent === "string" && parent) {
      const list = result.get(parent) ?? [];
      list.push(doc.id);
      result.set(parent, list);
    }
  }
  return result;
}

export function buildCatalog(): Record<string, unknown> {
  if (state.mode !== "single") {
    throw new DocsError(
      `cannot index: no project.yaml in docs root: ${relpath(state.root)}`,
    );
  }
  const { docs, errors } = loadAllDocs();
  if (errors.length > 0) {
    throw new DocsError(`cannot build catalog: ${errors[0]}`);
  }
  const seenIds = new Map<string, string>();
  for (const doc of docs) {
    if (!doc.id) {
      throw new DocsError(`cannot index ${doc.rel}: missing id`);
    }
    if (seenIds.has(doc.id)) {
      throw new DocsError(
        `cannot index ${doc.rel}: duplicate id ${doc.id} (also in ${seenIds.get(doc.id)})`,
      );
    }
    seenIds.set(doc.id, doc.rel);
  }
  if (!PROJECT_SLUG_RE.test(state.projectId)) {
    throw new DocsError(`cannot index invalid project id: ${state.projectId}`);
  }
  const profile = loadProjectProfile();
  const rawPrefix = profile.prefix;
  if (typeof rawPrefix !== "string" || !PREFIX_RE.test(rawPrefix)) {
    throw new DocsError(
      `cannot index project ${state.projectId}: invalid prefix`,
    );
  }
  const prefix = projectPrefix(state.projectId, profile);
  if (!PREFIX_RE.test(prefix)) {
    throw new DocsError(
      `cannot index project ${state.projectId}: invalid prefix`,
    );
  }
  docs.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  for (const doc of docs) {
    if (doc.meta.project !== state.projectId) {
      throw new DocsError(
        `cannot index ${doc.rel}: front matter project must be ${state.projectId}`,
      );
    }
    const idMatch = ID_RE.exec(doc.id);
    if (!idMatch || idMatch.groups?.prefix !== prefix) {
      throw new DocsError(
        `cannot index ${doc.rel}: id must start with ${prefix}-`,
      );
    }
  }
  const children = childrenMap(docs);
  const projectEntry: Record<string, unknown> = {
    slug: state.projectId,
    prefix,
    title: projectTitle(state.projectId, profile),
    name: projectTitle(state.projectId, profile),
    status: (["active", "paused", "archived"] as readonly unknown[]).includes(
      profile.status,
    )
      ? profile.status
      : "active",
    owner: projectOwner(profile),
    summary:
      typeof profile.summary === "string" && profile.summary.trim()
        ? profile.summary.trim()
        : "",
    path: relpath(state.root),
    docs: docs.map((doc) => catalogEntry(doc, children.get(doc.id) ?? [])),
  };
  for (const key of ["created", "updated"]) {
    const value = isoDate(profile[key]);
    if (value) {
      projectEntry[key] = value;
    }
  }
  if (typeof profile.standard_version === "string" && profile.standard_version.trim()) {
    projectEntry.standard_version = profile.standard_version.trim();
  }
  if (isStringList(profile.repos)) {
    projectEntry.repos = [...profile.repos];
  }
  return {
    schema_version: 2,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    projects: [projectEntry],
  };
}

export function buildLlms(catalog: Record<string, unknown>): string {
  const lines: string[] = [
    "# Engineering Docs",
    "",
    "> Indexed engineering documentation. Generated by `engineering-docs index`; do not edit manually.",
    "",
  ];
  const projects = (catalog.projects as Record<string, unknown>[]) ?? [];
  if (projects.length === 0) {
    lines.push("_No indexed project._");
    lines.push("");
    return `${lines.join("\n").replace(/\n+$/, "")}\n`;
  }
  const project = projects[0];
  const slug = String(project.slug ?? "");
  const title = String(project.title ?? "") || slug;
  lines.push(`## ${mdText(title)}`);
  lines.push("");
  const summary = String(project.summary ?? "");
  const projectPath = String(project.path ?? ".");
  const readme =
    projectPath === "" || projectPath === "."
      ? "README.md"
      : `${projectPath}/README.md`;
  const readmePath = path.resolve(state.root, projectPath, "README.md");
  try {
    readFileSync(readmePath);
    if (summary) {
      lines.push(`- [Project overview](${readme}) - ${mdText(summary)}`);
    } else {
      lines.push(`- [Project overview](${readme})`);
    }
    lines.push("");
  } catch {
    // Missing README: omit the overview entry.
  }
  const docs = (project.docs as Record<string, unknown>[]) ?? [];
  const current = docs.filter(
    (doc) => !HISTORY_STATUSES.has(String(doc.status ?? "")),
  );
  const history = docs.filter((doc) =>
    HISTORY_STATUSES.has(String(doc.status ?? "")),
  );
  for (const type of TYPES) {
    const typed = current.filter((doc) => doc.type === type);
    if (typed.length === 0) {
      continue;
    }
    lines.push(`### ${TYPE_LABELS[type]}`);
    lines.push("");
    for (const doc of typed) {
      lines.push(llmsDocLine(doc));
    }
    lines.push("");
  }
  if (history.length > 0) {
    lines.push("### History (not current guidance)");
    lines.push("");
    for (const doc of history) {
      lines.push(llmsDocLine(doc));
    }
    lines.push("");
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

export function writeIndexFiles(
  catalog: Record<string, unknown>,
  llms: string,
): void {
  writeFileSync(
    path.join(state.root, "catalog.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );
  writeFileSync(path.join(state.root, "llms.txt"), llms, "utf8");
}

export function indexIssues(
  catalog: Record<string, unknown>,
  llms: string,
): string[] {
  const issues: string[] = [];
  const catalogPath = path.join(state.root, "catalog.json");
  let actual: unknown = null;
  try {
    const text = readFileSync(catalogPath, "utf8");
    actual = JSON.parse(text);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      issues.push("catalog.json is missing; run `engineering-docs index`");
    } else {
      issues.push(`catalog.json is invalid JSON: ${(error as Error).message}`);
    }
  }
  if (actual !== null) {
    if (typeof actual !== "object" || Array.isArray(actual)) {
      issues.push("catalog.json must contain a JSON object");
    } else {
      const record = actual as Record<string, unknown>;
      if (record.schema_version !== 2) {
        issues.push("catalog.json has an unsupported schema_version");
      }
      if (typeof record.generated_at !== "string") {
        issues.push("catalog.json is missing generated_at");
      }
      const actualBody = { ...record };
      delete actualBody.generated_at;
      const expectedBody = { ...catalog };
      delete expectedBody.generated_at;
      if (!isDeepStrictEqual(actualBody, expectedBody)) {
        issues.push("catalog.json is stale; run `engineering-docs index`");
      }
    }
  }

  const llmsPath = path.join(state.root, "llms.txt");
  try {
    const actualLlms = readFileSync(llmsPath, "utf8");
    if (actualLlms.replace(/\s+$/, "") !== llms.replace(/\s+$/, "")) {
      issues.push("llms.txt is stale; run `engineering-docs index`");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      issues.push("llms.txt is missing; run `engineering-docs index`");
    } else {
      issues.push(`cannot read llms.txt: ${(error as Error).message}`);
    }
  }
  return issues;
}
