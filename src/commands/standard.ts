import { readFileSync } from "node:fs";

import { processFile } from "../config";
import { DocsError } from "../errors";

/** Print the package's canonical PROCESS.md bytes without touching any root. */
export function cmdStandard(): number {
  const file = processFile();
  if (file === null) {
    throw new DocsError("cannot locate PROCESS.md in the installed package");
  }
  let content: Buffer;
  try {
    content = readFileSync(file);
  } catch (error) {
    throw new DocsError(`cannot read ${file}: ${(error as Error).message}`);
  }
  process.stdout.write(content);
  return 0;
}
