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
export { buildDataMap, dataMapMarkdown, type DataSourceMap } from "./projections/datamap.js";
export {
  buildFlows,
  buildOverviewFlow,
  entityFlow,
  flowsMarkdown,
  type FlowDiagram,
} from "./projections/flows.js";
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

// canvas (free-form spatial cards per engagement)
export {
  addCanvasCard,
  canvasPath,
  readCanvas,
  writeCanvas,
  type CanvasCard,
  type CanvasData,
} from "./canvas/store.js";

// pages (free-form markdown documents, block-edited in the webui)
export {
  createPage,
  listPages,
  readPage,
  writePage,
  deletePage,
  pagesDir,
  type PageRef,
} from "./pages/store.js";

// assets + eval (the library: rubrics, prompts, eval cases, demos)
export {
  addAsset,
  listAssets,
  readAsset,
  appendEvalCase,
  assetStats,
  assetsDir,
  ASSET_TYPES,
  type AssetType,
  type AssetRef,
} from "./assets/store.js";
export {
  AnthropicJudge,
  MockJudge,
  verdictMarkdown,
  Verdict,
  type Judge,
} from "./eval/judge.js";

// demo briefs (demo-driven deployment)
export { buildDemoBrief, demoBriefMarkdown, type DemoBrief } from "./demo/brief.js";

// research (web search for methods)
export {
  WebResearcher,
  researchMarkdown,
  type ResearchResult,
  type ResearchSource,
} from "./research/web.js";

// interview (dot-line-plane guided sessions)
export {
  buildInterviewGuide,
  interviewMarkdown,
  type InterviewGuide,
  type InterviewMode,
  type InterviewSection,
} from "./interview/guide.js";

// report
export {
  buildReport,
  type ReportData,
  type PainPointReport,
  type AutomationReport,
  type ActivityEntry,
  type Evidence,
} from "./report/build.js";
export { reportMarkdown } from "./report/markdown.js";
