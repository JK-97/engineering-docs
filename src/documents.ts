import path from "node:path";

import { STATUSES, TYPE_STATUSES, TYPES, type DocType } from "./constants";
import { UsageError } from "./errors";
import { state } from "./state";
import { readDocument, relpath, walkFiles } from "./util";

export class Doc {
  constructor(
    public readonly path: string,
    public readonly rel: string,
    public readonly meta: Record<string, unknown>,
    public readonly body: string,
    public readonly raw: string,
    public readonly project: string,
  ) {}

  get id(): string {
    const value = this.meta.id;
    return typeof value === "string" ? value : "";
  }
}

function relativeParts(file: string): string[] {
  return relpath(file)
    .split("/")
    .filter((part) => part !== "" && part !== ".");
}

export function docPaths(): string[] {
  return walkFiles(state.root, {
    skipHidden: true,
    skipDirs: new Set(["node_modules", ".venv"]),
  }).filter((file) => {
    if (!file.endsWith(".md")) {
      return false;
    }
    if (path.basename(file) === "README.md") {
      return false;
    }
    const parts = relativeParts(file);
    if (parts.includes("assets")) {
      return false;
    }
    return true;
  });
}

export function loadAllDocs(): { docs: Doc[]; errors: string[] } {
  const docs: Doc[] = [];
  const errors: string[] = [];
  if (state.mode !== "single") {
    return { docs, errors };
  }
  for (const file of docPaths()) {
    try {
      const { meta, body, raw } = readDocument(file);
      docs.push(
        new Doc(file, relpath(file), meta, body, raw, state.projectId),
      );
    } catch (error) {
      errors.push(`${relpath(file)}: ${(error as Error).message}`);
    }
  }
  return { docs, errors };
}

export function ensureType(value: string): DocType {
  if (!(TYPES as readonly string[]).includes(value)) {
    throw new UsageError(
      `invalid type: ${value} (expected one of: ${TYPES.join(", ")})`,
    );
  }
  return value as DocType;
}

export function ensureStatus(
  value: string,
  docType?: DocType,
): string {
  if (docType) {
    const allowed = TYPE_STATUSES[docType];
    if (!allowed.some((item) => item === value)) {
      throw new UsageError(
        `invalid status for ${docType}: ${value} (expected one of: ${allowed.join(", ")})`,
      );
    }
    return value;
  }
  if (!STATUS_SET.has(value)) {
    throw new UsageError(
      `invalid status: ${value} (expected one of: ${STATUS_LIST})`,
    );
  }
  return value;
}

const STATUS_SET = new Set<string>(STATUSES);
const STATUS_LIST = STATUSES.join(", ");

export function findDoc(docs: readonly Doc[], docId: string): Doc {
  const candidate = docId.trim();
  for (const doc of docs) {
    if (doc.id === candidate) {
      return doc;
    }
  }
  const upper = candidate.toUpperCase();
  for (const doc of docs) {
    if (doc.id === upper) {
      return doc;
    }
  }
  throw new UsageError(`unknown document: ${docId}`);
}

export function nextId(
  docs: readonly Doc[],
  prefix: string,
  kind: string,
): string {
  let highest = 0;
  const pattern = new RegExp(
    `^${escapeRegExp(prefix)}-${escapeRegExp(kind)}-(\\d+)$`,
  );
  for (const doc of docs) {
    const match = pattern.exec(doc.id);
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }
  return `${prefix}-${kind}-${String(highest + 1).padStart(3, "0")}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
