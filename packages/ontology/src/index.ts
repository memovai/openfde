/**
 * The FDE domain ontology — single source of truth for the whole system.
 * LLM structured-output schemas, SQLite persistence, and CLI/UI types all
 * derive from this package. Changing the ontology means changing these
 * files; parallel definitions elsewhere are not allowed.
 */
export * from "./entities.js";
export * from "./relations.js";
export * from "./episodes.js";
export * from "./extraction.js";
