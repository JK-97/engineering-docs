import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  COMMON_KEYS,
  DATE_KEYS,
  DATE_SOURCE_KEYS,
  DEFAULT_SUBDIR,
  FORBIDDEN_DIRS,
  FORBIDDEN_FILES,
  FRAMEWORK_VERSION,
  ID_RE,
  LINK_RE,
  PROJECT_SLUG_RE,
  PROJECT_STATUSES,
  SCHEME_RE,
  SEMVER_RE,
  SHA_RE,
  STALE_DAYS,
  STATUSES,
  SUPERSEDE_ALLOWED,
  TYPES,
  TYPE_KEYS,
  TYPE_PREFIX,
  TYPE_STATUSES,
  type DocType,
} from "./constants";
import { buildCatalog, buildLlms, indexIssues } from "./catalog";
import { loadProjectProfile, projectPrefix } from "./config";
import { type Doc, loadAllDocs } from "./documents";
import { state } from "./state";
import {
  commitList,
  err,
  isStringList,
  isText,
  parseDate,
  relationList,
  relpath,
  splitFrontMatter,
  todayISO,
  unique,
  warn,
  walkFiles,
} from "./util";

const has = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

function collectForbidden(): string[] {
  const found = new Set<string>();
  const visit = (directory: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if ([".git", ".venv", "node_modules", "bin"].includes(entry.name)) {
          continue;
        }
        const lowered = entry.name.toLowerCase();
        if (
          FORBIDDEN_DIRS.has(lowered)
        ) {
          found.add(`${relpath(full)}/`);
          continue;
        }
        visit(full);
      } else if (entry.isFile()) {
        const lowered = entry.name.toLowerCase();
        if (FORBIDDEN_FILES.has(lowered) || lowered.endsWith(".bak")) {
          found.add(relpath(full));
        }
      }
    }
  };
  visit(state.root);
  return [...found].sort();
}

function validateProfile(
  projectId: string,
  profile: Record<string, unknown>,
  profilePath: string,
  errors: string[],
  warnings: string[],
): void {
  const relative = relpath(profilePath);
  for (const key of ["id", "slug"]) {
    const value = profile[key];
    if (value !== null && value !== undefined && value !== "" && value !== projectId) {
      errors.push(`${relative}: ${key} must match project id ${projectId}`);
    }
  }
  if (!isText(profile.id) && !isText(profile.slug)) {
    warnings.push(`${relative}: missing id key`);
  }
  const standardVersion = profile.standard_version;
  if (standardVersion === null || standardVersion === undefined) {
    warnings.push(`${relative}: missing standard_version`);
  } else if (
    typeof standardVersion !== "string" ||
    !SEMVER_RE.test(standardVersion.trim())
  ) {
    errors.push(
      `${relative}: standard_version must be a semantic version such as 1.0.0`,
    );
  } else if (standardVersion.trim() !== FRAMEWORK_VERSION) {
    warnings.push(
      `${relative}: standard_version ${standardVersion.trim()} differs from CLI version ${FRAMEWORK_VERSION}`,
    );
  }
  const prefix = profile.prefix;
  if (prefix === null || prefix === undefined) {
    errors.push(`${relative}: missing prefix`);
  } else if (typeof prefix !== "string" || !/^[A-Z][A-Z0-9]{1,5}$/.test(prefix)) {
    errors.push(
      `${relative}: prefix must be 2-6 uppercase letters/digits, starting with a letter`,
    );
  }
  if (!isText(profile.title) && !isText(profile.name)) {
    warnings.push(`${relative}: missing name key`);
  }
  if (!isText(profile.summary)) {
    warnings.push(`${relative}: missing summary`);
  }
  const status = profile.status;
  if (status === null || status === undefined) {
    warnings.push(`${relative}: missing status`);
  } else if (typeof status !== "string" || !status.trim()) {
    errors.push(`${relative}: status must be a non-empty string`);
  } else if (!(PROJECT_STATUSES as readonly string[]).includes(status)) {
    warnings.push(
      `${relative}: project status ${status} is not one of: ${PROJECT_STATUSES.join(", ")}`,
    );
  }
  if (!isText(profile.owner)) {
    warnings.push(`${relative}: missing owner`);
  }
  for (const key of ["created", "updated"]) {
    if (has(profile, key) && profile[key] !== null && profile[key] !== "") {
      if (parseDate(profile[key]) === null) {
        errors.push(`${relative}: ${key} must be YYYY-MM-DD or null`);
      }
    }
  }
}

function validateBasic(
  doc: Doc,
  byId: Map<string, Doc>,
  prefix: string,
  errors: string[],
  warnings: string[],
): void {
  const meta = doc.meta;
  for (const key of COMMON_KEYS) {
    if (!has(meta, key)) {
      errors.push(`${doc.rel}: missing front matter key: ${key}`);
    }
  }

  let docType = meta.type;
  if (typeof docType !== "string" || !(TYPES as readonly string[]).includes(docType)) {
    errors.push(
      `${doc.rel}: invalid type: ${docType} (expected one of: ${TYPES.join(", ")})`,
    );
    docType = null;
  }
  const status = meta.status;
  if (
    typeof status !== "string" ||
    !(STATUSES as readonly string[]).includes(status)
  ) {
    errors.push(
      `${doc.rel}: invalid status: ${status} (expected one of: ${STATUSES.join(", ")})`,
    );
  } else if (
    docType &&
    !(TYPE_STATUSES[docType as DocType] as readonly string[]).includes(status)
  ) {
    errors.push(
      `${doc.rel}: status ${status} is not valid for ${docType} (expected one of: ${TYPE_STATUSES[
        docType as DocType
      ].join(", ")})`,
    );
  }

  if (meta.project !== doc.project) {
    errors.push(`${doc.rel}: front matter project must be ${doc.project}`);
  }

  const docId = doc.id;
  if (!docId) {
    errors.push(`${doc.rel}: missing or non-string id`);
  } else {
    const idMatch = ID_RE.exec(docId);
    if (!idMatch) {
      errors.push(`${doc.rel}: invalid id format: ${docId}`);
    } else {
      const number = idMatch.groups?.num ?? "";
      if (/^0+$/.test(number)) {
        errors.push(
          `${doc.rel}: id number ${number} is reserved; real documents start at 001`,
        );
      }
      if (docType && idMatch.groups?.kind !== TYPE_PREFIX[docType as DocType]) {
        errors.push(
          `${doc.rel}: id kind ${idMatch.groups?.kind} does not match type ${docType}`,
        );
      }
      if (prefix && idMatch.groups?.prefix !== prefix) {
        errors.push(`${doc.rel}: id must start with ${prefix}-`);
      }
    }
    const existing = byId.get(docId);
    if (existing && existing !== doc) {
      errors.push(
        `${doc.rel}: duplicate id ${docId} (also in ${existing.rel})`,
      );
    }
  }

  if (!isText(meta.title)) {
    errors.push(`${doc.rel}: title must be a non-empty string`);
  }
  if (!isText(meta.summary)) {
    errors.push(`${doc.rel}: summary must be a non-empty string`);
  }
  if (!isText(meta.owner)) {
    errors.push(`${doc.rel}: owner must be a non-empty string`);
  }

  const related = relationList(meta.related);
  if (related === null) {
    errors.push(`${doc.rel}: related must be an id, a list of ids, or null`);
  } else if (!unique(related)) {
    errors.push(`${doc.rel}: related contains duplicate entries`);
  } else {
    for (const relatedId of related) {
      if (!ID_RE.test(relatedId)) {
        errors.push(`${doc.rel}: related contains an invalid id: ${relatedId}`);
      } else if (!byId.has(relatedId)) {
        errors.push(`${doc.rel}: related id does not exist: ${relatedId}`);
      }
    }
  }
  for (const key of ["supersedes", "superseded_by"]) {
    const links = relationList(meta[key]);
    if (links === null) {
      errors.push(`${doc.rel}: ${key} must be an id, a list of ids, or null`);
    } else if (!unique(links)) {
      errors.push(`${doc.rel}: ${key} contains duplicate entries`);
    } else {
      for (const linkId of links) {
        if (!ID_RE.test(linkId)) {
          errors.push(`${doc.rel}: ${key} contains an invalid id: ${linkId}`);
        }
      }
    }
  }

  const parsedDates = new Map<string, Date | null>();
  for (const key of DATE_KEYS) {
    if (!has(meta, key)) {
      continue;
    }
    const raw = meta[key];
    if (raw === null || raw === undefined || raw === "") {
      parsedDates.set(key, null);
      continue;
    }
    const parsed = parseDate(raw);
    if (parsed === null) {
      errors.push(`${doc.rel}: ${key} must be YYYY-MM-DD or null`);
      parsedDates.set(key, null);
    } else {
      parsedDates.set(key, parsed);
    }
  }

  for (const [dateKey, sourceKey] of Object.entries(DATE_SOURCE_KEYS)) {
    const rawSource = meta[sourceKey];
    const hasSource = isText(rawSource);
    if (has(meta, sourceKey) && rawSource !== null && rawSource !== "" && !hasSource) {
      errors.push(`${doc.rel}: ${sourceKey} must be a non-empty string or null`);
    }
    if (parsedDates.get(dateKey) && !hasSource) {
      warnings.push(`${doc.rel}: ${dateKey} is set but ${sourceKey} is missing or null`);
    }
    if (hasSource && !parsedDates.get(dateKey)) {
      warnings.push(`${doc.rel}: ${sourceKey} is set but ${dateKey} is null`);
    }
  }

  const created = parsedDates.get("created");
  const completed = parsedDates.get("completed");
  const updated = parsedDates.get("updated");
  const verified = parsedDates.get("last_verified");
  if (created && updated && updated.getTime() < created.getTime()) {
    errors.push(`${doc.rel}: updated is before created`);
  }
  // A record is often written after the change it documents, so completed may
  // legitimately be earlier than the document's created date.
  if (updated && verified && verified.getTime() > updated.getTime()) {
    warnings.push(`${doc.rel}: last_verified is after updated`);
  }
  const today = parseDate(todayISO()) as Date;
  if (created && created.getTime() > today.getTime()) {
    warnings.push(`${doc.rel}: created is in the future`);
  }
  if (completed && completed.getTime() > today.getTime()) {
    warnings.push(`${doc.rel}: completed is in the future`);
  }
  if (verified && verified.getTime() > today.getTime()) {
    warnings.push(`${doc.rel}: last_verified is in the future`);
  }

  if (status !== "superseded" && verified) {
    const age = Math.floor((today.getTime() - verified.getTime()) / 86_400_000);
    if (age > STALE_DAYS) {
      warnings.push(
        `${doc.rel}: stale (last_verified ${verified.toISOString().slice(0, 10)}, ${age} days)`,
      );
    }
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path.basename(doc.path, ".md"))) {
    errors.push(`${doc.rel}: filename must be lowercase ASCII kebab-case`);
  }

  if (docType) {
    const expected = DEFAULT_SUBDIR[docType as DocType];
    if (expected) {
      const parts = doc.rel.split("/");
      if (parts.length < 2 || parts[0] !== expected) {
        errors.push(
          `${doc.rel}: ${docType} documents must live under ${expected}/`,
        );
      }
    }
  }

  if (!doc.body.trim()) {
    warnings.push(`${doc.rel}: body is empty`);
  }

  for (const legacy of ["commit", "plan", "items", "idea"]) {
    if (has(meta, legacy)) {
      warnings.push(`${doc.rel}: legacy field ${legacy} is not part of the v2 model`);
    }
  }
  if (has(meta, "children") && docType !== "design") {
    warnings.push(`${doc.rel}: children only applies to designs`);
  }
}

function checkList(
  doc: Doc,
  key: string,
  errors: string[],
  warnings: string[],
  allowEmpty = true,
): string[] {
  const value = doc.meta[key];
  if (!isStringList(value)) {
    errors.push(`${doc.rel}: ${key} must be a list of strings`);
    return [];
  }
  if (!unique(value)) {
    errors.push(`${doc.rel}: ${key} contains duplicate entries`);
  }
  if (value.length === 0 && !allowEmpty) {
    warnings.push(`${doc.rel}: ${key} is empty`);
  }
  return [...value];
}

function checkOptionalId(
  doc: Doc,
  key: string,
  kind: string,
  byId: Map<string, Doc>,
  errors: string[],
): string | null {
  const value = doc.meta[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (value === "") {
    errors.push(`${doc.rel}: ${key} must be an id or null`);
    return null;
  }
  if (typeof value !== "string") {
    errors.push(`${doc.rel}: ${key} must be an id or null`);
    return null;
  }
  const match = ID_RE.exec(value);
  if (!match || match.groups?.kind !== kind) {
    errors.push(`${doc.rel}: ${key} must be a ${kind} id or null`);
    return null;
  }
  const target = byId.get(value);
  if (!target) {
    errors.push(`${doc.rel}: ${key} target does not exist: ${value}`);
  } else {
    const expectedType = kind === "DES" ? "design" : kind === "PROP" ? "proposal" : undefined;
    if (expectedType && target.meta.type !== expectedType) {
      errors.push(
        `${doc.rel}: ${key} target is not a ${expectedType}: ${value}`,
      );
    }
  }
  return value;
}

function checkDesign(
  doc: Doc,
  byId: Map<string, Doc>,
  docs: readonly Doc[],
  errors: string[],
  warnings: string[],
): void {
  const meta = doc.meta;
  const parent = meta.parent;
  if (parent !== null && parent !== undefined) {
    if (typeof parent !== "string" || !parent) {
      errors.push(`${doc.rel}: parent must be a design id or null`);
    } else if (parent === doc.id) {
      errors.push(`${doc.rel}: design cannot be its own parent`);
    } else {
      const target = byId.get(parent);
      if (!target) {
        errors.push(`${doc.rel}: parent design does not exist: ${parent}`);
      } else if (target.meta.type !== "design") {
        errors.push(`${doc.rel}: parent is not a design: ${parent}`);
      }
    }
  }

  if (!isText(meta.scope)) {
    errors.push(`${doc.rel}: scope must be a non-empty string`);
  }
  const owns = checkList(doc, "owns", errors, warnings);
  const doesNotOwn = checkList(doc, "does_not_own", errors, warnings);
  checkList(doc, "interfaces", errors, warnings);
  const overlap = owns.filter((value) => doesNotOwn.includes(value));
  if (overlap.length > 0) {
    errors.push(
      `${doc.rel}: owns and does_not_own overlap: ${[...new Set(overlap)].sort().join(", ")}`,
    );
  }
  if (owns.length === 0 && doesNotOwn.length === 0) {
    warnings.push(`${doc.rel}: design has empty owns and does_not_own`);
  }

  const implementation = meta.implementation;
  if (!["none", "partial", "complete"].includes(String(implementation))) {
    errors.push(
      `${doc.rel}: implementation must be none, partial, or complete`,
    );
  }

  const derived = docs
    .filter(
      (other) =>
        other !== doc &&
        other.meta.type === "design" &&
        other.meta.parent === doc.id,
    )
    .map((other) => other.id)
    .sort();
  if (has(meta, "children") && meta.children !== null && meta.children !== undefined) {
    const children = checkList(doc, "children", errors, warnings);
    if (
      children.length !== derived.length ||
      [...children].sort().join("\u0000") !== derived.join("\u0000")
    ) {
      errors.push(
        `${doc.rel}: children must match designs whose parent is ${doc.id}`,
      );
    }
    for (const childId of children) {
      const child = byId.get(childId);
      if (!child) {
        errors.push(`${doc.rel}: child design does not exist: ${childId}`);
      } else if (child.meta.type !== "design") {
        errors.push(`${doc.rel}: child is not a design: ${childId}`);
      } else if (child.meta.parent !== doc.id) {
        errors.push(`${doc.rel}: child ${childId} does not point back to parent`);
      }
    }
  }

  for (const other of docs) {
    if (other === doc || other.meta.type !== "design") {
      continue;
    }
    if (other.id && doc.id && other.id < doc.id) {
      continue;
    }
    const otherOwns = isStringList(other.meta.owns) ? other.meta.owns : [];
    const shared = owns.filter((value) => otherOwns.includes(value));
    if (shared.length > 0) {
      warnings.push(
        `${doc.rel}: owns entries also claimed by ${other.id}: ${[...new Set(shared)].sort().join(", ")}`,
      );
    }
  }
}

function checkProposal(
  doc: Doc,
  byId: Map<string, Doc>,
  errors: string[],
): void {
  const meta = doc.meta;
  const issue = meta.issue;
  if (issue !== null && issue !== undefined) {
    if (typeof issue === "boolean") {
      errors.push(`${doc.rel}: issue must be a number, URL, or null`);
    } else if (typeof issue === "number") {
      if (issue < 1) {
        errors.push(`${doc.rel}: issue number must be positive`);
      }
    } else if (typeof issue === "string") {
      if (!issue.trim()) {
        errors.push(`${doc.rel}: issue must not be empty`);
      }
    } else {
      errors.push(`${doc.rel}: issue must be a number, URL, or null`);
    }
  }
  checkOptionalId(doc, "design", "DES", byId, errors);
  const trigger = meta.activation_trigger;
  if (trigger !== null && trigger !== undefined && !isText(trigger)) {
    errors.push(
      `${doc.rel}: activation_trigger must be a non-empty string or null`,
    );
  }
  if (doc.meta.status === "deferred" && !isText(trigger)) {
    errors.push(`${doc.rel}: deferred proposal requires activation_trigger`);
  }
}

function checkDecision(
  doc: Doc,
  errors: string[],
  warnings: string[],
): void {
  const options = checkList(doc, "options", errors, warnings);
  if (options.length === 0) {
    warnings.push(`${doc.rel}: decision has no options`);
  }
  if (!isText(doc.meta.decision)) {
    errors.push(`${doc.rel}: decision must be a non-empty string`);
  }
  const consequences = checkList(doc, "consequences", errors, warnings);
  if (consequences.length === 0) {
    warnings.push(`${doc.rel}: decision has no consequences`);
  }
}

function checkRecord(
  doc: Doc,
  byId: Map<string, Doc>,
  errors: string[],
  warnings: string[],
): void {
  let commits = commitList(doc.meta.commits);
  if (commits === null) {
    errors.push(`${doc.rel}: commits must be a list of strings`);
    commits = [];
  } else if (!unique(commits)) {
    errors.push(`${doc.rel}: commits contains duplicate entries`);
  }
  if (commits.length === 0) {
    warnings.push(`${doc.rel}: record has no commits`);
  }
  for (const commit of commits) {
    if (!commit.trim()) {
      errors.push(`${doc.rel}: commits must not contain empty values`);
    } else if (!SHA_RE.test(commit)) {
      warnings.push(
        `${doc.rel}: commit ${commit} is not a 7-40 character git SHA`,
      );
    }
  }
  checkOptionalId(doc, "proposal", "PROP", byId, errors);
  const evidence = checkList(doc, "evidence", errors, warnings);
  if (evidence.length === 0) {
    warnings.push(`${doc.rel}: record has no evidence`);
  }
  for (const item of evidence) {
    if (!item.trim()) {
      errors.push(`${doc.rel}: evidence must not contain empty values`);
    }
  }
}

function checkReport(
  doc: Doc,
  errors: string[],
  warnings: string[],
): void {
  if (!isText(doc.meta.method)) {
    errors.push(`${doc.rel}: method must be a non-empty string`);
  }
  const findings = checkList(doc, "findings", errors, warnings);
  if (findings.length === 0) {
    warnings.push(`${doc.rel}: report has no findings`);
  }
  const limitations = checkList(doc, "limitations", errors, warnings);
  if (limitations.length === 0) {
    warnings.push(`${doc.rel}: report has no limitations`);
  }
}

function checkReference(
  doc: Doc,
  errors: string[],
  warnings: string[],
): void {
  const readWhen = checkList(doc, "read_when", errors, warnings);
  if (readWhen.length === 0) {
    warnings.push(`${doc.rel}: reference has no read_when`);
  }
}

function designCycles(docs: readonly Doc[]): string[] {
  const graph = new Map<string, string>();
  for (const doc of docs) {
    if (doc.meta.type !== "design") {
      continue;
    }
    const parent = doc.meta.parent;
    if (typeof parent === "string" && parent) {
      graph.set(doc.id, parent);
    }
  }
  const errors: string[] = [];
  const stateMap = new Map<string, number>();
  const reported = new Set<string>();

  const visit = (node: string, stack: string[]): void => {
    if (stateMap.get(node) === 2) {
      return;
    }
    if (stateMap.get(node) === 1) {
      const start = stack.indexOf(node) >= 0 ? stack.indexOf(node) : 0;
      const cycle = [...stack.slice(start), node];
      const key = [...new Set(cycle)].sort().join("\u0000");
      if (!reported.has(key)) {
        reported.add(key);
        errors.push(`design parent cycle: ${cycle.join(" -> ")}`);
      }
      return;
    }
    stateMap.set(node, 1);
    const parent = graph.get(node);
    if (parent && graph.has(parent)) {
      visit(parent, [...stack, node]);
    }
    stateMap.set(node, 2);
  };

  for (const node of graph.keys()) {
    visit(node, []);
  }
  return errors;
}

function supersedeCycles(docs: readonly Doc[]): string[] {
  const graph = new Map<string, string[]>();
  for (const doc of docs) {
    if (doc.id) {
      graph.set(doc.id, relationList(doc.meta.superseded_by) ?? []);
    }
  }
  const stateMap = new Map<string, number>();
  const reported = new Set<string>();
  const errors: string[] = [];

  const visit = (node: string, stack: string[]): void => {
    if (stateMap.get(node) === 2) {
      return;
    }
    if (stateMap.get(node) === 1) {
      const start = stack.indexOf(node) >= 0 ? stack.indexOf(node) : 0;
      const cycle = [...stack.slice(start), node];
      const key = [...new Set(cycle)].sort().join("\u0000");
      if (!reported.has(key)) {
        reported.add(key);
        errors.push(`supersession cycle: ${cycle.join(" -> ")}`);
      }
      return;
    }
    stateMap.set(node, 1);
    for (const child of graph.get(node) ?? []) {
      if (graph.has(child)) {
        visit(child, [...stack, node]);
      }
    }
    stateMap.set(node, 2);
  };

  for (const node of graph.keys()) {
    visit(node, []);
  }
  return errors;
}

function validateSupersession(
  docs: readonly Doc[],
  byId: Map<string, Doc>,
  errors: string[],
  warnings: string[],
): void {
  for (const doc of docs) {
    const docType = doc.meta.type;
    if (typeof docType !== "string" || !(TYPES as readonly string[]).includes(docType)) {
      continue;
    }
    const supersedes = relationList(doc.meta.supersedes) ?? [];
    const supersededBy = relationList(doc.meta.superseded_by) ?? [];

    if (!(docType in SUPERSEDE_ALLOWED)) {
      for (const _targetId of supersedes) {
        errors.push(`${doc.rel}: ${docType} documents cannot supersede another document`);
      }
      for (const _sourceId of supersededBy) {
        errors.push(`${doc.rel}: ${docType} documents cannot be superseded`);
      }
    }

    for (const targetId of supersedes) {
      if (targetId === doc.id) {
        errors.push(`${doc.rel}: supersedes itself`);
        continue;
      }
      const target = byId.get(targetId);
      if (!target) {
        errors.push(`${doc.rel}: supersedes target does not exist: ${targetId}`);
        continue;
      }
      const targetType = String(target.meta.type ?? "");
      const allowed = SUPERSEDE_ALLOWED[targetType] ?? new Set<string>();
      if (!allowed.has(docType)) {
        errors.push(
          `${doc.rel}: ${docType} cannot supersede ${targetType} document ${targetId}`,
        );
      }
      if (!(relationList(target.meta.superseded_by) ?? []).includes(doc.id)) {
        errors.push(
          `${doc.rel}: supersedes ${targetId} but ${target.rel} does not list it in superseded_by`,
        );
      }
      if (target.meta.status !== "superseded") {
        warnings.push(
          `${doc.rel}: superseded target ${targetId} is not marked superseded`,
        );
      }
    }

    for (const sourceId of supersededBy) {
      if (sourceId === doc.id) {
        errors.push(`${doc.rel}: superseded_by points to itself`);
        continue;
      }
      const source = byId.get(sourceId);
      if (!source) {
        errors.push(`${doc.rel}: superseded_by target does not exist: ${sourceId}`);
        continue;
      }
      const sourceType = String(source.meta.type ?? "");
      const allowed = SUPERSEDE_ALLOWED[docType] ?? new Set<string>();
      if (!allowed.has(sourceType)) {
        errors.push(
          `${doc.rel}: ${docType} cannot be superseded by ${sourceType} document ${sourceId}`,
        );
      }
      if (!(relationList(source.meta.supersedes) ?? []).includes(doc.id)) {
        errors.push(
          `${doc.rel}: superseded_by ${sourceId} but ${source.rel} does not list it in supersedes`,
        );
      }
    }

    if (supersededBy.length > 0 && doc.meta.status !== "superseded") {
      warnings.push(
        `${doc.rel}: has superseded_by but status is ${doc.meta.status}`,
      );
    }
    if (doc.meta.status === "superseded" && supersededBy.length === 0) {
      warnings.push(`${doc.rel}: superseded without superseded_by`);
    }
  }
  errors.push(...supersedeCycles(docs));
}

function maskCode(text: string): string {
  const withoutComments = text.replace(/<!--[\s\S]*?-->/g, (match) => {
    const count = (match.match(/\n/g) ?? []).length;
    return "\n".repeat(count);
  });
  const output: string[] = [];
  let inFence = false;
  for (const line of withoutComments.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      output.push("");
      continue;
    }
    if (inFence) {
      output.push("");
    } else {
      output.push(line.replace(/`[^`]*`/g, ""));
    }
  }
  return output.join("\n");
}

function relativeLinkTargets(text: string): Array<[number, string]> {
  const masked = maskCode(text);
  const links: Array<[number, string]> = [];
  LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(masked)) !== null) {
    let target = match[1].trim();
    if (target.startsWith("<") && target.endsWith(">")) {
      target = target.slice(1, -1).trim();
    }
    if (!target || target.startsWith("#")) {
      continue;
    }
    if (SCHEME_RE.test(target) || target.startsWith("//")) {
      continue;
    }
    if (target.startsWith("/") || target.includes("{{")) {
      continue;
    }
    const pathPart = target.split("#", 1)[0].split("?", 1)[0];
    if (!pathPart) {
      continue;
    }
    const lineNumber = masked.slice(0, match.index).split("\n").length;
    let decoded = pathPart;
    try {
      decoded = decodeURIComponent(pathPart);
    } catch {
      // Keep the raw target when percent decoding fails.
    }
    links.push([lineNumber, decoded]);
  }
  return links;
}

function markdownFiles(): string[] {
  return walkFiles(state.root, {
    skipHidden: true,
    skipDirs: new Set(["node_modules", "bin"]),
  }).filter((file) => {
    if (!file.endsWith(".md")) {
      return false;
    }
    const parts = relpath(file).split("/");
    if (parts.includes("assets")) {
      return false;
    }
    return true;
  });
}

function validateLinks(errors: string[]): void {
  const boundary = path.resolve(state.boundary);
  for (const file of markdownFiles()) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch (error) {
      errors.push(`${relpath(file)}: cannot read file: ${(error as Error).message}`);
      continue;
    }
    const { body } = splitFrontMatter(text);
    for (const [lineNumber, link] of relativeLinkTargets(body)) {
      const target = path.resolve(path.dirname(file), link);
      if (!existsSync(target)) {
        errors.push(`${relpath(file)}:${lineNumber}: broken relative link: ${link}`);
        continue;
      }
      const relative = path.relative(boundary, target);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        errors.push(
          `${relpath(file)}:${lineNumber}: relative link escapes the repository: ${link}`,
        );
      }
    }
  }
}

function validateIndexes(
  errors: string[],
  warnings: string[],
  loadErrors: readonly string[],
): void {
  if (state.mode !== "single") {
    for (const name of ["catalog.json", "llms.txt"]) {
      if (!existsSync(path.join(state.root, name))) {
        warnings.push(
          `${name} is missing; run \`engineering-docs index\` after \`engineering-docs init\``,
        );
      }
    }
    return;
  }
  if (loadErrors.length > 0) {
    warnings.push("catalog freshness not checked because documents failed to load");
    return;
  }
  try {
    const catalog = buildCatalog();
    const llms = buildLlms(catalog);
    errors.push(...indexIssues(catalog, llms));
  } catch (error) {
    errors.push((error as Error).message);
  }
}

export function runCheck(): number {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { docs, errors: loadErrors } = loadAllDocs();
  errors.push(...loadErrors);

  for (const found of collectForbidden()) {
    errors.push(`forbidden docs-root path: ${found}`);
  }

  let prefix = "";
  if (state.mode === "single") {
    const profilePath = path.join(state.root, "project.yaml");
    let profile: Record<string, unknown> = {};
    try {
      profile = loadProjectProfile();
    } catch (error) {
      errors.push((error as Error).message);
    }
    if (!PROJECT_SLUG_RE.test(state.projectId)) {
      errors.push(`${relpath(profilePath)}: project id must be lowercase ASCII kebab-case`);
    }
    validateProfile(state.projectId, profile, profilePath, errors, warnings);
    prefix = projectPrefix(state.projectId, profile);
  }

  const byId = new Map<string, Doc>();
  for (const doc of docs) {
    if (doc.id && !byId.has(doc.id)) {
      byId.set(doc.id, doc);
    }
  }

  for (const doc of docs) {
    validateBasic(doc, byId, prefix, errors, warnings);
  }

  for (const doc of docs) {
    const docType = doc.meta.type;
    if (typeof docType !== "string" || !(TYPES as readonly string[]).includes(docType)) {
      continue;
    }
    const type = docType as DocType;
    for (const key of TYPE_KEYS[type]) {
      if (!has(doc.meta, key)) {
        errors.push(`${doc.rel}: missing ${key} front matter key for ${type}`);
      }
    }
    switch (type) {
      case "design":
        checkDesign(doc, byId, docs, errors, warnings);
        break;
      case "proposal":
        checkProposal(doc, byId, errors);
        break;
      case "decision":
        checkDecision(doc, errors, warnings);
        break;
      case "record":
        checkRecord(doc, byId, errors, warnings);
        break;
      case "report":
        checkReport(doc, errors, warnings);
        break;
      case "reference":
        checkReference(doc, errors, warnings);
        break;
    }
  }

  validateSupersession(docs, byId, errors, warnings);
  errors.push(...designCycles(docs));
  validateLinks(errors);
  if (errors.length === 0) {
    validateIndexes(errors, warnings, loadErrors);
  }

  for (const message of warnings) {
    warn(message);
  }
  if (errors.length > 0) {
    for (const message of errors) {
      err(message);
    }
    process.stderr.write(
      `engineering-docs check failed: ${errors.length} error(s), ${warnings.length} warning(s)\n`,
    );
    return 1;
  }
  process.stdout.write(
    `engineering-docs check: OK (${docs.length} documents, ${warnings.length} warnings)\n`,
  );
  return 0;
}
