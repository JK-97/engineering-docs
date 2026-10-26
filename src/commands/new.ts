import { existsSync } from "node:fs";
import path from "node:path";

import {
  DEFAULT_SUBDIR,
  SLUG_RE,
  TYPE_PREFIX,
} from "../constants";
import {
  loadProjectProfile,
  projectOwner,
  projectPrefix,
  projectTitle,
} from "../config";
import { ensureStatus, ensureType, loadAllDocs, nextId } from "../documents";
import { DocsError, UsageError } from "../errors";
import { state } from "../state";
import {
  defaultSpecialFields,
  ensureRecordSections,
  splitValues,
  templateBody,
} from "../templates";
import { relpath, renderDocument, slugify, todayISO, writeNewFile } from "../util";
import type { NewArgs } from "./types";

/** Allocate an ID and render a document from the package template. */
export function cmdNew(args: NewArgs): number {
  const docType = ensureType(args.type);
  const status = ensureStatus(args.status, docType);
  const title = (args.title ?? "").trim();
  if (!title) {
    throw new UsageError("--title is required and must not be empty");
  }
  if (args.parent && docType !== "design") {
    throw new UsageError("--parent only applies to design documents");
  }
  if ((args.issue || args.activationTrigger) && docType !== "proposal") {
    throw new UsageError("--issue/--activation-trigger only apply to proposals");
  }
  if (args.design && docType !== "proposal") {
    throw new UsageError("--design only applies to proposals");
  }
  if (args.commit && args.commit.length > 0 && docType !== "record") {
    throw new UsageError("--commit only applies to records");
  }
  if (
    docType === "proposal" &&
    status === "deferred" &&
    !(args.activationTrigger ?? "").trim()
  ) {
    throw new UsageError("deferred proposals require --activation-trigger");
  }

  const profile = loadProjectProfile();
  const projectId = state.projectId;
  const prefix = projectPrefix(projectId, profile);
  const { docs, errors } = loadAllDocs();
  if (errors.length > 0) {
    throw new DocsError(errors[0]);
  }

  let slug = (args.slug ?? "").trim();
  if (!slug) {
    slug = slugify(title);
  }
  if (!slug) {
    slug = nextId(docs, prefix, TYPE_PREFIX[docType])
      .split("-")
      .slice(1)
      .join("-")
      .toLowerCase();
  }
  if (!SLUG_RE.test(slug)) {
    throw new UsageError(`invalid slug: ${slug} (use lowercase ASCII kebab-case)`);
  }

  const docId = nextId(docs, prefix, TYPE_PREFIX[docType]);
  const destination = path.join(
    state.root,
    DEFAULT_SUBDIR[docType],
    `${slug}.md`,
  );
  if (existsSync(destination)) {
    throw new DocsError(`refusing to overwrite ${relpath(destination)}`);
  }

  const commits: string[] = [];
  for (const value of args.commit ?? []) {
    for (const item of splitValues(value)) {
      if (!commits.includes(item)) {
        commits.push(item);
      }
    }
  }
  const related = splitValues(args.related);
  const owner = (args.owner ?? "").trim() || projectOwner(profile);
  const summary = (args.summary ?? "").trim() || "TODO: one-sentence summary";
  const todayText = todayISO();

  const special = defaultSpecialFields(docType);
  if (docType === "design") {
    if (args.parent) {
      special.parent = args.parent.trim();
    }
  } else if (docType === "proposal") {
    if (args.issue) {
      const issueValue = args.issue.trim();
      special.issue = /^\d+$/.test(issueValue) ? Number(issueValue) : issueValue;
    }
    if (args.design) {
      special.design = args.design.trim();
    }
    if (args.activationTrigger) {
      special.activation_trigger = args.activationTrigger.trim();
    }
  } else if (docType === "record") {
    special.commits = commits;
  }

  const meta: Record<string, unknown> = {
    id: docId,
    project: projectId,
    type: docType,
    status,
    title,
    summary,
    created: todayText,
    created_source: "engineering-docs new",
    completed: null,
    completed_source: null,
    updated: todayText,
    last_verified: null,
    owner,
    related,
    supersedes: null,
    superseded_by: null,
    ...special,
  };

  const values: Record<string, string> = {
    id: docId,
    project: projectId,
    project_name: projectTitle(projectId, profile),
    prefix,
    type: docType,
    status,
    title,
    summary,
    owner,
    date: todayText,
    created: todayText,
    updated: todayText,
    slug,
    commit: commits[0] ?? "",
    commits: commits.length > 0 ? commits.map((item) => `- \`${item}\``).join("\n") : "TBD",
    design: String(special.design ?? ""),
    parent: String(special.parent ?? ""),
    issue: String(special.issue ?? ""),
    activation_trigger: String(special.activation_trigger ?? ""),
  };
  let body = templateBody(docType, values);
  if (docType === "record") {
    body = ensureRecordSections(body, commits);
  }

  writeNewFile(destination, renderDocument(meta, body));
  process.stdout.write(`Created ${docId} at ${relpath(destination)}\n`);
  return 0;
}
