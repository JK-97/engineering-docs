import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const CLI = path.resolve("dist/cli.cjs");
const PACKAGE = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};
const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "engdocs-test-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

function run(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runRaw(
  args: string[],
  options: { cwd?: string; cli?: string } = {},
): { status: number | null; stdout: Buffer; stderr: Buffer } {
  const result = spawnSync(process.execPath, [options.cli ?? CLI, ...args], {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env },
    encoding: null,
  });
  return {
    status: result.status,
    stdout: (result.stdout as Buffer | null) ?? Buffer.alloc(0),
    stderr: (result.stderr as Buffer | null) ?? Buffer.alloc(0),
  };
}

function initRoot(id = "example", prefix = "EX"): { root: string; docs: string } {
  const root = tempRoot();
  const docs = path.join(root, "docs");
  const result = run([
    "init",
    "--root",
    docs,
    "--id",
    id,
    "--name",
    "Example",
    "--prefix",
    prefix,
    "--owner",
    "tester",
    "--summary",
    "sample",
  ]);
  expect(result.status, result.stderr).toBe(0);
  return { root, docs };
}

function frontMatter(file: string): Record<string, unknown> {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`missing front matter: ${file}`);
  }
  return parseYaml(match[1]) as Record<string, unknown>;
}

function projectFile(docs: string): string {
  return path.join(docs, "project.yaml");
}

function replaceStandardVersion(docs: string, value: string | null): void {
  const file = projectFile(docs);
  const text = readFileSync(file, "utf8");
  const replacement = value === null ? "" : `standard_version: ${value}\n`;
  writeFileSync(file, text.replace(/^standard_version:.*\r?\n/m, replacement));
}

describe("init", () => {
  it("scaffolds a docs-only root", () => {
    const { docs } = initRoot();
    for (const relative of ["project.yaml", "README.md", "designs/system-overview.md"]) {
      expect(existsSync(path.join(docs, relative)), relative).toBe(true);
    }
    for (const directory of [
      "designs",
      "proposals",
      "decisions",
      "records",
      "reports",
      "references",
      "assets",
    ]) {
      expect(statSync(path.join(docs, directory)).isDirectory(), directory).toBe(
        true,
      );
    }
    expect(existsSync(path.join(docs, "tools"))).toBe(false);

    const profile = parseYaml(
      readFileSync(projectFile(docs), "utf8"),
    ) as Record<string, unknown>;
    expect(profile.id).toBe("example");
    expect(profile.prefix).toBe("EX");
    expect(profile.standard_version).toBe(PACKAGE.version);
    expect(Object.prototype.hasOwnProperty.call(profile, "repos")).toBe(false);

    const readme = readFileSync(path.join(docs, "README.md"), "utf8");
    expect(readme).toContain("## Workflow");
    expect(readme).toContain(`npx @jk-97/engineering-docs@${PACKAGE.version}`);
    expect(readme).toContain("standard");
    expect(readme).toContain("from the repository root");
    expect(readme).toContain("--root docs");
    expect(readme).not.toContain("--root .");
    expect(readme).not.toContain("tools/");
    expect(readme).not.toContain("node tools");

    const overview = frontMatter(path.join(docs, "designs", "system-overview.md"));
    expect(overview.id).toBe("EX-DES-001");
    expect(overview.status).toBe("draft");

    const index = run(["index", "--root", docs]);
    expect(index.status, index.stderr).toBe(0);
    const check = run(["check", "--root", docs]);
    expect(check.status, check.stderr).toBe(0);
    expect(check.stdout).toContain("engineering-docs check: OK");
  });

  it("refuses an existing root and preserves files with --force", () => {
    const { root, docs } = initRoot();
    const again = run(["init", "--root", docs, "--id", "other", "--prefix", "OT"]);
    expect(again.status).toBe(1);
    expect(again.stderr).toContain("refusing to overwrite");

    const keep = path.join(root, "keep.txt");
    writeFileSync(keep, "keep\n");
    const occupied = run([
      "init",
      "--root",
      root,
      "--id",
      "forced",
      "--name",
      "Forced",
      "--prefix",
      "FO",
    ]);
    expect(occupied.status).toBe(1);
    expect(occupied.stderr).toContain("not empty");

    const forced = run([
      "init",
      "--root",
      root,
      "--id",
      "forced",
      "--name",
      "Forced",
      "--prefix",
      "FO",
      "--force",
    ]);
    expect(forced.status, forced.stderr).toBe(0);
    expect(readFileSync(keep, "utf8")).toBe("keep\n");
    expect(existsSync(path.join(root, "project.yaml"))).toBe(true);
    expect(existsSync(path.join(root, "tools"))).toBe(false);
  });
});

describe("documents", () => {
  it("creates every type, checks, and indexes", () => {
    const { docs } = initRoot();
    const cases: Array<[string[], string]> = [
      [["--type", "design", "--status", "active", "--title", "System", "--slug", "system"], "designs/system.md"],
      [["--type", "proposal", "--status", "active", "--title", "Proposal", "--slug", "proposal", "--issue", "42", "--design", "EX-DES-001"], "proposals/proposal.md"],
      [["--type", "decision", "--status", "accepted", "--title", "Decision", "--slug", "decision"], "decisions/decision.md"],
      [["--type", "record", "--status", "implemented", "--title", "Record", "--slug", "record", "--commit", "abcdef1"], "records/record.md"],
      [["--type", "report", "--status", "reference", "--title", "Report", "--slug", "report"], "reports/report.md"],
      [["--type", "reference", "--status", "reference", "--title", "Reference", "--slug", "reference"], "references/reference.md"],
    ];
    for (const [flags, relative] of cases) {
      const result = run(["new", "--root", docs, ...flags]);
      expect(result.status, result.stderr).toBe(0);
      expect(existsSync(path.join(docs, relative)), relative).toBe(true);
    }
    expect(frontMatter(path.join(docs, "proposals", "proposal.md")).issue).toBe(42);
    expect(frontMatter(path.join(docs, "records", "record.md")).commits).toEqual([
      "abcdef1",
    ]);

    const index = run(["index", "--root", docs]);
    expect(index.status, index.stderr).toBe(0);
    const checkAfterIndex = run(["check", "--root", docs]);
    expect(checkAfterIndex.status, checkAfterIndex.stderr).toBe(0);
    expect(checkAfterIndex.stdout).toContain("engineering-docs check: OK");
    expect(existsSync(path.join(docs, "catalog.json"))).toBe(true);
    expect(existsSync(path.join(docs, "llms.txt"))).toBe(true);
    const indexCheck = run(["index", "--root", docs, "--check"]);
    expect(indexCheck.status, indexCheck.stderr).toBe(0);
    expect(indexCheck.stdout).toContain("up to date");
  });

  it("uses DOCS_TEMPLATES and ignores docs-root templates", () => {
    const { docs } = initRoot();
    const custom = path.join(tempRoot(), "templates");
    mkdirSync(custom, { recursive: true });
    writeFileSync(
      path.join(custom, "design.md"),
      "# {{title}}\n\n## Custom Section\n\nCustom body.\n",
    );
    const overridden = run(
      [
        "new",
        "--root",
        docs,
        "--type",
        "design",
        "--status",
        "draft",
        "--title",
        "Custom",
        "--slug",
        "custom",
      ],
      { env: { DOCS_TEMPLATES: custom } },
    );
    expect(overridden.status, overridden.stderr).toBe(0);
    expect(
      readFileSync(path.join(docs, "designs", "custom.md"), "utf8"),
    ).toContain("## Custom Section");

    const legacy = path.join(docs, "templates");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(
      path.join(legacy, "design.md"),
      `---
id: EX-DES-900
project: example
type: design
status: draft
title: Legacy
summary: Legacy
created: 2026-10-01
created_source: memo
completed: null
completed_source: null
updated: 2026-10-01
last_verified: null
owner: tester
related: []
supersedes: null
superseded_by: null
parent: null
scope: Legacy
owns: []
does_not_own: []
interfaces: []
implementation: none
---

# LEGACY

Legacy body.
`,
    );
    const fromPackage = run([
      "new",
      "--root",
      docs,
      "--type",
      "design",
      "--status",
      "draft",
      "--title",
      "Packaged",
      "--slug",
      "packaged",
    ]);
    expect(fromPackage.status, fromPackage.stderr).toBe(0);
    const created = readFileSync(path.join(docs, "designs", "packaged.md"), "utf8");
    expect(created).not.toContain("LEGACY");
    expect(created).toContain("## Responsibilities and Boundaries");
  });

  it("derives an ASCII slug from the ID when the title has no ASCII", () => {
    const { docs } = initRoot();
    const created = run([
      "new",
      "--root",
      docs,
      "--type",
      "design",
      "--status",
      "draft",
      "--title",
      "🚀",
    ]);
    expect(created.status, created.stderr).toBe(0);
    expect(existsSync(path.join(docs, "designs", "des-002.md"))).toBe(true);
  });

  it("reports invalid docs with stable exit codes", () => {
    const { docs } = initRoot();
    const bad = path.join(docs, "designs", "bad.md");
    writeFileSync(
      bad,
      `---
id: EX-DES-099
project: example
type: design
status: accepted
title: Bad
summary: Bad
created: 2026-10-01
created_source: memo
completed: null
completed_source: null
updated: 2026-10-02
last_verified: null
owner: tester
related: []
supersedes: null
superseded_by: null
parent: null
scope: Bad
owns: []
does_not_own: []
interfaces: []
implementation: none
---

# Bad

[missing](missing.md)
`,
    );
    mkdirSync(path.join(docs, "plans"), { recursive: true });
    writeFileSync(path.join(docs, "plans", "note.md"), "# note\n");

    const check = run(["check", "--root", docs]);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("status accepted is not valid for design");
    expect(check.stderr).toContain("broken relative link: missing.md");
    expect(check.stderr).toContain("forbidden docs-root path: plans/");
    expect(check.stderr).toContain("engineering-docs check failed");
  });

  it("rejects the reserved document number 000", () => {
    const { docs } = initRoot();
    writeFileSync(
      path.join(docs, "designs", "reserved.md"),
      `---
id: EX-DES-000
project: example
type: design
status: draft
title: Reserved
summary: Reserved
created: 2026-10-01
created_source: memo
completed: null
completed_source: null
updated: 2026-10-01
last_verified: null
owner: tester
related: []
supersedes: null
superseded_by: null
parent: null
scope: Reserved
owns: []
does_not_own: []
interfaces: []
implementation: none
---

# Reserved
`,
    );
    const check = run(["check", "--root", docs]);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("000 is reserved");
  });

  it("rejects a docs-root tools directory", () => {
    const { docs } = initRoot();
    mkdirSync(path.join(docs, "tools"), { recursive: true });
    writeFileSync(path.join(docs, "tools", "docs"), "#!/usr/bin/env node\n");
    const check = run(["check", "--root", docs]);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("forbidden docs-root path: tools/");
  });

  it("warns when standard_version differs but still succeeds", () => {
    const { docs } = initRoot();
    replaceStandardVersion(docs, "0.9.0");
    expect(run(["index", "--root", docs]).status).toBe(0);
    const check = run(["check", "--root", docs]);
    expect(check.status, check.stderr).toBe(0);
    expect(check.stderr).toContain(
      `standard_version 0.9.0 differs from CLI version ${PACKAGE.version}`,
    );
  });

  it("warns when standard_version is missing", () => {
    const { docs } = initRoot();
    replaceStandardVersion(docs, null);
    expect(run(["index", "--root", docs]).status).toBe(0);
    const check = run(["check", "--root", docs]);
    expect(check.status, check.stderr).toBe(0);
    expect(check.stderr).toContain("missing standard_version");
  });

  it("errors on a non-semantic standard_version", () => {
    const { docs } = initRoot();
    replaceStandardVersion(docs, "not-a-version");
    expect(run(["index", "--root", docs]).status).toBe(0);
    const check = run(["check", "--root", docs]);
    expect(check.status).toBe(1);
    expect(check.stderr).toContain(
      "standard_version must be a semantic version",
    );
  });

  it("archives with reciprocal supersession", () => {
    const { docs } = initRoot();
    for (const [slug, title] of [["old", "Old"], ["new", "New"]]) {
      const created = run([
        "new",
        "--root",
        docs,
        "--type",
        "design",
        "--status",
        "active",
        "--title",
        title,
        "--slug",
        slug,
      ]);
      expect(created.status, created.stderr).toBe(0);
    }
    const archived = run([
      "archive",
      "EX-DES-002",
      "--by",
      "EX-DES-003",
      "--root",
      docs,
    ]);
    expect(archived.status, archived.stderr).toBe(0);
    const old = frontMatter(path.join(docs, "designs", "old.md"));
    const replacement = frontMatter(path.join(docs, "designs", "new.md"));
    expect(old.status).toBe("superseded");
    expect(old.superseded_by).toBe("EX-DES-003");
    expect(replacement.supersedes).toBe("EX-DES-002");

    const index = run(["index", "--root", docs]);
    expect(index.status, index.stderr).toBe(0);
    const llms = readFileSync(path.join(docs, "llms.txt"), "utf8");
    const historyAt = llms.indexOf("### History (not current guidance)");
    expect(historyAt).toBeGreaterThan(-1);
    expect(llms.slice(0, historyAt)).toContain("EX-DES-003");
    expect(llms.slice(0, historyAt)).not.toContain("EX-DES-002");
    expect(llms.slice(historyAt)).toContain("EX-DES-002");
  });

  it("warns when a proposal targets a superseded design", () => {
    const { docs } = initRoot();
    for (const [slug, title] of [["old", "Old"], ["new", "New"]]) {
      const created = run([
        "new",
        "--root",
        docs,
        "--type",
        "design",
        "--status",
        "active",
        "--title",
        title,
        "--slug",
        slug,
      ]);
      expect(created.status, created.stderr).toBe(0);
    }
    const archived = run([
      "archive",
      "EX-DES-002",
      "--by",
      "EX-DES-003",
      "--root",
      docs,
    ]);
    expect(archived.status, archived.stderr).toBe(0);
    const proposal = run([
      "new",
      "--root",
      docs,
      "--type",
      "proposal",
      "--status",
      "active",
      "--title",
      "Pivot",
      "--slug",
      "pivot",
      "--design",
      "EX-DES-002",
    ]);
    expect(proposal.status, proposal.stderr).toBe(0);

    expect(run(["index", "--root", docs]).status).toBe(0);
    const check = run(["check", "--root", docs]);
    expect(check.status, check.stderr).toBe(0);
    expect(check.stderr).toContain(
      "targets superseded design EX-DES-002; close or re-scope this proposal",
    );
  });
});

describe("standard", () => {
  it("prints the package PROCESS.md bytes without a project root", () => {
    const root = tempRoot();
    const result = runRaw(["standard"], { cwd: root });
    expect(result.status, result.stderr.toString()).toBe(0);
    expect(result.stdout.equals(readFileSync("PROCESS.md"))).toBe(true);
    expect(result.stderr.length).toBe(0);
    expect(readdirSync(root)).toEqual([]);
  });

  it("exits 1 when PROCESS.md cannot be located", () => {
    const bundle = path.join(tempRoot(), "bundle");
    mkdirSync(bundle, { recursive: true });
    copyFileSync(CLI, path.join(bundle, "cli.cjs"));
    const result = runRaw(["standard"], {
      cwd: bundle,
      cli: path.join(bundle, "cli.cjs"),
    });
    expect(result.status).toBe(1);
    expect(result.stderr.toString()).toContain("cannot locate PROCESS.md");
  });
});

describe("commands", () => {
  it("supports root before/after and DOCS_ROOT", () => {
    const { docs } = initRoot();
    expect(run(["--root", docs, "list"]).status).toBe(0);
    expect(run(["list", "--root", docs]).status).toBe(0);
    const envRun = run(["list"], { env: { DOCS_ROOT: docs } });
    expect(envRun.status, envRun.stderr).toBe(0);
    expect(envRun.stdout).toContain("EX-DES-001");
  });

  it("prints context, list, search, show, and stale", () => {
    const { docs } = initRoot();
    const context = run(["context", "--root", docs]);
    expect(context.status, context.stderr).toBe(0);
    expect(context.stdout).toContain("Active context");
    const list = run(["list", "--root", docs]);
    expect(list.stdout).toContain("ID\tTYPE\tSTATUS\tPATH\tTITLE");
    const search = run(["search", "System", "--root", docs]);
    expect(search.status, search.stderr).toBe(0);
    expect(search.stdout).toContain("EX-DES-001");
    const show = run(["show", "EX-DES-001", "--root", docs]);
    expect(show.status, show.stderr).toBe(0);
    expect(show.stdout).toContain("path: designs/system-overview.md");
    const stale = run(["stale", "--root", docs]);
    expect(stale.status, stale.stderr).toBe(0);
    expect(stale.stdout).toContain("No stale documents");
  });

  it("returns version and usage errors", () => {
    const version = run(["--version"]);
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe(`engineering-docs ${PACKAGE.version}`);
    const help = run(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("standard");
    expect(help.stdout).toContain("install-skill");

    const bad = run(["new", "--type", "nope", "--status", "draft", "--title", "x"]);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain("engineering-docs: error:");

    const missing = run(["show", "NOPE", "--root", initRoot().docs]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toContain("unknown document");

    const unknown = run(["nope"]);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain("invalid choice: nope");

    const empty = run([]);
    expect(empty.status).toBe(2);
    expect(empty.stderr).toContain("usage: engineering-docs");
  });
});
