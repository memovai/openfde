/**
 * @openfde/webui — the optional local workspace: a node:http server rendering
 * the ledger's projections (markdown notes, force graph, executive report).
 * Launched by `openfde serve`; the CLI never depends on it being running.
 */
export { serve, type ServeOptions } from "./server.js";
