import { z } from "zod";

/** Entity types of the FDE domain ontology. Adding a type = editing this list. */
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

/** DataSource trust level — captures "the data source people actually trust" */
export const TrustLevel = z.enum(["trusted", "contested", "distrusted", "unknown"]);
export type TrustLevel = z.infer<typeof TrustLevel>;
