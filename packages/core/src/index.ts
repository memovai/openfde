/**
 * @openfde/core — the engagement ledger and everything that grows on it.
 *
 * Module map (mirrors ARCHITECTURE.md):
 *   engagement/  one local directory per customer project
 *   ledger/      memory engine: episodes -> extraction -> resolution -> recall
 *   extraction/  ontology-constrained extractors (LLM + offline mock)
 *   dispatch/    agent-pull task cards, state machine, context bundles
 *   report/      executive projections of the ledger
 */

// engagement
export {
  createEngagement,
  listEngagements,
  useEngagement,
  resolveEngagement,
} from "./engagement/store.js";
export * as paths from "./engagement/paths.js";

// ledger
export { openLedger, newId, nowIso, type Ledger } from "./ledger/database.js";
export {
  ingestEpisode,
  runExtraction,
  type IngestInput,
  type ExtractionStats,
} from "./ledger/ingest.js";
export { resolveEntity, resolveFact } from "./ledger/resolve.js";
export { recall, type RecallHit, type RecallOptions } from "./ledger/recall.js";

// extraction
export { AnthropicExtractor } from "./extraction/anthropic.js";
export { MockExtractor } from "./extraction/mock.js";
export type { Extractor, EpisodeInput } from "./extraction/extractor.js";

// dispatch
export {
  createTask,
  getTask,
  listTasks,
  taskEvents,
  transitionTask,
  addTaskNote,
  TASK_STATUSES,
  type TaskRow,
  type TaskStatus,
  type TaskEvent,
} from "./dispatch/tasks.js";
export {
  buildTaskContext,
  contextMarkdown,
  type TaskContext,
} from "./dispatch/context.js";

// projections (markdown views of the ledger — shared by webui and future export)
export {
  loadTree,
  entityNote,
  episodeNote,
  taskNote,
  resolveEntityByName,
  type TreeSection,
  type TreeGroup,
  type TreeItem,
} from "./projections/notes.js";

// report
export {
  buildReport,
  type ReportData,
  type PainPointReport,
  type AutomationReport,
  type Evidence,
} from "./report/build.js";
export { reportMarkdown } from "./report/markdown.js";
