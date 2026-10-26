import { cmdArchive } from "./commands/archive";
import { cmdCheck } from "./commands/check";
import { cmdIndex } from "./commands/index";
import { cmdInit } from "./commands/init";
import { cmdNew } from "./commands/new";
import {
  cmdContext,
  cmdList,
  cmdSearch,
  cmdShow,
  cmdStale,
} from "./commands/query";
import { cmdInstallSkill } from "./commands/skill";
import { cmdStandard } from "./commands/standard";
import { configure } from "./config";
import { FRAMEWORK_VERSION, PROGRAM_NAME } from "./constants";
import { DocsError, UsageError } from "./errors";
import { err, resolveRoot } from "./util";

const COMMANDS = [
  "init",
  "context",
  "list",
  "search",
  "show",
  "new",
  "index",
  "check",
  "stale",
  "archive",
  "install-skill",
  "standard",
] as const;

type Command = (typeof COMMANDS)[number];

type RootCommand = Exclude<Command, "init" | "install-skill" | "standard">;

type FlagKind = "string" | "number" | "boolean" | "append";

interface Parsed {
  flags: Record<string, string | number | boolean | string[]>;
  positionals: string[];
}

function extractRoot(argv: string[]): { tokens: string[]; root?: string } {
  const tokens: string[] = [];
  let root: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--root") {
      if (index + 1 >= argv.length) {
        throw new UsageError("--root requires a directory");
      }
      root = argv[index + 1];
      index += 1;
      continue;
    }
    if (item.startsWith("--root=")) {
      root = item.slice("--root=".length);
      if (!root) {
        throw new UsageError("--root requires a directory");
      }
      continue;
    }
    tokens.push(item);
  }
  return { tokens, root };
}

function parseFlags(
  tokens: string[],
  spec: Record<string, FlagKind>,
): Parsed {
  const flags: Parsed["flags"] = {};
  const positionals: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--") {
      positionals.push(...tokens.slice(index + 1));
      break;
    }
    if (!token.startsWith("--")) {
      if (token.startsWith("-") && token !== "-") {
        throw new UsageError(`unrecognized arguments: ${token}`);
      }
      positionals.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    const name = equals >= 0 ? token.slice(2, equals) : token.slice(2);
    const kind = spec[name];
    if (!kind) {
      throw new UsageError(`unrecognized arguments: ${token}`);
    }
    if (kind === "boolean") {
      if (equals >= 0) {
        throw new UsageError(`unexpected value for --${name}`);
      }
      flags[name] = true;
      continue;
    }
    let value: string;
    if (equals >= 0) {
      value = token.slice(equals + 1);
    } else {
      if (index + 1 >= tokens.length) {
        throw new UsageError(`--${name} requires a value`);
      }
      value = tokens[index + 1];
      index += 1;
    }
    if (kind === "number") {
      const number = Number(value);
      if (!Number.isInteger(number)) {
        throw new UsageError(`--${name} must be an integer`);
      }
      flags[name] = number;
    } else if (kind === "append") {
      const existing = Array.isArray(flags[name]) ? (flags[name] as string[]) : [];
      flags[name] = [...existing, value];
    } else {
      flags[name] = value;
    }
  }
  return { flags, positionals };
}

function requirePositional(parsed: Parsed, index: number, label: string): string {
  const value = parsed.positionals[index];
  if (value === undefined) {
    throw new UsageError(`the following arguments are required: ${label}`);
  }
  return value;
}

function expectPositionals(parsed: Parsed, count: number): void {
  if (parsed.positionals.length > count) {
    throw new UsageError(
      `unrecognized arguments: ${parsed.positionals.slice(count).join(" ")}`,
    );
  }
  if (parsed.positionals.length < count) {
    throw new UsageError("missing required argument");
  }
}

function printUsage(): void {
  process.stdout.write(`usage: engineering-docs [-h] [--root DIR] [--version]
                        {${COMMANDS.join(",")}} ...

Create, inspect, index, and validate engineering documentation
(design/proposal/decision/record/report/reference).

positional arguments:
  {${COMMANDS.join(",")}}
    init                scaffold a docs root (project.yaml, README, draft overview)
    context             print docs-root context
    list                list documents
    search              search document text
    show                print a document
    new                 scaffold a document
    index               generate catalog.json and llms.txt
    check               validate the documentation root
    stale               list stale documents
    archive             mark a document superseded
    install-skill       install the project-docs skill
    standard            print the package's PROCESS.md

options:
  -h, --help            show this help message and exit
  --root DIR            documentation root (default: DOCS_ROOT or the current directory)
  --version             print the CLI version and exit
`);
}

function runCommand(command: RootCommand, tokens: string[]): number {
  switch (command) {
    case "context": {
      const parsed = parseFlags(tokens, {});
      expectPositionals(parsed, 0);
      return cmdContext({});
    }
    case "list": {
      const parsed = parseFlags(tokens, { type: "string", status: "string" });
      expectPositionals(parsed, 0);
      return cmdList({
        type: parsed.flags.type as string | undefined,
        status: parsed.flags.status as string | undefined,
      });
    }
    case "search": {
      const parsed = parseFlags(tokens, { limit: "number" });
      expectPositionals(parsed, 1);
      const query = requirePositional(parsed, 0, "query");
      return cmdSearch({
        query,
        limit: parsed.flags.limit as number | undefined,
      });
    }
    case "show": {
      const parsed = parseFlags(tokens, {});
      expectPositionals(parsed, 1);
      return cmdShow({ id: requirePositional(parsed, 0, "id") });
    }
    case "new": {
      const parsed = parseFlags(tokens, {
        type: "string",
        status: "string",
        title: "string",
        summary: "string",
        slug: "string",
        owner: "string",
        related: "string",
        parent: "string",
        issue: "string",
        design: "string",
        "activation-trigger": "string",
        commit: "append",
      });
      expectPositionals(parsed, 0);
      const missing = ["type", "status", "title"].filter(
        (key) => parsed.flags[key] === undefined,
      );
      if (missing.length > 0) {
        throw new UsageError(
          `the following arguments are required: ${missing.map((key) => `--${key}`).join(", ")}`,
        );
      }
      return cmdNew({
        type: parsed.flags.type as string,
        status: parsed.flags.status as string,
        title: parsed.flags.title as string,
        summary: parsed.flags.summary as string | undefined,
        slug: parsed.flags.slug as string | undefined,
        owner: parsed.flags.owner as string | undefined,
        related: parsed.flags.related as string | undefined,
        parent: parsed.flags.parent as string | undefined,
        issue: parsed.flags.issue as string | undefined,
        design: parsed.flags.design as string | undefined,
        activationTrigger: parsed.flags["activation-trigger"] as string | undefined,
        commit: parsed.flags.commit as string[] | undefined,
      });
    }
    case "index": {
      const parsed = parseFlags(tokens, { check: "boolean" });
      expectPositionals(parsed, 0);
      return cmdIndex({ check: Boolean(parsed.flags.check) });
    }
    case "check": {
      const parsed = parseFlags(tokens, {});
      expectPositionals(parsed, 0);
      return cmdCheck();
    }
    case "stale": {
      const parsed = parseFlags(tokens, { days: "number" });
      expectPositionals(parsed, 0);
      return cmdStale({ days: parsed.flags.days as number | undefined });
    }
    case "archive": {
      const parsed = parseFlags(tokens, { by: "string" });
      expectPositionals(parsed, 1);
      const id = requirePositional(parsed, 0, "id");
      const by = parsed.flags.by;
      if (by === undefined) {
        throw new UsageError("the following arguments are required: --by");
      }
      return cmdArchive({ id, by: by as string });
    }
  }
}

export function main(argv: string[] = process.argv.slice(2)): number {
  try {
    const { tokens, root } = extractRoot(argv);
    if (tokens.includes("--version")) {
      process.stdout.write(`${PROGRAM_NAME} ${FRAMEWORK_VERSION}\n`);
      return 0;
    }
    if (tokens.includes("--help") || tokens.includes("-h")) {
      printUsage();
      return 0;
    }
    if (tokens.length === 0) {
      process.stderr.write(
        `usage: ${PROGRAM_NAME} [-h] [--root DIR] [--version] <command> ...\n`,
      );
      return 2;
    }
    const command = tokens[0];
    if (!(COMMANDS as readonly string[]).includes(command)) {
      throw new UsageError(`invalid choice: ${command}`);
    }
    const rest = tokens.slice(1);
    if (command === "init") {
      const parsed = parseFlags(rest, {
        id: "string",
        name: "string",
        prefix: "string",
        owner: "string",
        summary: "string",
        force: "boolean",
      });
      expectPositionals(parsed, 0);
      return cmdInit({
        root: root ?? undefined,
        id: parsed.flags.id as string | undefined,
        name: parsed.flags.name as string | undefined,
        prefix: parsed.flags.prefix as string | undefined,
        owner: parsed.flags.owner as string | undefined,
        summary: parsed.flags.summary as string | undefined,
        force: Boolean(parsed.flags.force),
      });
    }
    if (command === "install-skill") {
      const parsed = parseFlags(rest, { repo: "string", force: "boolean" });
      expectPositionals(parsed, 0);
      return cmdInstallSkill({
        repo: parsed.flags.repo as string | undefined,
        force: Boolean(parsed.flags.force),
      });
    }
    if (command === "standard") {
      const parsed = parseFlags(rest, {});
      expectPositionals(parsed, 0);
      return cmdStandard();
    }
    configure(resolveRoot(root ?? undefined));
    return runCommand(command as RootCommand, rest);
  } catch (error) {
    if (error instanceof UsageError) {
      err(error.message);
      return 2;
    }
    if (error instanceof DocsError) {
      err(error.message);
      return 1;
    }
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "EPIPE") {
      return 0;
    }
    err((error as Error).message);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}
