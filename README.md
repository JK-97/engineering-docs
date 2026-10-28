# engineering-docs

A project-agnostic engineering documentation standard, packaged as a Node.js CLI,
six document templates, and an agent skill. A project uses it to keep designs,
proposals, decisions, records, reports, and references in one consistent docs
root.

This repository is the framework itself. It is not a project documentation
repository: it contains no project documents, no example docs root, and no
project-specific facts. The current standard version is **1.1.0**.

## What this repository provides

- **A standard.** [PROCESS.md](PROCESS.md) defines the six document types,
  type-specific statuses, lifecycle, front matter, dates, IDs, directories,
  review, staleness, supersession, generation resets, and validation.
- **A CLI.** `@jk-97/engineering-docs` creates a docs root, scaffolds documents,
  validates metadata and links, finds stale documents, archives superseded
  documents, and regenerates `catalog.json` and `llms.txt`.
- **Templates.** `framework/templates/` contains one body-only template per
  type. The CLI renders front matter from document metadata; templates never
  duplicate it.
- **An OpenCode skill.** `framework/skills/project-docs/SKILL.md` teaches an
  agent to apply the standard. Installation adds a generated copy of
  `PROCESS.md` beside it.

The framework repository has no `docs/` root. Do not add project documents here.

## Document model

A project uses exactly one docs root, by convention `<repo>/docs/`, and exactly
six document types:

- **design** describes the present: how the system works today, including
  boundaries, components, interfaces, data flow, and failure modes.
- **proposal** describes a future change: why it is needed, what it changes,
  which alternatives were considered, and how it will be implemented.
- **decision** records a hard-to-reverse choice: context, options, conclusion,
  and consequences.
- **record** records what actually happened, with commits, verification, and
  impact.
- **report** records research or measurement: method, results, findings, and
  limitations.
- **reference** keeps a read-only snapshot of an external source, such as a
  specification, vendor document, or long prompt.

There is no plan, idea, or backlog type. An implementation plan belongs to a
proposal.

### Issues and proposals

GitHub Issues hold work: defects, small changes, ideas, priorities, and
schedules. A proposal is the design basis for a future change and the only home
for its implementation plan. Use an Issue when one PR is enough and the change
does not alter a design boundary. Write a proposal when the change affects
`owns`, `does_not_own`, or `interfaces`, crosses components, needs a real
trade-off, a staged rollout, or a rollback plan, spans multiple PRs, or requires
coordination across people or teams.

Link the Issue and the proposal through `issue`; do not copy the Issue text into
the proposal.

### Change of direction

Ordinary change supersedes a document: the old one stays as history and leaves
the active reading set. A major architecture change may instead reset the
generation. Tag the last old commit as `docs-gen-<n>`, change
`project.yaml.prefix`, write a boundary record with the old and new prefixes and
every removed ID, remove the old documents and obsolete assets, and write only
the current generation. The docs root never mixes generations, and IDs are never
reused because the prefix changes.

A generation reset is reviewed as a boundary, not as cleanup. A few stale
documents are superseded, not reset; unfinished work is never carried forward.

## Adoption

### 1. Initialize the docs root

Run the pinned CLI from npm:

```bash
npx @jk-97/engineering-docs@1.1.0 init --root docs \
  --id example --name Example --prefix EX \
  --summary "One sentence about the project."
```

When a mirror has not synced, use the same version from the GitHub tag:

```bash
npx github:JK-97/engineering-docs#v1.1.0 init --root docs \
  --id example --name Example --prefix EX \
  --summary "One sentence about the project."
```

`init` writes only `project.yaml`, `README.md`, a draft
`designs/system-overview.md`, the six type directories, and `assets/`. It does
not copy the CLI, `PROCESS.md`, or templates into the project. An existing
`project.yaml` is refused; a non-empty root requires `--force`, and existing
files are never overwritten. Node.js 20 or newer is required.

### 2. Complete the overview

Turn `designs/system-overview.md` into the current system description and change
its status from `draft` to `active`. A usable root has at least `project.yaml`,
one active design, and regenerated indexes. `docs/README.md` is optional: use it
for navigation, keep links relative, and refer to documents by ID in prose.

### 3. Use the CLI

For one-off commands, run the pinned package with npx. For repeatable local use,
add that exact version as a devDependency:

```bash
npm install --save-dev --save-exact @jk-97/engineering-docs@1.1.0
npx engdocs --root docs check
```

The package installs two equivalent binaries, `engineering-docs` and `engdocs`.
`--root docs` selects the docs root. Without it, the CLI uses `DOCS_ROOT`, then
the current directory. `--root` may appear before or after the subcommand.

To read the standard that belongs to the pinned version, use `standard`:

```bash
npx @jk-97/engineering-docs@1.1.0 standard
```

`standard` prints the exact `PROCESS.md` bytes shipped in that package version to
stdout. It is read-only: it needs no project root, writes nothing, and does not
create a copy under `docs/`. With the devDependency installed,
`npx engdocs standard` prints the same file for the installed version. Use it as
the reference for the version the project pins, and do not save its output into
the docs root as project content.

### 4. Install the skill

```bash
npx @jk-97/engineering-docs@1.1.0 install-skill
npx @jk-97/engineering-docs@1.1.0 install-skill --repo /path/to/project
```

The first command installs at user level, under
`$XDG_CONFIG_HOME/opencode/skills/project-docs` or
`~/.config/opencode/skills/project-docs`. `--repo` installs at project level
under `<project>/.opencode/skills/project-docs`.

`install-skill` copies `SKILL.md` and generates `references/PROCESS.md` from the
package's canonical `PROCESS.md` at install time. The generated file lives in the
installed skill directory, not in the project's `docs/` root. The skill does not
copy templates and does not edit the project's `AGENTS.md`. Reinstalling over an
existing skill requires `--force`.

### 5. Add CI

Run the same pinned version in CI after installing Node.js 20 or newer and the
project dependencies:

```bash
npx --yes @jk-97/engineering-docs@1.1.0 --root docs index
npx --yes @jk-97/engineering-docs@1.1.0 --root docs check
npx --yes @jk-97/engineering-docs@1.1.0 --root docs index --check
```

`--yes` keeps npx non-interactive. `index` writes generated files; `check`
validates documents; `index --check` fails when generated files are stale. A
warning does not fail a command; a validation error does. If the package is a
devDependency, the same commands can use `npx engdocs`.

### 6. Pin `standard_version`

`init` writes the package version into `project.yaml`:

```yaml
standard_version: 1.1.0
```

Keep the pinned devDependency and `standard_version` on the same exact version.
`check` warns, without failing, when `standard_version` is missing or differs
from the CLI version, and it errors when the value is present but not semver.

Upgrading is explicit: choose the target version, update the pinned
devDependency and `standard_version`, read the new rules with `standard`,
regenerate indexes, run `check`, and record the reason and impact in the PR. The
docs root contains no copied CLI, standard, or templates to refresh.

## One source of truth

`PROCESS.md` at this repository root is the canonical standard. The repository
contains exactly one committed copy of it.

- The npm package ships that file. `standard` prints its exact bytes for the
  pinned package version.
- `install-skill` generates a copy at `references/PROCESS.md` inside the
  installed skill directory. It is an artifact produced at install time and is
  byte-identical to the package's `PROCESS.md`.
- The framework repository has no committed second copy. The skill source in
  git contains `SKILL.md` and no `references/PROCESS.md`.
- A project docs root has no `tools/` directory, no CLI copy, no `PROCESS.md`
  copy, and no templates. `init` writes project content only; `new` reads
  templates from the installed package or `DOCS_TEMPLATES`, never from the docs
  root.

To change the standard, edit root `PROCESS.md`; for a released change, rebuild
and publish the package, then reinstall the skill so its generated
`references/PROCESS.md` is regenerated. Never edit an installed or generated
copy as source.

## npm registry mirror

> If npm is configured to use a mirror such as npmmirror/cnpm, a newly published
> scoped version may not be synced yet. Run npx with
> `NPM_CONFIG_REGISTRY=https://registry.npmjs.org` (for example,
> `NPM_CONFIG_REGISTRY=https://registry.npmjs.org npx @jk-97/engineering-docs@1.1.0 ...`),
> or use the GitHub tag fallback. Publication and authentication, when needed,
> must also target npmjs explicitly.

## CLI at a glance

| Command | Purpose |
| --- | --- |
| `init` | Create a docs root with `project.yaml`, `README.md`, and a draft system overview. |
| `standard` | Print the exact `PROCESS.md` shipped with the pinned package. |
| `context` | Print the docs-root context. |
| `list` | List documents, optionally filtered by type or status. |
| `search` | Search document text. |
| `show` | Print one document by ID. |
| `new` | Create a document from a type template. |
| `index` | Generate `catalog.json` and `llms.txt`. |
| `check` | Validate the docs root and report warnings. |
| `stale` | List documents due for review. |
| `archive` | Mark a document superseded by another in the same generation. |
| `install-skill` | Install or refresh the `project-docs` skill. |

Most commands operate on one docs root. `standard` and `install-skill` act on
the installed package or skill and do not need a project root.

## Repository layout

```text
.
├── README.md
├── AGENTS.md
├── PROCESS.md
├── LICENSE
├── package.json
├── package-lock.json
├── tsconfig.json
├── eslint.config.mjs
├── tsup.config.ts
├── vitest.config.mts
├── .gitignore
├── .github/
│   ├── markdownlint-cli2.yaml
│   └── workflows/
│       ├── docs.yml
│       └── release.yml
├── src/
│   ├── cli.ts
│   ├── commands/
│   └── ...
├── framework/
│   ├── templates/
│   │   ├── decision.md
│   │   ├── design.md
│   │   ├── proposal.md
│   │   ├── record.md
│   │   ├── reference.md
│   │   └── report.md
│   └── skills/project-docs/
│       └── SKILL.md
└── test/
    ├── cli.test.ts
    ├── repo.test.ts
    └── skill.test.ts
```

There is no `docs/` root in this repository, no committed `references/PROCESS.md`
for the skill, and no committed build output. `dist/` is generated by the build
and is not source.

## Version

The current standard version is **1.1.0**. `package.json` `version` is the single
source of truth for the framework and the standard. The npm package, CLI
`--version` output, release tag `v1.1.0`, skill metadata, and the
`standard_version` written by `init` all follow it.

Projects pin `standard_version`; they do not follow the latest framework version
automatically. Changes to document types, required front matter, status sets, or
the generated-index schema are breaking and require a major version and
migration notes in [PROCESS.md](PROCESS.md). Publication is a separate, explicit
step against npmjs.

1.1.0 adds pivot and generation-reset rules, groups history in `llms.txt`, and
warns when a proposal targets a superseded design. It adds no document types,
required front matter, statuses, or index schema changes.

## Framework maintenance

Maintenance rules for this repository are in `AGENTS.md`. The repository is MIT
licensed; see [LICENSE](LICENSE).
