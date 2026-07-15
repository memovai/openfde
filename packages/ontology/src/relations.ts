import { z } from "zod";

/** Relation types of the FDE domain ontology. */
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
