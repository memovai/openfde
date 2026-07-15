import { z } from "zod";

/**
 * The FDE domain ontology — single source of truth for the whole system.
 * LLM structured-output schemas, SQLite persistence, and CLI/UI types all
 * derive from this file. Changing the ontology means changing this file;
 * parallel definitions elsewhere are not allowed.
 */

export const ENTITY_TYPES = [
  "Customer",
  "Person",
  "System",
  "DataSource",
  "Workflow",
  "WorkflowStep",
  "Decision",
  "Constraint",
  "PainPoint",
  "Asset",
] as const;
export const EntityType = z.enum(ENTITY_TYPES);
export type EntityType = z.infer<typeof EntityType>;

export const RELATION_TYPES = [
  "OWNS", // Person → System
  "TRUSTS", // Person → DataSource
  "DEPENDS_ON", // Workflow/WorkflowStep → System|DataSource
  "PART_OF", // WorkflowStep → Workflow
  "DECIDED_BY", // Decision → Person
  "RATIONALE", // Decision → whatever the rationale points at
  "AUTOMATES", // Asset → WorkflowStep
  "DERIVED_FROM", // Asset → Engagement (desensitization audit trail)
  "BLOCKS", // Constraint → Workflow|WorkflowStep
  "REPORTED", // Person → PainPoint
  "RELATES_TO", // fallback; resolution should narrow it to a concrete type
] as const;
export const RelationType = z.enum(RELATION_TYPES);
export type RelationType = z.infer<typeof RelationType>;

/** DataSource trust level — captures "the data source people actually trust" */
export const TrustLevel = z.enum(["trusted", "contested", "distrusted", "unknown"]);
export type TrustLevel = z.infer<typeof TrustLevel>;

export const EPISODE_KINDS = ["text", "message", "json"] as const;
export const EpisodeKind = z.enum(EPISODE_KINDS);
export type EpisodeKind = z.infer<typeof EpisodeKind>;

/** Entity draft produced by an extractor (pre-resolution) */
export const EntityDraft = z.object({
  type: EntityType,
  name: z
    .string()
    .min(1)
    .describe("Canonical entity name, preferring the wording used in the source"),
  summary: z
    .string()
    .describe("One sentence describing the entity's role or meaning in the customer org"),
  trust: TrustLevel.optional().describe(
    "DataSource entities only: the trust level expressed in the source material",
  ),
});
export type EntityDraft = z.infer<typeof EntityDraft>;

/** Fact draft produced by an extractor (pre-resolution). subject/object reference EntityDraft names. */
export const FactDraft = z.object({
  subject: z
    .string()
    .min(1)
    .describe("Subject entity name; must appear in the entities list"),
  predicate: RelationType,
  object: z
    .string()
    .nullable()
    .describe("Object entity name; null for unary facts (e.g. a PainPoint description)"),
  statement: z
    .string()
    .min(1)
    .describe("Natural-language fact statement, understandable without the source text"),
  quote: z
    .string()
    .describe("Verbatim source excerpt supporting this fact, used for provenance"),
  validFrom: z
    .string()
    .nullable()
    .describe("Business-time validity start (ISO 8601); null if the source does not say"),
});
export type FactDraft = z.infer<typeof FactDraft>;

/** Extraction result for a single episode */
export const ExtractionResult = z.object({
  entities: z.array(EntityDraft),
  facts: z.array(FactDraft),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;

/** Resolution verdict for an incoming fact */
export const ResolutionOp = z.enum(["ADD", "UPDATE", "INVALIDATE", "NOOP"]);
export type ResolutionOp = z.infer<typeof ResolutionOp>;
