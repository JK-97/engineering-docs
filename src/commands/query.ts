import { readFileSync } from "node:fs";
import path from "node:path";

import type { DocType } from "../constants";
import { loadProjectProfile, projectOwner, projectPrefix } from "../config";
import {
  type Doc,
  ensureStatus,
  ensureType,
  findDoc,
  loadAllDocs,
} from "../documents";
import { UsageError } from "../errors";
import { state } from "../state";
import {
  isFile,
  isoDate,
  jsonable,
  parseDate,
  relpath,
  todayISO,
  tsv,
  warn,
} from "../util";
import type { ListArgs, RootArgs, SearchArgs, ShowArgs, StaleArgs } from "./types";

/** Print docs-root context: README, project facts, and active/recent documents. */
export function cmdContext(_args: RootArgs): number {
  const profile = loadProjectProfile();
  const projectId = state.projectId;
  const readme = path.join(state.root, "README.md");
  if (isFile(readme)) {
    try {
      process.stdout.write(`${readFileSync(readme, "utf8").replace(/\s+$/, "")}\n`);
    } catch (error) {
      warn((error as Error).message);
      process.stdout.write(`# ${projectId}\n`);
    }
  } else {
    warn(`${relpath(readme)} is missing`);
    process.stdout.write(`# ${projectId}\n`);
  }
  process.stdout.write("\n## Active context\n\n");
  process.stdout.write(`Project: ${projectId} (${projectPrefix(projectId, profile)})\n`);
  process.stdout.write(`Owner: ${projectOwner(profile)}\n`);
  const summary = profile.summary;
  if (typeof summary === "string" && summary.trim()) {
    process.stdout.write(`Summary: ${summary.trim()}\n`);
  }
  process.stdout.write("\n");

  const { docs, errors } = loadAllDocs();
  for (const message of errors) {
    warn(message);
  }

  const emit = (doc: Doc): void => {
    process.stdout.write(
      `- ${doc.id} [${String(doc.meta.status ?? "")}] ${String(doc.meta.title ?? "")} - ${String(doc.meta.summary ?? "")} (${doc.rel})\n`,
    );
  };
  const sections: Array<[string, DocType, string[]]> = [
    ["Active designs", "design", ["active"]],
    ["Accepted decisions", "decision", ["accepted"]],
    ["Open proposals", "proposal", ["active", "deferred"]],
  ];
  for (const [heading, docType, statuses] of sections) {
    process.stdout.write(`### ${heading}\n`);
    const selected = docs
      .filter(
        (doc) =>
          doc.meta.type === docType &&
          statuses.includes(String(doc.meta.status ?? "")),
      )
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    if (selected.length === 0) {
      process.stdout.write("- (none)\n");
    }
    for (const doc of selected) {
      emit(doc);
    }
    process.stdout.write("\n");
  }

  const dateKey = (doc: Doc): string => {
    for (const key of ["completed", "created", "updated"]) {
      const value = isoDate(doc.meta[key]);
      if (value) {
        return value;
      }
    }
    return "";
  };
  const sortRecent = (left: Doc, right: Doc): number => {
    const leftKey = dateKey(left);
    const rightKey = dateKey(right);
    if (leftKey !== rightKey) {
      return leftKey < rightKey ? 1 : -1;
    }
    if (left.id !== right.id) {
      return left.id < right.id ? 1 : -1;
    }
    return 0;
  };

  process.stdout.write("### Recent records\n");
  const records = docs
    .filter((doc) => doc.meta.type === "record" && doc.meta.status === "implemented")
    .sort(sortRecent);
  if (records.length === 0) {
    process.stdout.write("- (none)\n");
  }
  for (const doc of records.slice(0, 5)) {
    emit(doc);
  }
  process.stdout.write("\n");

  process.stdout.write("### Latest reports\n");
  const reports = docs
    .filter((doc) => doc.meta.type === "report" && doc.meta.status === "reference")
    .sort(sortRecent);
  if (reports.length === 0) {
    process.stdout.write("- (none)\n");
  }
  for (const doc of reports.slice(0, 3)) {
    emit(doc);
  }
  return 0;
}

/** List documents as TSV, optionally filtered by type and status. */
export function cmdList(args: ListArgs): number {
  if (args.type) {
    ensureType(args.type);
  }
  if (args.status) {
    ensureStatus(args.status, args.type as DocType | undefined);
  }
  const { docs, errors } = loadAllDocs();
  for (const message of errors) {
    warn(message);
  }
  const selected = docs
    .filter((doc) => !args.type || doc.meta.type === args.type)
    .filter((doc) => !args.status || doc.meta.status === args.status)
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  if (selected.length === 0) {
    process.stdout.write("No documents.\n");
    return 0;
  }
  process.stdout.write("ID\tTYPE\tSTATUS\tPATH\tTITLE\n");
  for (const doc of selected) {
    process.stdout.write(
      [
        tsv(doc.id),
        tsv(doc.meta.type ?? ""),
        tsv(doc.meta.status ?? ""),
        tsv(doc.rel),
        tsv(doc.meta.title ?? ""),
      ].join("\t") + "\n",
    );
  }
  return 0;
}

/** Search metadata and body text, printing at most three body hits per doc. */
export function cmdSearch(args: SearchArgs): number {
  const query = args.query.trim();
  if (!query) {
    throw new UsageError("search query must not be empty");
  }
  if (args.limit !== undefined && args.limit < 1) {
    throw new UsageError("--limit must be a positive integer");
  }
  const needle = query.toLowerCase();
  const { docs, errors } = loadAllDocs();
  for (const message of errors) {
    warn(message);
  }
  let matches = 0;
  for (const doc of [...docs].sort((left, right) => (left.id < right.id ? -1 : 1))) {
    if (args.limit !== undefined && matches >= args.limit) {
      break;
    }
    const lines = doc.body.split(/\r?\n/);
    const bodyHits: Array<[number, string]> = [];
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(needle)) {
        bodyHits.push([index + 1, line.trim()]);
      }
    });
    const metaText = JSON.stringify(jsonable(doc.meta)) ?? "";
    if (!metaText.toLowerCase().includes(needle) && bodyHits.length === 0) {
      continue;
    }
    matches += 1;
    process.stdout.write(
      `${doc.id}\t${String(doc.meta.type ?? "")}\t${String(doc.meta.status ?? "")}\t${doc.rel}\n`,
    );
    if (metaText.toLowerCase().includes(needle) && bodyHits.length === 0) {
      process.stdout.write(`    title: ${String(doc.meta.title ?? "")}\n`);
    }
    for (const [number, line] of bodyHits.slice(0, 3)) {
      const clipped = line.length > 180 ? `${line.slice(0, 177)}...` : line;
      process.stdout.write(`    ${number}: ${clipped}\n`);
    }
  }
  if (matches === 0) {
    process.stdout.write("No matches.\n");
  }
  return 0;
}

/** Print one document's path and raw content. */
export function cmdShow(args: ShowArgs): number {
  const { docs, errors } = loadAllDocs();
  for (const message of errors) {
    warn(message);
  }
  const doc = findDoc(docs, args.id);
  process.stdout.write(`path: ${doc.rel}\n\n`);
  process.stdout.write(`${doc.raw.replace(/\n+$/, "")}\n`);
  return 0;
}

/** List documents whose non-null last_verified date is older than the cutoff. */
export function cmdStale(args: StaleArgs): number {
  const days = args.days ?? 90;
  if (days < 0) {
    throw new UsageError("--days must not be negative");
  }
  const { docs, errors } = loadAllDocs();
  for (const message of errors) {
    warn(message);
  }
  const today = parseDate(todayISO()) as Date;
  const rows: Array<[string, string, number, string]> = [];
  for (const doc of docs) {
    if (doc.meta.status === "superseded") {
      continue;
    }
    const verified = parseDate(doc.meta.last_verified);
    if (!verified) {
      continue;
    }
    const age = Math.floor((today.getTime() - verified.getTime()) / 86_400_000);
    if (age > days) {
      rows.push([verified.toISOString().slice(0, 10), doc.id, age, doc.rel]);
    }
  }
  if (rows.length === 0) {
    process.stdout.write("No stale documents.\n");
    return 0;
  }
  rows.sort((left, right) => {
    if (left[0] !== right[0]) return left[0] < right[0] ? -1 : 1;
    if (left[1] !== right[1]) return left[1] < right[1] ? -1 : 1;
    if (left[2] !== right[2]) return left[2] - right[2];
    return left[3] < right[3] ? -1 : left[3] > right[3] ? 1 : 0;
  });
  process.stdout.write("ID\tLAST_VERIFIED\tDAYS\tPATH\n");
  for (const [verified, docId, age, docPath] of rows) {
    process.stdout.write(`${docId}\t${verified}\t${age}\t${docPath}\n`);
  }
  return 0;
}
