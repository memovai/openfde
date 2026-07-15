import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // bundle workspace packages into the artifact; keep native deps external
  noExternal: ["@openfde/core", "@openfde/ontology"],
  external: ["better-sqlite3"],
  // the graph UI ships as a static file next to the bundle
  onSuccess: "cp src/serve/index.html dist/",
});
