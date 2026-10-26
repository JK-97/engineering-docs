import { runCheck } from "../validate";

/** Validate the configured docs root and report warnings and errors. */
export function cmdCheck(): number {
  return runCheck();
}
