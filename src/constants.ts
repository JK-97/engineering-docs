/** Constants and the document model shared by every command. */

import pkg from "../package.json";

export const PACKAGE_NAME = pkg.name;

export const PROGRAM_NAME = "engineering-docs";

export const FRAMEWORK_VERSION = pkg.version;

export const TYPES = [
  "design",
  "proposal",
  "decision",
  "record",
  "report",
  "reference",
] as const;

export type DocType = (typeof TYPES)[number];

export const STATUSES = [
  "draft",
  "active",
  "deferred",
  "rejected",
  "withdrawn",
  "proposed",
  "accepted",
  "implemented",
  "reference",
  "superseded",
] as const;

export type DocStatus = (typeof STATUSES)[number];

export const TYPE_STATUSES: Record<DocType, readonly DocStatus[]> = {
  design: ["draft", "active", "superseded"],
  proposal: [
    "draft",
    "active",
    "deferred",
    "rejected",
    "withdrawn",
    "implemented",
    "superseded",
  ],
  decision: ["proposed", "accepted", "superseded"],
  record: ["implemented"],
  report: ["reference"],
  reference: ["reference", "superseded"],
};

export const TYPE_PREFIX: Record<DocType, string> = {
  design: "DES",
  proposal: "PROP",
  decision: "ADR",
  record: "REC",
  report: "RPT",
  reference: "REF",
};

export const TYPE_LABELS: Record<DocType, string> = {
  design: "Designs",
  proposal: "Proposals",
  decision: "Decisions",
  record: "Records",
  report: "Reports",
  reference: "References",
};

export const DEFAULT_SUBDIR: Record<DocType, string> = {
  design: "designs",
  proposal: "proposals",
  decision: "decisions",
  record: "records",
  report: "reports",
  reference: "references",
};

export const TYPE_KEYS: Record<DocType, readonly string[]> = {
  design: [
    "parent",
    "scope",
    "owns",
    "does_not_own",
    "interfaces",
    "implementation",
  ],
  proposal: ["issue", "design", "activation_trigger"],
  decision: ["options", "decision", "consequences"],
  record: ["commits", "proposal", "evidence"],
  report: ["method", "findings", "limitations"],
  reference: ["read_when"],
};

export const COMMON_KEYS = [
  "id",
  "project",
  "type",
  "status",
  "title",
  "summary",
  "created",
  "completed",
  "updated",
  "last_verified",
  "owner",
  "related",
  "supersedes",
  "superseded_by",
] as const;

export const DATE_KEYS = [
  "created",
  "completed",
  "updated",
  "last_verified",
] as const;

export const DATE_SOURCE_KEYS: Record<string, string> = {
  created: "created_source",
  completed: "completed_source",
};

export const SUPERSEDE_ALLOWED: Record<string, ReadonlySet<string>> = {
  design: new Set(["design"]),
  proposal: new Set(["proposal", "design", "decision"]),
  decision: new Set(["decision"]),
  reference: new Set(["reference"]),
};

export const PROJECT_STATUSES = ["active", "paused", "archived"] as const;

export const STALE_DAYS = 90;

export const FORBIDDEN_DIRS = new Set([
  "plans",
  "ideas",
  "originals",
  "backup",
  "tools",
]);
export const FORBIDDEN_FILES = new Set(["backlog.md"]);

export const ID_RE =
  /^(?<prefix>[A-Z][A-Z0-9]{1,5})-(?<kind>DES|PROP|ADR|REC|RPT|REF)-(?<num>\d{3,})$/;
export const PREFIX_RE = /^[A-Z][A-Z0-9]{1,5}$/;
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PROJECT_SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
export const LINK_RE = /!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)/g;
export const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
export const SHA_RE = /^[0-9a-fA-F]{7,40}$/;
export const SEMVER_RE =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
