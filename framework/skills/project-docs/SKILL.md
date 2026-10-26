---
name: project-docs
description: Adopt, create, update, audit, archive, and index engineering documentation in a project that follows the engineering-docs standard. Use when initializing a docs root, adding or changing a design, proposal, decision, record, report, or reference, deciding whether work belongs in a GitHub Issue instead of a proposal, checking front matter, IDs, dates, links, supersession, or staleness, refreshing the skill, or regenerating catalog.json and llms.txt with the CLI. It does not create work-item trackers or plan directories.
metadata:
  standard_version: "1.0.0"
---

# Project Docs

Use this skill for documentation work in a project that follows the
engineering-docs standard. The project keeps its documents in its own
`<repo>/docs/` root. This skill does not override the project's `AGENTS.md` or
the standard.

## Read first and authority

Read in this order:

1. The repository `AGENTS.md` (if present).
2. `docs/project.yaml`.
3. `docs/README.md` (optional entry point).
4. `references/PROCESS.md` in this installed skill.
5. The `active` designs relevant to the task, starting with the system
   overview.

`project.yaml.standard_version` wins. If it differs from this skill's
`metadata.standard_version`, read the exact version from the package instead:

```bash
npx --yes @jk-97/engineering-docs@<version> standard
```

Do not apply newer rules to an older project silently. If the pinned version
cannot be resolved, stop and ask; do not substitute this skill's copy for a
different version, and do not invent rules.

`PROCESS.md` is authoritative. Read only the sections you need:

| Section | Content |
| --- | --- |
| §1 | principles |
| §2 | document types |
| §3 | status |
| §4 | lifecycle |
| §5 | when to write which |
| §6 | design rules |
| §7 | proposal rules |
| §8 | decision rules (ADR) |
| §9 | record rules |
| §10 | report rules |
| §11 | reference rules |
| §12 | dates |
| §13 | directories, IDs, and naming |
| §14 | front matter |
| §15 | adoption and version |
| §16 | indexes |
| §17 | review |
| §18 | staleness and supersession |
| §19 | validation |

## Hard invariants

- **One fact, one home.** Link by ID; never copy the same fact into several
  documents.
- **Issues are work; documents are knowledge.** An implementation plan belongs
  to a proposal. Do not create plan, idea, backlog, original, or backup
  directories.
- **Generated files are not source.** `catalog.json` and `llms.txt` come from
  the CLI and are never edited by hand.
- **Never delete a merged document.** Supersede it with reciprocal
  `supersedes` / `superseded_by` links; git history is the archive.
- **Dates are evidence.** Unknown is `null`; never infer a date from filesystem
  metadata.
- **No secrets or raw customer data.** Summarize, aggregate, or redact.
- **English metadata, project-chosen prose.** Front matter keys, enums, IDs,
  commit hashes, and these instructions are English; document prose may use the
  project's language.

## Six document types

| Type | Question | Directory | Not for |
| --- | --- | --- | --- |
| `design` | How does the system work now? | `designs/` | roadmap, change history, option debates |
| `proposal` | Why change, to what, and how? | `proposals/` | current-state prose, completed change logs |
| `decision` | Which hard-to-reverse choice was made, and why? | `decisions/` | implementation steps, progress |
| `record` | What actually happened, with evidence? | `records/` | future plans, unverified guesses |
| `report` | What was measured, with what limits? | `reports/` | making the decision for the reader |
| `reference` | What does an external source say? | `references/` | this project's own conclusions |

Exactly these six types exist. Status is defined per type, not as one global
enum; see `PROCESS.md` §3. Create, normal, terminal/replaced, and review states
are in §4; supersession rules are in §18. Front matter keys and relations are
in §14; date evidence rules are in §12.

Body sections come from the CLI template. After `new`, read the created file
and fill its sections; do not hand-copy a template or invent an ID.

## Issue and proposal gate

A proposal is required when **any** of these is true (`PROCESS.md` §5):

- the change alters a design's `owns`, `does_not_own`, or `interfaces`;
- it affects two or more components;
- it needs a real trade-off, staged rollout, or rollback plan;
- it is expected to span more than one PR;
- it needs coordination across people or teams.

An Issue alone is enough for defects, copy changes, dependency updates, local
refactors, single-PR features, and scheduling when no trigger applies. An Issue
is not enough when a trigger applies, even if the work started as a defect or
looked like a single-PR change. Link the Issue from `proposal.issue`; do not
copy its text.

## Five-stage loop

1. **Idea** — a defect, task, or one-line idea goes to a GitHub Issue. A future
   idea with enough detail becomes a `status: deferred` proposal with a real
   `activation_trigger`.
2. **Plan** — a change gets a proposal when any gate trigger applies. Before
   `active`, the proposal needs an owner, a target design, an implementation
   plan, and verification.
3. **Implement** — merge the PR and update the target design in the same change
   so documentation does not lag behind code.
4. **Record** — write a record for cross-component, risky, or incident work and
   point the proposal at it. Small changes only update the design.
5. **Close** — fill the proposal's result, set it to `implemented`, link the
   merged PR or commit, close the Issue, then run `index` and `check`.

## Task workflow

1. **Confirm the root and version.** Read `project.yaml` for `id`, `prefix`,
   and `standard_version`. One root describes one project.
2. **Inspect before writing.**

   ```bash
   npx @jk-97/engineering-docs@1.0.0 --root docs context
   npx @jk-97/engineering-docs@1.0.0 --root docs list
   npx @jk-97/engineering-docs@1.0.0 --root docs search <query>
   ```

   Reuse or update an existing document before adding a near-duplicate.
3. **Apply the gate and route by intent.** Use the tables above and
   `PROCESS.md` §5.
4. **Scaffold with the CLI.** Do not invent an ID or hand-copy a template:

   ```bash
   npx @jk-97/engineering-docs@1.0.0 --root docs new \
     --type <type> --status <status> --title "<title>"
   ```

   Add `--activation-trigger "..."` for a deferred proposal, `--commit <sha>`
   for a record, and `--issue <number-or-url>` or `--design <DES-ID>` for a
   proposal when known.
5. **Write the document.** Fill every section in the created file. Use the
   project's prose language and English front matter keys, enums, IDs, and
   commit hashes. Update `updated` on each substantive edit; set
   `last_verified` only after checking code, documents, or commits.
6. **Date with evidence.** `created` and `completed` come from the document, a
   memo, a commit, or a PR; unknown is `null`; sources go in
   `created_source` / `completed_source`. Never use filesystem mtime and never
   write today's date as a historical completion date.
7. **Connect it.** Add existing `related` IDs and reciprocal
   `supersedes` / `superseded_by` links. Update the docs-root README when
   navigation changes; the README is optional.
8. **Generate and validate.**

   ```bash
   npx @jk-97/engineering-docs@1.0.0 --root docs index
   npx @jk-97/engineering-docs@1.0.0 --root docs check
   ```

   Fix source files until `check` passes. Treat warnings as review work; do not
   hand-edit generated files.
9. **Report.** State the document ID and path, whether an Issue or proposal
   owns the work, and the validation result.

## CLI

Pin the CLI to the project's `standard_version` and run it from the repository
root:

```bash
npx @jk-97/engineering-docs@1.0.0 --root docs <command>
```

If the package is installed in the project, the local `engdocs` binary is
equivalent:

```bash
engdocs --root docs <command>
```

`--root` may appear before or after the subcommand; `DOCS_ROOT=docs` is
equivalent. Replace `1.0.0` with the pinned version when the project declares
another one. A docs root contains documents only: the CLI, the standard, and
the templates are never copied into it.

| Command | Purpose |
| --- | --- |
| `init` | scaffold a docs root (run from the repository root; writes `docs/` only) |
| `context` | print the docs-root context |
| `list` | list documents; filter with `--type` and `--status` |
| `search <query>` | search metadata and body text |
| `show <ID>` | print one document |
| `new` | allocate an ID, render front matter, and render the type template |
| `index` | write `catalog.json` and `llms.txt`; `--check` reports drift |
| `check` | validate front matter, IDs, dates, links, supersession, indexes |
| `stale` | list documents with an old non-null `last_verified` |
| `archive <ID> --by <ID>` | write reciprocal supersession links |
| `install-skill` | install or refresh this skill and its `references/PROCESS.md`; `--repo <path>` targets a repository, `--force` reinstalls |
| `standard` | print the package's canonical `PROCESS.md` |

Exit codes: `0` valid, `1` validation or runtime failure, `2` bad command
usage. `check` warns when `standard_version` differs from the CLI version;
warnings do not fail the command.

## Audit mode

When asked to audit rather than edit:

1. Confirm the docs root and `standard_version`, and whether this installed
   skill has `references/PROCESS.md`. Report missing or drifted tooling first.
   A version-mismatch warning from `check` is expected when auditing a project
   pinned to another version.
2. Run `check`. The CLI prints warnings before errors; report errors first.
3. Run `index --check`; report drift instead of rewriting files.
4. Run `stale`. It only lists documents with a non-null `last_verified`; the
   90-day threshold is a reminder, and `PROCESS.md` §18 defines the formal
   design review cycle.
5. Look for type confusion, overlapping design `owns`, missing `does_not_own`,
   body sections that belong to another type, broken `related` or supersession
   reciprocity, proposals that should be Issues, forbidden paths, and
   hand-edited generated files.
6. Do not fix silently unless the user asked for fixes; report paths and IDs.

## References

- `references/PROCESS.md` — the standard copy generated by `install-skill` from
  the package. Do not edit it; refresh the skill to replace it.
- `npx --yes @jk-97/engineering-docs@<version> standard` — read-only accessor
  that prints the exact standard for a version. Use it when the project pins a
  version other than this skill's.
- `docs/project.yaml` — the project's metadata and pinned `standard_version`.

`PROCESS.md` is authoritative when this skill and the standard disagree.
