# AGENTS.md — framework maintenance

This file is the maintenance checklist for the engineering-docs framework
repository. It is not project documentation and not guidance for a project that
adopts the standard: an adopting project keeps its own `AGENTS.md` and docs root.
`PROCESS.md` is authoritative for the standard; this file only states how to
maintain the framework that publishes it.

## 1. Scope

Work only on framework files:

- root files: `README.md`, `AGENTS.md`, `PROCESS.md`, `LICENSE`;
- package and build configuration: `package.json`, `package-lock.json`,
  `tsconfig.json`, `eslint.config.mjs`, `tsup.config.ts`, `vitest.config.mts`,
  `.gitignore`;
- `src/` and `test/`;
- `framework/templates/` and `framework/skills/`;
- `.github/` CI and lint configuration.

Rules:

- Do not add project documents, a docs root, examples, or project-specific
  facts (project IDs, prefixes, names, business concepts) to this repository.
- Use temporary roots outside the repository for smoke tests. Never commit a
  temporary docs root.
- Framework text is English: root Markdown, skill, templates, source, and tests.
  Project document prose may use another language, but no project prose belongs
  here.
- Do not introduce CJK characters into framework files.

## 2. Reading order

Read before editing:

1. `README.md` for positioning, adoption, and the public command surface.
2. `PROCESS.md` for the authoritative rules. Read the relevant sections in full;
   do not infer a rule from a summary.
3. `AGENTS.md` (this file) for repository constraints.
4. `src/` and `test/` for the current CLI contract and its coverage.
5. `framework/skills/project-docs/SKILL.md` and `framework/templates/` when
   changing agent guidance or document scaffolds.

If implementation and documents disagree, fix both in the same change. Never
rewrite `PROCESS.md` to match a convenient implementation.

## 3. Hard invariants

- **`PROCESS.md` is authoritative.** Types, statuses, directories, naming,
  dates, front matter, review, staleness, and validation are defined only there.
  `README.md`, this file, `SKILL.md`, and the templates may navigate or derive
  from it, but must not define a second rule set.
- **One committed standard.** The only copy of the standard in git is root
  `PROCESS.md`. Never commit
  `framework/skills/project-docs/references/PROCESS.md`; `install-skill`
  generates it at install time.
- **No vendoring.** `init` writes project content only. A project docs root has
  no `tools/`, no CLI copy, no `PROCESS.md` copy, and no templates. Do not add a
  `docs/tools` directory, a vendored CLI, or template copies.
- **No legacy toolchain.** The CLI is TypeScript and is built by the npm
  scripts. There is no Python CLI, Taskfile, shell installer, or
  `framework/scripts`. Do not reintroduce any of them.
- **Templates are canonical.** `framework/templates/` holds the six body-only
  templates. They contain no YAML front matter; the CLI renders front matter
  from metadata. Do not duplicate template bodies in `src/` or `SKILL.md`.
- **Generated files are not source.** `dist/cli.cjs`, project `catalog.json` and
  `llms.txt`, and installed `references/PROCESS.md` are generated. Never edit
  them by hand, and never commit generated output.
- **History is evidence.** Do not weaken `check` rules for forbidden
  directories, backup files, fabricated dates, or stale indexes. Do not delete a
  merged document in ordinary work; supersede it with reciprocal links. A
  generation reset is the only deletion path: it requires an annotated
  `docs-gen-<n>` tag and a boundary record, and it removes an entire old
  generation from the working tree.
- **No project facts.** Framework files, templates, and the skill use
  placeholders such as `<project-id>` and `<PREFIX>`, never a real project.
- **English framework text.** The standard, skill, templates, source, tests, and
  repository Markdown are English. Do not introduce CJK characters, including
  in comments.

## 4. CLI contract

`src/cli.ts` builds to `dist/cli.cjs` as a CommonJS, single-file bundle. It
requires Node.js 20 or newer and exposes the equivalent binaries
`engineering-docs` and `engdocs`. Exit codes are `0` for success or valid
output, `1` for validation or runtime failure, and `2` for usage errors.

Commands: `init`, `context`, `list`, `search`, `show`, `new`, `index`, `check`,
`stale`, `archive`, `install-skill`, and `standard`.

Root selection is `--root <dir>`, then `DOCS_ROOT`, then the current directory.
`--root` may appear before or after the subcommand. `init` runs before root
configuration, so it can create a missing root. The CLI manages exactly one docs
root; do not add project subcommands or nested-project layouts.

- **`init`** writes only `project.yaml`, `README.md`, a draft
  `designs/system-overview.md`, the six type directories, and `assets/`. It does
  not copy the CLI, `PROCESS.md`, or templates. It refuses an existing
  `project.yaml`; a non-empty root requires `--force`, and existing files are
  never overwritten. It sets `standard_version` to the package version and
  prints next steps using npx.
- **`standard`** prints the package's `PROCESS.md` bytes to stdout. It needs no
  project root, performs no writes, and does not touch indexes. It exits `1`
  when `PROCESS.md` cannot be located.
- **`install-skill`** copies `SKILL.md` and writes `references/PROCESS.md` from
  the package root `PROCESS.md`. The default destination is
  `$XDG_CONFIG_HOME/opencode/skills/project-docs` or
  `~/.config/opencode/skills/project-docs`; `--repo <path>` uses
  `<path>/.opencode/skills/project-docs`. It does not copy templates or modify a
  project `AGENTS.md`. It refuses an existing destination unless `--force`, and
  it validates that the skill's `metadata.standard_version` equals the package
  version.
- **`check`** validates the docs root and reports warnings without failing:
  a missing `standard_version` and a version that differs from the CLI version
  are warnings. A present but non-semver value is an error. Validation errors
  exit `1`.
- **`new`** reads templates from `DOCS_TEMPLATES` when set, otherwise from
  `<package-root>/framework/templates`. Never read a template from the docs
  root, a `tools/` directory, or a vendored path.
- **`index`** generates `catalog.json` with `schema_version: 2` and `llms.txt`.
  `index --check` verifies generated files without rewriting them.

No command reads a vendored CLI or a `tools/` directory under a docs root. There
is no project-level CLI path to support.

## 5. Skill and templates

`framework/skills/project-docs/SKILL.md` must be English and self-contained after
installation, together with the generated `references/PROCESS.md`.

- The skill's read order is: repository `AGENTS.md`, `docs/project.yaml`,
  `docs/README.md`, the installed `references/PROCESS.md`, then active designs.
- The project's `standard_version` wins. If it differs from the skill's
  `metadata.standard_version`, use
  `npx --yes @jk-97/engineering-docs@<version> standard` and say so. Never apply
  newer rules to an older project silently.
- In source Markdown, write `references/PROCESS.md` in backticks, not as a link.
  The file does not exist in git, so a link would fail the offline link check.
- The skill contains no project facts, no vendored CLI path, and no `tools/`
  directory under a docs root.
- The skill explains pivots and generation resets: extract delivered work, drop
  unfinished work, and require an annotated tag plus a boundary record for a
  reset.

Templates are the canonical scaffolds:

- six files in `framework/templates/`, one per document type;
- body content only, with no YAML front matter block;
- `{{title}}` for the H1 and `{{commits}}` in the record template;
- headings match the intended type sections;
- no project-specific facts and no tooling paths.

`install-skill` copies only `SKILL.md` and generates
`references/PROCESS.md`; it does not copy templates.

## 6. Version and release

`package.json` `version` is the single source of truth. The current version is
`1.1.0`, and the release tag is `v1.1.0`. The npm package, CLI `--version`
output, README, skill metadata, and the `standard_version` written by `init`
follow it.

- A documentation-only change does not bump the version.
- Changes to document types, required front matter, status sets, or the
  generated-index schema are breaking: raise the major version and add
  migration notes to `PROCESS.md` and `README.md`.
- Tools never rewrite a project's `standard_version`; upgrades are explicit in
  the project.
- Do not publish or tag as part of an ordinary documentation change; releases are
  explicit, tag-driven steps.

Releases are tag-driven through `.github/workflows/release.yml`:

1. Set `package.json.version` to the next semantic version.
2. Commit and push `main`.
3. Create and push the matching tag, for example `v1.1.0`.
4. The workflow verifies that the tag equals the package version, runs
   `npm run check`, inspects the package, and publishes with npm Trusted
   Publishing (OIDC) and provenance.

A brand-new package must be bootstrapped once with an interactive
`npm publish` (2FA) before its Trusted Publisher can be configured. After that
first publish, all releases use the tag workflow.

The npm trusted publisher must point at `JK-97/engineering-docs` and
`release.yml`, and must allow direct `npm publish` (not staged-only). The
workflow has `id-token: write`; it stores no `NPM_TOKEN` or `NODE_AUTH_TOKEN`.
Do not put npm credentials in repository secrets.

Before tagging, verify the package locally:

- package contents are `dist`, `PROCESS.md`, `README.md`, `LICENSE`,
  `framework/templates`, and `framework/skills`;
- `src`, `test`, `.github`, and `AGENTS.md` are not published.

A scoped package is private by default, so `--access public` is required. If npm
is configured for a mirror, use `https://registry.npmjs.org` for release
commands; a mirror may lag behind a new version. Before npm publication, or when
a mirror has not synced, the GitHub tag fallback
`npx github:JK-97/engineering-docs#v1.1.0` installs the same tagged source.
Local `npm publish --registry=https://registry.npmjs.org --access public` is an
emergency fallback only; it bypasses the tag workflow.

## 7. Self-check

Run from the repository root:

```bash
npm ci
npm run check
npm pack --dry-run
```

`npm run check` must run typecheck, lint, build, and tests. `npm pack --dry-run`
must show the package contents above and no source, test, CI, or agent files.

Smoke-test a temporary root with the built local CLI. Framework self-checks use
`node dist/cli.cjs` because this repository does not depend on its own package;
adopting projects install the pinned devDependency and use `npx engdocs`.

```bash
tmp="$(mktemp -d)"
node dist/cli.cjs init --root "$tmp/docs" --id example --name Example --prefix EX \
  --summary "One sentence about the project."
node dist/cli.cjs --root "$tmp/docs" new --type design --status draft \
  --title "Service design" --summary "Example design."
node dist/cli.cjs --root "$tmp/docs" new --type proposal --status draft \
  --title "Change proposal" --summary "Example proposal."
node dist/cli.cjs --root "$tmp/docs" new --type decision --status proposed \
  --title "Storage decision" --summary "Example decision."
node dist/cli.cjs --root "$tmp/docs" new --type record --status implemented \
  --title "Release record" --summary "Example record."
node dist/cli.cjs --root "$tmp/docs" new --type report --status reference \
  --title "Latency report" --summary "Example report."
node dist/cli.cjs --root "$tmp/docs" new --type reference --status reference \
  --title "Vendor specification" --summary "Example reference."
node dist/cli.cjs --root "$tmp/docs" index
node dist/cli.cjs --root "$tmp/docs" check
node dist/cli.cjs --root "$tmp/docs" index --check
test ! -d "$tmp/docs/tools"
```

Then check the standard and the installed skill:

```bash
node dist/cli.cjs standard > "$tmp/standard.md"
cmp PROCESS.md "$tmp/standard.md"

node dist/cli.cjs install-skill --repo "$tmp"
test -f "$tmp/.opencode/skills/project-docs/SKILL.md"
cmp PROCESS.md "$tmp/.opencode/skills/project-docs/references/PROCESS.md"

if node dist/cli.cjs install-skill --repo "$tmp"; then
  echo "install-skill unexpectedly accepted an existing destination" >&2
  exit 1
fi
node dist/cli.cjs install-skill --repo "$tmp" --force
```

Also confirm that `init` refuses an existing root and that `--force` preserves
existing files. Markdown changes must pass the repository markdownlint config
and the offline link check used by CI; do not link to generated files that are
absent from git.
