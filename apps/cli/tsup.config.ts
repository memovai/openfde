import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // bundle workspace packages into the artifact; keep native deps external
  noExternal: ["@openfde/core", "@openfde/ontology", "@openfde/webui"],
  external: ["better-sqlite3"],
  // the workspace UI ships as a static file next to the bundle
  async onSuccess() {
    await copyFile(
      resolve(__dirname, "../../packages/webui/src/index.html"),
      resolve(__dirname, "dist/index.html"),
    );
  },
});
