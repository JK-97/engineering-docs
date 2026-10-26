import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import * as yaml from "yaml";

import { FM_RE, PROGRAM_NAME, TYPE_KEYS } from "./constants";
import { DocsError } from "./errors";
import { state } from "./state";

export function err(message: string): void {
  process.stderr.write(`${PROGRAM_NAME}: error: ${message}\n`);
}

export function warn(message: string): void {
  process.stderr.write(`${PROGRAM_NAME}: warning: ${message}\n`);
}

export function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

export function resolveRoot(override?: string | null): string {
  return path.resolve(expandHome(override || process.env.DOCS_ROOT || "."));
}

export function relpath(target: string, base: string = state.root): string {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  if (relative === "") {
    return ".";
  }
  return relative.split(path.sep).join("/");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local ISO date. */
export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

/** Parse a date-only value. Unknown or datetime strings return null. */
export function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) {
      return null;
    }
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() !== year ||
      parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day
    ) {
      return null;
    }
    return parsed;
  }
  return null;
}

export function isoDate(value: unknown): string | null {
  const parsed = parseDate(value);
  return parsed ? parsed.toISOString().slice(0, 10) : null;
}

export function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function jsonable(value: unknown): unknown {
  if (value instanceof Date) {
    if (
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0
    ) {
      return value.toISOString().slice(0, 10);
    }
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(jsonable);
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[String(key)] = jsonable(item);
    }
    return result;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return String(value);
  }
  return value;
}

export function slugify(text: string): string {
  const ascii = text
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .toLowerCase();
  const slug = ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.replace(/-{2,}/g, "-");
}

export function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

export function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function relationList(value: unknown): string[] | null {
  if (value === null || value === undefined || value === "") {
    return [];
  }
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return [...value];
  }
  return null;
}

export function renderRelation(value: string[]): string | string[] | null {
  if (value.length === 0) {
    return null;
  }
  if (value.length === 1) {
    return value[0];
  }
  return [...value];
}

export function commitList(value: unknown): string[] | null {
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item === "boolean") {
      return null;
    }
    if (typeof item === "number") {
      result.push(String(item));
    } else if (typeof item === "string") {
      result.push(item);
    } else {
      return null;
    }
  }
  return result;
}

export function unique<T>(values: T[]): boolean {
  return new Set(values).size === values.length;
}

export function tsv(value: unknown): string {
  return String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
}

export function mdText(value: unknown): string {
  const text = String(value ?? "")
    .replace(/\n/g, " ")
    .replace(/\r/g, " ");
  return text.replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}

export interface SplitFrontMatter {
  front: string | null;
  body: string;
}

export function splitFrontMatter(text: string): SplitFrontMatter {
  let source = text;
  if (source.charCodeAt(0) === 0xfeff) {
    source = source.slice(1);
  }
  const match = source.match(FM_RE);
  if (!match) {
    return { front: null, body: source };
  }
  return { front: match[1], body: source.slice(match[0].length) };
}

export interface ParsedDocument {
  meta: Record<string, unknown>;
  body: string;
  raw: string;
}

export function readDocument(file: string): ParsedDocument {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    throw new DocsError(`cannot read file: ${(error as Error).message}`);
  }
  const { front, body } = splitFrontMatter(raw);
  if (front === null) {
    throw new DocsError("missing YAML front matter");
  }
  let parsed: unknown;
  try {
    parsed = yaml.parse(front);
  } catch (error) {
    const detail = String((error as Error).message).replace(/\n/g, " ");
    throw new DocsError(`invalid YAML front matter: ${detail}`);
  }
  if (parsed === null || parsed === undefined) {
    parsed = {};
  }
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DocsError("front matter must be a YAML mapping");
  }
  return { meta: parsed as Record<string, unknown>, body, raw };
}

const FRONT_MATTER_ORDER = [
  "id",
  "project",
  "type",
  "status",
  "title",
  "summary",
  "created",
  "created_source",
  "completed",
  "completed_source",
  "updated",
  "last_verified",
  "owner",
  "related",
  "supersedes",
  "superseded_by",
];

export function stringifyFrontMatter(meta: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = {};
  for (const key of FRONT_MATTER_ORDER) {
    if (Object.prototype.hasOwnProperty.call(meta, key)) {
      ordered[key] = meta[key];
    }
  }
  const docType = meta.type;
  if (typeof docType === "string" && docType in TYPE_KEYS) {
    for (const key of TYPE_KEYS[docType as keyof typeof TYPE_KEYS]) {
      if (Object.prototype.hasOwnProperty.call(meta, key)) {
        ordered[key] = meta[key];
      }
    }
    if (docType === "design" && Object.prototype.hasOwnProperty.call(meta, "children")) {
      ordered.children = meta.children;
    }
  }
  for (const [key, value] of Object.entries(meta)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
      ordered[key] = value;
    }
  }
  return yaml
    .stringify(ordered, {
      lineWidth: 0,
      defaultStringType: "PLAIN",
      defaultKeyType: "PLAIN",
      singleQuote: true,
      indentSeq: false,
      nullStr: "null",
      trueStr: "true",
      falseStr: "false",
    })
    .replace(/^(created|completed|updated|last_verified): (\d{4}-\d{2}-\d{2})$/gm, "$1: '$2'")
    .replace(/\n$/, "");
}

export function renderDocument(
  meta: Record<string, unknown>,
  body: string,
): string {
  const front = stringifyFrontMatter(meta);
  const cleanBody = body.replace(/^\n+|\n+$/g, "");
  if (cleanBody) {
    return `---\n${front}\n---\n\n${cleanBody}\n`;
  }
  return `---\n${front}\n---\n`;
}

export function writeNewFile(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  try {
    writeFileSync(file, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new DocsError(`refusing to overwrite ${relpath(file)}`);
    }
    throw error;
  }
}

export function isDirectory(target: string): boolean {
  try {
    return statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(target: string): boolean {
  try {
    return statSync(target).isFile();
  } catch {
    return false;
  }
}

export function anyEntries(directory: string): boolean {
  try {
    return readdirSync(directory).length > 0;
  } catch {
    return false;
  }
}

/**
 * Recursively collect files below a directory.
 *
 * `skipHidden` drops any hidden directory or file; `skipDirs` drops named
 * directories at any depth.
 */
export function walkFiles(
  root: string,
  options: { skipHidden?: boolean; skipDirs?: Set<string> } = {},
): string[] {
  const output: string[] = [];
  const visit = (directory: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
    for (const entry of entries) {
      if (options.skipHidden && entry.name.startsWith(".")) {
        continue;
      }
      if (entry.isDirectory()) {
        if (options.skipDirs?.has(entry.name)) {
          continue;
        }
        visit(path.join(directory, entry.name));
      } else if (entry.isFile()) {
        output.push(path.join(directory, entry.name));
      }
    }
  };
  visit(root);
  return output.sort();
}
