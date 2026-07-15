import { z } from "zod";
import { EntityType, TrustLevel } from "./entities.js";
import { RelationType } from "./relations.js";

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
