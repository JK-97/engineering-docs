/** Mutable run state shared by the configured commands. */

export type Mode = "single" | "empty";

export const state = {
  root: process.cwd(),
  templates: "",
  mode: "empty" as Mode,
  projectId: "",
  boundary: process.cwd(),
};
