import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["cjs"],
  target: "node20",
  platform: "node",
  bundle: true,
  clean: true,
  outDir: "dist",
  outExtension: () => ({ js: ".cjs" }),
  noExternal: ["yaml"],
  banner: { js: "#!/usr/bin/env node" },
});
