import type { ExtractionResult } from "@openfde/ontology";

export interface EpisodeInput {
  kind: string;
  content: string;
  speaker?: string | null;
  occurredAt?: string | null;
}

/** Extractor interface shared by the LLM implementation and the offline mock */
export interface Extractor {
  extract(episode: EpisodeInput): Promise<ExtractionResult>;
}
