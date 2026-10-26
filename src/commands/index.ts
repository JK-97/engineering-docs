import { buildCatalog, buildLlms, indexIssues, writeIndexFiles } from "../catalog";
import { state } from "../state";
import { err } from "../util";
import type { IndexArgs } from "./types";

/** Generate or verify catalog.json and llms.txt. */
export function cmdIndex(args: IndexArgs): number {
  if (state.mode !== "single") {
    process.stdout.write("No project.yaml; nothing to index.\n");
    return 0;
  }
  if (args.check) {
    try {
      const catalog = buildCatalog();
      const llms = buildLlms(catalog);
      const issues = indexIssues(catalog, llms);
      if (issues.length > 0) {
        for (const message of issues) {
          err(message);
        }
        return 1;
      }
      process.stdout.write("catalog.json and llms.txt are up to date.\n");
      return 0;
    } catch (error) {
      err((error as Error).message);
      return 1;
    }
  }
  try {
    const catalog = buildCatalog();
    const llms = buildLlms(catalog);
    writeIndexFiles(catalog, llms);
    const docCount = ((catalog.projects as Record<string, unknown>[]) ?? []).reduce(
      (sum, project) => sum + (((project.docs as unknown[]) ?? []).length),
      0,
    );
    process.stdout.write(
      `Wrote catalog.json and llms.txt (1 project, ${docCount} documents).\n`,
    );
    return 0;
  } catch (error) {
    err((error as Error).message);
    return 1;
  }
}
