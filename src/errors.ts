/** Recoverable documentation and command-line errors. */

export class DocsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocsError";
  }
}

export class UsageError extends DocsError {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}
