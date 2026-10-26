# Engineering Documentation Standard and Process

This document is the authoritative, project-agnostic standard for engineering
documentation. It defines the document types, their rules, and the workflow that
keeps a project's design knowledge current.

A project uses exactly one docs root, by convention `<repo>/docs/`, and describes
its system with six document types. Work items, defects, ideas, and schedules
live in GitHub Issues. An implementation plan belongs to a proposal.

The standard is versioned with the `@jk-97/engineering-docs` package. A project
pins the version it follows in `project.yaml` (`standard_version`) and reads the
exact text of that version with the package's `standard` command (Section 15).
This standard takes precedence over project-local conventions.

## 1. Principles

1. **One source of truth.** Every fact has one authoritative home; other
   documents link to it by ID. The standard itself has one source, the
   `PROCESS.md` published in the pinned `@jk-97/engineering-docs` release; a
   project does not keep a second authoritative copy.
2. **Documents describe state; Issues describe work.** The repository does not
   maintain a backlog, priorities, or schedules.
3. **Design writes the present; proposal writes the future.** An implementation
   plan belongs to a proposal; there is no separate plan document.
4. **History is immutable.** Express obsolescence with `superseded`; do not
   delete or rewrite merged documents.
5. **Dates are evidence.** Unknown is `null`; never infer a date from filesystem
   metadata.
6. **English metadata, project-chosen prose.** Front matter keys, enums, IDs,
   commit hashes, and the templates are English. Document prose may use the
   project's language.
7. **No secrets or raw customer data.** Summarize, aggregate, or redact.
8. **Generated artifacts are not sources.** `catalog.json` and `llms.txt` are
   produced by the CLI and never edited by hand. The same applies to any
   generated copy of this standard.

## 2. Document Types

| type | Answers | Content | Not for |
| --- | --- | --- | --- |
| `design` | How does the system work now? | boundaries, components, interfaces, data flow, failure modes | roadmap, change history, option debates |
| `proposal` | Why change, to what, and how? | motivation, goals and non-goals, options, impact, implementation plan | current-state prose, completed change logs |
| `decision` | Which hard-to-reverse choice was made, and why? | context, options, conclusion, consequences | implementation steps, progress |
| `record` | What actually happened, with evidence? | change, key decisions, commits, verification, impact | future plans, unverified guesses |
| `report` | What was measured, with what limits? | method, results, findings, limitations, recommendations | making the decision for the reader |
| `reference` | What does an external source say? | source, summary, key points, excerpts, when to read | this project's own conclusions |

The standard has exactly these six types. There is no plan, idea, or backlog
type.

## 3. Status

Status is defined per type, not as one global enum. `check` enforces the allowed
values for each type.

| type | status | Meaning |
| --- | --- | --- |
| `design` | `draft` | being written or not yet verified; not a basis for implementation |
| `design` | `active` | current and authoritative description of the system |
| `design` | `superseded` | replaced by a newer design |
| `proposal` | `draft` | being drafted; not yet reviewed |
| `proposal` | `active` | accepted and scheduled or in progress |
| `proposal` | `deferred` | intentionally paused; `activation_trigger` is required |
| `proposal` | `rejected` | reviewed and declined |
| `proposal` | `withdrawn` | withdrawn by the author |
| `proposal` | `implemented` | landed and the target design is updated |
| `proposal` | `superseded` | replaced by a newer proposal |
| `decision` | `proposed` | proposed; not yet binding |
| `decision` | `accepted` | decided and binding on future work |
| `decision` | `superseded` | replaced by a newer decision |
| `record` | `implemented` | the recorded change is complete and evidenced |
| `report` | `reference` | research is complete and retained as reference |
| `reference` | `reference` | the external snapshot is current |
| `reference` | `superseded` | replaced by a newer snapshot |

## 4. Lifecycle

### 4.1 Development Loop

The loop has five stages: **idea** (Issue or deferred proposal) -> **plan**
(proposal) -> **implement** (PR and design update) -> **record** (record) ->
**close** (proposal `implemented`, Issue closed). The next round starts with a
new Issue.

```text
GitHub Issue (defect / small change / work item)
  |
  +-- one PR is enough --> PR --> update design if the present changed --> record (optional)
  |
  +-- design change needed
        |
        v
  proposal: draft --> active --> implemented
              |          |
              +--> deferred --> active (trigger met)
              +--> rejected
              +--> withdrawn
              +--> superseded (replaced by a newer proposal)

implemented --> update design (same change) --> record (cross-component or risky)
```

1. Work starts with an Issue. Defects, small changes, and scheduling stay in
   Issues and do not need a proposal.
2. A proposal must have an owner, a target design, an implementation plan, and
   verification before it becomes `active`.
3. Implementation lands through a PR; update the target design in the same PR or
   Issue so documentation does not lag behind code.
4. After landing, fill the proposal's result, set it to `implemented`, and link
   the merged PR/commit.
5. Write a record when the evidence is worth keeping long-term; point the
   proposal at it. Small changes only update the design.
6. Close the Issue after the code is merged and the design is updated.
7. A decision can be written at any stage; if it constrains implementation, it
   must be `accepted` before implementation starts.
8. Reports and references may precede a proposal or decision.

### 4.2 Document Lifecycle

| type | Create | Normal flow | Terminal/replaced | Review |
| --- | --- | --- | --- | --- |
| `design` | `draft` | `draft` -> `active` | `superseded` (replaced by a newer design) | every 6 months or after a major code change; update `last_verified` |
| `proposal` | `draft` | `draft` -> `active` -> `implemented`; `draft`/`active` -> `deferred` -> `active` | `rejected`, `withdrawn`, `superseded` | `active` with no progress for 90 days -> `deferred`/`rejected`/`withdrawn` |
| `decision` | `proposed` | `proposed` -> `accepted` | `superseded` (replaced by a newer decision) | never rewrite an `accepted` decision; write a new one |
| `record` | `implemented` | `implemented` (terminal) | not superseded; correct with a new record or an errata note | no expiry |
| `report` | `reference` | `reference` (terminal) | not superseded; create a new report and cross-link when findings change | re-check sources when cited |
| `reference` | `reference` | `reference` | `superseded` (replaced by a newer snapshot) | re-check when the source changes |

- Terminal states do not move backward; merged documents are never deleted.
- Supersession is reciprocal: the new document lists `supersedes`, and the old
  document has `status: superseded` and `superseded_by`. See Section 18.
- `record` and `report` are historical and are not superseded. A merged
  `proposed` decision is either accepted or replaced by a new decision.
- The 90-day threshold used by `check` and `stale` is a reminder. The formal
  design review cycle is 6 months; an active proposal with no progress for 90
  days must be closed or deferred.

## 5. When to Write Which

| Situation | Action |
| --- | --- |
| Describe how the system works now | update or create a design |
| Change behavior across components, interfaces, or trade-offs | open an Issue and write a proposal |
| Defect, copy change, dependency update, one-PR change | Issue only; update the design if the present changed |
| Incident or failure handling | track in an Issue; write a record afterwards |
| Hard-to-reverse choice between options | write a decision |
| Investigation, benchmark, or option comparison | write a report |
| External spec, third-party document, long prompt | store a reference |
| One-line idea | open an Issue |
| Future idea with enough detail but not scheduled | write a `status: deferred` proposal |
| Backlog, priorities, schedule | GitHub Issue / milestone |

Write a proposal when any of these is true:

- the change alters a design's `owns`, `does_not_own`, or `interfaces`;
- it affects two or more components;
- it needs a real trade-off, staged rollout, or rollback plan;
- it is expected to span more than one PR;
- it needs coordination across people or teams.

The Issue is the execution unit; the proposal is the design basis. Link them
with `proposal.issue`; do not copy the Issue text.

## 6. Design Rules

- One design per bounded context: a boundary driven by the same business
  concepts and change cadence, not a code directory, team, or release.
- `scope` states the boundary in one sentence; `owns` lists the concepts and
  modules it is responsible for; `does_not_own` explicitly lists adjacent
  concerns it does not own. Use `[]` when there is no adjacent boundary and
  explain why in the body.
- `interfaces` lists external contracts (APIs, files, events, protocols) and
  links the corresponding design or reference.
- `parent` expresses context hierarchy; a child design does not repeat the
  parent's prose.
- `implementation` is `none`, `partial`, or `complete`. `partial` must name the
  gaps under "Known limitations"; do not rely on status alone.
- The body contains only the present and failure modes: no roadmap, no change
  log, no option debate.
- Describe a boundary change in a proposal first; update the design after the
  change lands.
- Split signal: when `owns` contains two nouns that evolve independently and are
  driven by different changes, split the design.

## 7. Proposal Rules

- A proposal is the only home for "future change + implementation plan". It
  contains summary, motivation, goals, non-goals, proposal, alternatives,
  cross-cutting impact, implementation plan, activation trigger, open questions,
  and result.
- `draft` is ideation; `active` is accepted and scheduled; `deferred` requires
  `activation_trigger`; `rejected`/`withdrawn` keep the reason; `implemented`
  fills the result and updates the design; `superseded` points at the successor.
- `issue` links a GitHub Issue; one proposal may cover several Issues/PRs.
- `design` points at the design being changed; use `null` for a new context and
  create the design after landing.
- Write the implementation plan at milestone or step level with verification.
- Revise the proposal during implementation. After completion, record any
  deviation in the result section or a record.
- Conditions for `implemented`: code merged, target design updated, result
  filled.

## 8. Decision Rules (ADR)

- Record only choices that are hard or expensive to reverse; keep reversible
  choices in the proposal or PR.
- Write `options` (at least two, including "do nothing"), a one-sentence
  `decision`, and `consequences` (positive and negative).
- Never rewrite the body after `accepted`. Change direction with a new decision:
  mark the old one `superseded` and fill `superseded_by`.
- A decision does not contain implementation steps; link the proposal or record.
- Number decisions per project; do not reuse a number.

## 9. Record Rules

- Record what actually happened: important features, cross-component changes,
  incidents, or failure handling.
- Include the change, key implementation decisions, commits, verification
  (tests/real-machine/metrics), and impact (behavior, performance, operations,
  compatibility). Empty required sections are review work; `check` warns.
- Use the facts at the time. Do not copy proposal steps or write unverified
  guesses.
- After completion, only append an "Errata" section; do not rewrite the
  original. Use a new record or an errata note when something was wrong.
- Do not write a record for a small change. One change, one record; related
  changes may be combined into one initiative if commits and evidence are
  complete.

## 10. Report Rules

- Research, comparison, benchmark, or field notes answer "what did we measure?".
- Include `method`, `findings`, and `limitations`. Conclusions may guide a
  proposal or decision but do not replace them.
- Put data and screenshots under the project's `assets/` and link them
  relatively; do not paste large raw logs.
- A report's only status is `reference`. When findings are overturned, create a
  new report, cross-link both in `related`, and mark the old report at the top as
  corrected.

## 11. Reference Rules

- A read-only snapshot of an external spec, third-party document, long prompt,
  or design draft; `read_when` says when to read it.
- Keep the source URL, version, and date; quote key passages without changing
  the meaning.
- Put this project's conclusions in a design, proposal, or decision, not in a
  reference.
- When the source changes, create a new snapshot and supersede the old one.

## 12. Dates

Dates use ISO `YYYY-MM-DD`; unknown is `null`.

| Field | Rule |
| --- | --- |
| `created` | the document's stated creation/decision date or first commit date |
| `created_source` | source when `created` is non-null, for example `meeting notes <date>` or `commit <sha>` |
| `completed` | final date: implementation merge, proposal closure, decision, or research completion |
| `completed_source` | source when `completed` is non-null, for example `PR <number>` or `commit <sha>` |
| `updated` | the date of the current substantive edit; update it every time |
| `last_verified` | the date code, documents, or commits were checked; unchecked is `null` |

- **Never use filesystem mtime.** `stat`, `ls -l`, and Finder dates are not
  evidence.
- Git commit dates are allowed; file copy and download times are not.
- Do not write today's date as a historical completion date. A new design may
  use today as `created`, but `completed` stays `null`.
- Fill `created_source`/`completed_source` only when the corresponding date is
  non-null, using a short phrase.

## 13. Directories, IDs, and Naming

```text
<docs-root>/                  # convention: <repo>/docs/
  project.yaml                # project profile and standard pin
  README.md                   # optional entry point
  designs/
  proposals/
  decisions/
  records/
  reports/
  references/
  assets/
  catalog.json                # generated, schema_version 2
  llms.txt                    # generated reading entry
```

A complete root contains `project.yaml`, the six type directories, and
`assets/`; `README.md` is optional. `catalog.json` and `llms.txt` are generated
and appear after the first `index` run. There is no `tools/` directory and no
copy of this standard, the CLI, or the templates.

- ID format: `<PREFIX>-<TYPE>-<NNN>`; `TYPE` is `DES`, `PROP`, `ADR`, `REC`,
  `RPT`, or `REF`; `NNN` is at least three digits.
- Numbers increment per project and type. `000` is reserved and must not be used
  for a project document; real documents start at `001`. `check` rejects `000`.
  Do not reuse or renumber.
- Document filenames are ASCII kebab-case, describe the topic, and need not
  match the ID. One document, one file.
- Images and data go under `<docs-root>/assets/` in topic subdirectories and are
  linked relatively.
- Forbidden under the docs root: `plans/`, `ideas/`, `backlog.md`, `originals/`,
  `backup/`, `*.bak`, and `tools/`. This rule applies only inside the docs root;
  a `tools/` directory elsewhere in the repository is unaffected.
- Do not write secrets, credentials, or raw customer data; redact or aggregate.
- Do not copy old or external documents wholesale; rewrite into a standard type
  and put the source in a reference or a date source.
- Do not delete merged documents. Express errors, obsolescence, and replacement
  through `superseded` and links.
- `catalog.json` and `llms.txt` are generated artifacts; they are not documents
  and carry no IDs.

Replacement locations:

| Content | Correct home |
| --- | --- |
| Implementation plan, milestones | the proposal's implementation plan |
| Ideas, backlog, schedule | GitHub Issue; a detailed future idea may become a deferred proposal |
| Raw copies, historical backups | not kept; git history is the archive |
| Full old versions | not kept; use `supersedes`/`superseded_by` links |

## 14. Front Matter

Common keys:

| Key | Required | Meaning |
| --- | --- | --- |
| `id` | yes | `<PREFIX>-<TYPE>-<NNN>` |
| `project` | yes | project id from `project.yaml` |
| `type` | yes | one of the six types |
| `status` | yes | valid for the type |
| `title` | yes | human-readable title |
| `summary` | yes | one sentence |
| `created` | yes | ISO date or `null` |
| `completed` | yes | ISO date or `null` |
| `updated` | yes | ISO date or `null` |
| `last_verified` | yes | ISO date or `null` |
| `owner` | yes | responsible person |
| `related` | yes | list of existing IDs (or `[]`) |
| `supersedes` | yes | `null`, an ID, or a list |
| `superseded_by` | yes | `null`, an ID, or a list |
| `created_source` | when `created` is non-null | short evidence phrase |
| `completed_source` | when `completed` is non-null | short evidence phrase |

Type-specific keys:

| Type | Keys |
| --- | --- |
| `design` | `parent` (design ID or null), `scope`, `owns`, `does_not_own`, `interfaces`, `implementation` (`none`, `partial`, `complete`) |
| `proposal` | `issue` (number, URL, or null), `design` (design ID or null), `activation_trigger` (required when `deferred`) |
| `decision` | `options`, `decision`, `consequences` |
| `record` | `commits`, `proposal` (proposal ID or null), `evidence` |
| `report` | `method`, `findings`, `limitations` |
| `reference` | `read_when` |

Rules:

- Lists are YAML lists, not comma-separated strings.
- Dates follow Section 12; unknown is `null`.
- `project` equals `project.yaml.id`.
- `commits` entries are 7-40 character git SHAs. Quote an all-numeric short SHA
  (for example `"1234567"`) so YAML keeps it as text.
- `evidence` entries are test commands, links, reports, or other verifiable
  pointers.
- `options`, `consequences`, `findings`, `limitations`, and `read_when` should be
  non-empty for a finished document; `check` warns when they are empty.
- `owns` and `does_not_own` must not overlap; `implementation` is one of the
  three enum values.
- `decision` states the chosen option in one sentence; `summary` is one
  sentence and must not be empty.
- `parent`, `design`, and `proposal` reference the correct type or are `null`.
- `related` IDs must exist; supersession must be reciprocal and acyclic.

## 15. Adoption and Version

### Adoption

- One project uses one docs root, by convention `<repo>/docs/`. A complete root
  contains `project.yaml`, an optional `README.md`, the six type directories,
  `assets/`, and the generated `catalog.json` and `llms.txt`.
- The CLI requires Node.js 20+. Run the pinned package directly:
  `npx @jk-97/engineering-docs@<version> <command>`. Alternatively, add it as an
  exact devDependency
  (`npm install --save-dev --save-exact @jk-97/engineering-docs@<version>`) and
  run `npx engdocs <command>`.
- `init` writes only project documentation: `project.yaml`, `README.md`, a draft
  `designs/system-overview.md`, the six type directories, and `assets/`. It does
  not copy the CLI, this standard, or the templates into the docs root. It
  refuses an existing `project.yaml`; a non-empty root requires `--force`, and
  existing files are never overwritten. It sets `standard_version` to its own
  package version.
- `project.yaml` declares at least `id`, `name`, `prefix`, `summary` (one
  sentence), `status`, `owner`, `standard_version`, `created`, and `updated`.
  `id` is lowercase kebab-case; `prefix` is 2-6 uppercase letters or digits,
  starting with a letter; `standard_version` is the exact semantic version
  pinned. Other keys are project-maintained.
- The document ID prefix comes from `project.yaml.prefix` and is unique within
  the project. Each document's `project` equals `project.yaml.id`.
- `docs/README.md` is an optional entry point: project scope, preferred design,
  and a type-based index. Navigation may also live in the repository README.
- One docs root describes exactly one project; do not add project lists,
  aggregate catalogs, or cross-project indexes.
- Projects may add local conventions but must not violate this standard.
- Minimum for a new root: `project.yaml`, at least one `active` design, and
  regenerated indexes. `init` creates only a draft overview; complete it and set
  it to `active`.
- Validate the root in CI with the pinned version (Section 19) before merging.

### Version and Upgrade

- The standard uses semantic versioning. The `@jk-97/engineering-docs` package
  version is the single source for the standard version.
- `standard_version` in `project.yaml` is the pin. It must be an exact semantic
  version such as `1.0.0`, not a range. A project does not follow the latest
  release automatically.
- `standard` prints the `PROCESS.md` shipped with the invoked package version,
  byte for byte. It is read-only: it writes no files, needs no docs root, and
  does not touch indexes. Read the exact pinned standard with:

  ```bash
  npx @jk-97/engineering-docs@<version> standard
  ```

- With the package installed as a devDependency, `npx engdocs standard` prints
  the installed version.
- Do not keep a copy of this standard in the docs root. An installed
  `project-docs` skill may contain a generated `references/PROCESS.md`; that copy
  is an artifact and is never authoritative.
- Upgrading is explicit:
  1. Read the difference between the pinned and target versions with `standard`
     at both versions.
  2. Update `standard_version` to the target exact version.
  3. Regenerate indexes and run `check` with the target version.
  4. State the reason and impact in the PR.
- There are no copied files to refresh during an upgrade.
- CI validates with the pinned version. Running a newer package as a preview may
  report a version-mismatch warning; the pin changes only through the steps
  above.
- Changes to types, required fields, status sets, or the generated-index schema
  are breaking and require a major version and migration notes.

## 16. Indexes

- `catalog.json` and `llms.txt` are generated from front matter at the docs
  root; `catalog.json` uses `schema_version: 2`.
- **Never hand-edit generated files.** They are not authoritative; source
  documents are. On conflict, fix the documents and regenerate.
- Regenerate after changing an ID, path, title, summary, status, or project
  profile.
- Fix source documents when generation fails; do not bypass validation with
  hand-written entries.
- `llms.txt` is a reading entry, not a replacement for this standard, designs,
  or Issues.

## 17. Review

- All document changes go through a PR; one PR makes one kind of logical change.
  Link the related Issue, proposal, or record.
- State changes need evidence: `proposal` -> `active` needs an owner, target
  design, and implementation plan; -> `implemented` needs a merge record and
  design update; `decision` -> `accepted` needs options and consequences.
- A design change links the Issue, proposal, or record that triggered it. Record
  commits are at least 7 characters and must be resolvable during review.
- Mechanical checks are in Section 19; review focuses on one fact one home,
  state evidence, and cross-document consistency.
- A `standard_version` change is reviewed as an explicit upgrade (Section 15).
- Do not merge a PR that violates Section 13, fabricates dates, includes
  unmarked raw copies, or hand-edits generated files.

## 18. Staleness and Supersession

- Review a design every 6 months or after a major code change; update
  `last_verified` only after verification, otherwise keep it `null`.
- An `active` proposal with no progress for 90 days should become `deferred`,
  `rejected`, or `withdrawn`, with the reason in the body.
- Re-check reports and references when cited; supersede an outdated reference
  with a new snapshot.
- Records do not expire; correct errors with an errata note or a new record
  without rewriting history.
- Supersession is reciprocal: the new document has `supersedes: <old ID>`; the
  old document has `status: superseded` and `superseded_by: <new ID>`.
- Only an unmerged mistaken file may be deleted; merged documents are kept.
- `check` and `stale` use 90 days as a reminder. The formal design review cycle
  is 6 months; the 90-day proposal rule is about progress, not `last_verified`.

## 19. Validation

Run the pinned standard's validation before merging. From the repository root:

```bash
npx @jk-97/engineering-docs@1.0.0 --root docs index --check
npx @jk-97/engineering-docs@1.0.0 --root docs check
```

Replace `1.0.0` with the project's `standard_version`. When the package is an
exact devDependency, the local binary is equivalent:
`npx engdocs --root docs index --check` and `npx engdocs --root docs check`.

Print the standard used by that pin with
`npx @jk-97/engineering-docs@1.0.0 standard`. Do not validate with a CLI copied
into the repository; the docs root contains none.

Validation covers at least:

- parseable front matter and a valid project profile;
- a valid type and a status allowed for that type;
- unique, well-formed IDs that match the project prefix;
- valid ISO dates or `null`;
- existing related and supersession targets, with reciprocal and acyclic
  supersession;
- required type-specific fields and enum values;
- no forbidden paths and no escaped relative links;
- regenerable indexes that match the documents.

`check` treats a missing `standard_version` as a warning, a non-semantic version
as an error, and a pin that differs from the running package as a warning.
Warnings do not fail the command; errors do.

Exit codes: `0` valid, `1` validation or runtime failure, `2` usage error. Do
not merge when `check` or `index --check` fails. Projects may add local checks
but must not weaken these.
