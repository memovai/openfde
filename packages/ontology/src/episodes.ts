import { z } from "zod";

/** Ingestion units: a chat turn, a document fragment, or structured data. */
export const EPISODE_KINDS = ["text", "message", "json"] as const;
export const EpisodeKind = z.enum(EPISODE_KINDS);
export type EpisodeKind = z.infer<typeof EpisodeKind>;
