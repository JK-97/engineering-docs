import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const HAN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

const TEMPLATES = [
  "decision",
  "design",
  "proposal",
  "record",
  "reference",
  "report",
];

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "coverage"]);

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...walk(path.join(directory, entry.name)));
    } else if (entry.isFile()) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
}

function frameworkTextFiles(): string[] {
  return [
    "README.md",
    "AGENTS.md",
    "PROCESS.md",
    ...walk("framework"),
    ...walk("src"),
    ...walk("test"),
  ].filter((file) => /\.(?:md|ts|json)$/.test(file));
}

function readText(file: string): string {
  return readFileSync(file, "utf8");
}

describe("repository guards", () => {
  it("uses no Han characters in framework files", () => {
    const offenders = frameworkTextFiles().filter((file) =>
      HAN.test(readText(file)),
    );
    expect(offenders).toEqual([]);
  });

  it("does not commit a generated standard snapshot", () => {
    const references = path.join(
      "framework",
      "skills",
      "project-docs",
      "references",
    );
    expect(existsSync(path.join(references, "PROCESS.md"))).toBe(false);
    expect(existsSync(references)).toBe(false);
  });

  it("has no vendored docs root or legacy toolchain", () => {
    const legacyRunner = ["Task", "file.yml"].join("");
    const scripts = ["framework", "scripts"].join(path.sep);
    expect(existsSync(legacyRunner)).toBe(false);
    expect(existsSync(scripts)).toBe(false);
    expect(existsSync("docs")).toBe(false);
    const pyFiles = walk(".").filter((file) => file.endsWith(".py"));
    expect(pyFiles).toEqual([]);
  });

  it("contains no legacy commands or names in current sources", () => {
    const docsTools = ["docs", "tools"].join("/");
    const needles = [
      docsTools,
      ["naming", "md"].join("."),
      ["routing", "md"].join("."),
      ["Task", "file"].join(""),
      ["framework", "scripts"].join("/"),
      ["py", "thon"].join(""),
    ];
    // AGENTS.md may name these paths in negative "do not" statements.
    const files = frameworkTextFiles().filter((file) => file !== "AGENTS.md");
    const offenders: string[] = [];
    for (const file of files) {
      const lowered = readText(file).toLowerCase();
      for (const needle of needles) {
        if (lowered.includes(needle.toLowerCase())) {
          offenders.push(`${file}: ${needle}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the six templates body-only", () => {
    for (const name of TEMPLATES) {
      const file = path.join("framework", "templates", `${name}.md`);
      const text = readText(file);
      expect(text.startsWith("---"), file).toBe(false);
      expect(text.startsWith("# {{title}}"), file).toBe(true);
      expect(text).not.toContain(["docs", "tools"].join("/"));
      expect(text).not.toContain("tools/");
    }
  });

  it("publishes from a tag-triggered trusted-publishing workflow", () => {
    const workflow = readText(
      path.join(".github", "workflows", "release.yml"),
    );
    expect(workflow).toContain("tags:");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("npm publish");
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
    expect(workflow).not.toContain("NPM_TOKEN");
  });

  it("publishes only the intended package files", () => {
    const pkg = JSON.parse(readText("package.json")) as {
      version: string;
      files: string[];
      bin: Record<string, string>;
    };
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    expect(readText("README.md")).toContain(`**${pkg.version}**`);
    expect(pkg.files).toEqual([
      "dist",
      "PROCESS.md",
      "README.md",
      "LICENSE",
      "framework/templates",
      "framework/skills",
    ]);
    for (const excluded of ["src", "test", ".github", "AGENTS.md", "scripts"]) {
      expect(pkg.files).not.toContain(excluded);
    }
    expect(pkg.bin).toEqual({
      "engineering-docs": "dist/cli.cjs",
      engdocs: "dist/cli.cjs",
    });
  });
});
