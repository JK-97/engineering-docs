import { writeFileSync } from "node:fs";

import { SUPERSEDE_ALLOWED } from "../constants";
import { findDoc, loadAllDocs } from "../documents";
import { DocsError, UsageError } from "../errors";
import { relationList, renderDocument, renderRelation, todayISO } from "../util";
import type { ArchiveArgs } from "./types";

/** Mark a document superseded and write reciprocal supersession links. */
export function cmdArchive(args: ArchiveArgs): number {
  const { docs, errors } = loadAllDocs();
  if (errors.length > 0) {
    throw new DocsError(errors[0]);
  }
  const doc = findDoc(docs, args.id);
  const replacement = findDoc(docs, args.by);
  if (doc.id === replacement.id) {
    throw new UsageError("a document cannot supersede itself");
  }
  const docType = String(doc.meta.type ?? "");
  const replacementType = String(replacement.meta.type ?? "");
  if (!(docType in SUPERSEDE_ALLOWED)) {
    throw new UsageError(
      `${doc.id}: type ${docType} does not support superseded status`,
    );
  }
  const allowed = SUPERSEDE_ALLOWED[docType];
  if (!allowed.has(replacementType)) {
    throw new UsageError(
      `${doc.id}: a ${docType} document cannot be superseded by ${replacementType}`,
    );
  }

  const existing = relationList(doc.meta.superseded_by) ?? [];
  if (existing.length > 0 && !(existing.length === 1 && existing[0] === replacement.id)) {
    throw new DocsError(
      `${doc.id} is already superseded by ${existing.join(", ")}`,
    );
  }
  if ((relationList(replacement.meta.superseded_by) ?? []).includes(doc.id)) {
    throw new DocsError("archiving would create a supersession cycle");
  }

  const graph = new Map<string, string[]>();
  for (const item of docs) {
    if (item.id) {
      graph.set(item.id, relationList(item.meta.superseded_by) ?? []);
    }
  }
  graph.set(doc.id, [...(graph.get(doc.id) ?? []), replacement.id]);
  const reaches = (start: string, target: string, seen: Set<string>): boolean => {
    if (start === target) return true;
    if (seen.has(start)) return false;
    seen.add(start);
    for (const child of graph.get(start) ?? []) {
      if (reaches(child, target, seen)) return true;
    }
    return false;
  };
  if (reaches(replacement.id, doc.id, new Set())) {
    throw new DocsError("archiving would create a supersession cycle");
  }

  const today = todayISO();
  let changed = false;
  if (doc.meta.status !== "superseded") {
    doc.meta.status = "superseded";
    changed = true;
  }
  if (!((relationList(doc.meta.superseded_by) ?? []).length === 1 &&
        (relationList(doc.meta.superseded_by) ?? [])[0] === replacement.id)) {
    doc.meta.superseded_by = renderRelation([replacement.id]);
    doc.meta.updated = today;
    changed = true;
  }
  const supersedes = relationList(replacement.meta.supersedes) ?? [];
  if (!supersedes.includes(doc.id)) {
    supersedes.push(doc.id);
    supersedes.sort();
    replacement.meta.supersedes = renderRelation(supersedes);
    replacement.meta.updated = today;
    changed = true;
  }

  if (changed) {
    writeFileSync(doc.path, renderDocument(doc.meta, doc.body), "utf8");
    writeFileSync(
      replacement.path,
      renderDocument(replacement.meta, replacement.body),
      "utf8",
    );
    process.stdout.write(`Archived ${doc.id} as superseded by ${replacement.id}\n`);
  } else {
    process.stdout.write(`${doc.id} is already superseded by ${replacement.id}\n`);
  }
  return 0;
}
