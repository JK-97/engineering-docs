import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";

const CLI = path.resolve("dist/cli.cjs");
const SKILL_SOURCE = path.resolve("framework/skills/project-docs/SKILL.md");
const PROCESS = path.resolve("PROCESS.md");
const PACKAGE = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};
const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "engdocs-skill-"));
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

function skillDir(repo: string): string {
  return path.join(repo, ".opencode", "skills", "project-docs");
}

function frontMatter(file: string): Record<string, unknown> {
  const text = readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    throw new Error(`missing front matter: ${file}`);
  }
  return parseYaml(match[1]) as Record<string, unknown>;
}

describe("install-skill", () => {
  it("installs SKILL.md and a generated references/PROCESS.md into a repository", () => {
    const repo = tempRoot();
    const agents = path.join(repo, "AGENTS.md");
    writeFileSync(agents, "# Project agents\n\nKeep this file.\n");

    const result = run(["install-skill", "--repo", repo], { cwd: tempRoot() });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Installed project-docs skill");

    const target = skillDir(repo);
    expect(readdirSync(target).sort()).toEqual(["SKILL.md", "references"]);
    expect(
      readFileSync(path.join(target, "SKILL.md")).equals(
        readFileSync(SKILL_SOURCE),
      ),
    ).toBe(true);
    expect(existsSync(path.join(target, "templates"))).toBe(false);

    const references = path.join(target, "references");
    expect(readdirSync(references)).toEqual(["PROCESS.md"]);
    expect(
      readFileSync(path.join(references, "PROCESS.md")).equals(
        readFileSync(PROCESS),
      ),
    ).toBe(true);

    expect(readFileSync(agents, "utf8")).toBe(
      "# Project agents\n\nKeep this file.\n",
    );
  });

  it("refuses an existing destination and reinstalls with --force", () => {
    const repo = tempRoot();
    const first = run(["install-skill", "--repo", repo]);
    expect(first.status, first.stderr).toBe(0);

    const sentinel = path.join(skillDir(repo), "sentinel.txt");
    writeFileSync(sentinel, "old\n");
    const second = run(["install-skill", "--repo", repo]);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain("refusing to overwrite");
    expect(existsSync(sentinel)).toBe(true);

    const forced = run(["install-skill", "--repo", repo, "--force"]);
    expect(forced.status, forced.stderr).toBe(0);
    expect(existsSync(sentinel)).toBe(false);
    expect(
      readFileSync(
        path.join(skillDir(repo), "references", "PROCESS.md"),
      ).equals(readFileSync(PROCESS)),
    ).toBe(true);
  });

  it("installs at user level under XDG_CONFIG_HOME", () => {
    const root = tempRoot();
    const configHome = path.join(root, "config");
    const result = run(["install-skill"], {
      cwd: root,
      env: { XDG_CONFIG_HOME: configHome },
    });
    expect(result.status, result.stderr).toBe(0);

    const target = path.join(
      configHome,
      "opencode",
      "skills",
      "project-docs",
    );
    expect(existsSync(path.join(target, "SKILL.md"))).toBe(true);
    expect(
      readFileSync(path.join(target, "references", "PROCESS.md")).equals(
        readFileSync(PROCESS),
      ),
    ).toBe(true);
  });

  it("keeps the skill metadata version equal to the package version", () => {
    const metadata = frontMatter(SKILL_SOURCE);
    const values = metadata.metadata as
      | { standard_version?: string }
      | undefined;
    expect(values?.standard_version).toBe(PACKAGE.version);
  });

  it("does not require a project root", () => {
    const repo = tempRoot();
    const result = run(["install-skill", "--repo", repo], {
      cwd: repo,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(path.join(skillDir(repo), "SKILL.md"))).toBe(true);
  });
});
