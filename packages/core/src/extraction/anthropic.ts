import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ExtractionResult, ENTITY_TYPES, RELATION_TYPES } from "@openfde/ontology";
import type { Extractor, EpisodeInput } from "./extractor.js";

const SYSTEM = `You are the engagement-memory extractor for an FDE (Forward Deployed Engineer) team.
The input is a piece of customer material (interview notes, chat logs, document fragments), possibly in any language. Extract entities and facts strictly within the fixed ontology.

Entity types (no others allowed): ${ENTITY_TYPES.join(", ")}
Relation types (no others allowed): ${RELATION_TYPES.join(", ")}

Rules:
- Extract only what the source explicitly supports; never speculate. Every fact's quote must be copied verbatim from the source.
- Prioritize four high-value signals: who trusts/distrusts which data source (TRUSTS + trust field); decisions and their rationale (Decision + RATIONALE/DECIDED_BY); workflows and step dependencies (Workflow/WorkflowStep + DEPENDS_ON/PART_OF); constraints and blockers (Constraint + BLOCKS).
- Write each statement as a complete sentence understandable without the source text, in the source's language.
- Keep entity names and statements in the language of the source material.
- A fact's subject/object must reference names from the entities list.
- If nothing is extractable, return empty arrays; do not invent content.`;

export interface AnthropicExtractorOptions {
  model?: string;
  client?: Anthropic;
}

export class AnthropicExtractor implements Extractor {
  private client: Anthropic;
  private model: string;

  constructor(options: AnthropicExtractorOptions = {}) {
    this.client = options.client ?? new Anthropic();
    this.model = options.model ?? process.env.OPENFDE_MODEL ?? "claude-opus-4-8";
  }

  async extract(episode: EpisodeInput): Promise<import("@openfde/ontology").ExtractionResult> {
    const meta = [
      episode.speaker ? `speaker: ${episode.speaker}` : null,
      episode.occurredAt ? `occurred_at: ${episode.occurredAt}` : null,
      `kind: ${episode.kind}`,
    ]
      .filter(Boolean)
      .join("\n");

    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { format: zodOutputFormat(ExtractionResult) },
      messages: [
        {
          role: "user",
          content: `<episode_meta>\n${meta}\n</episode_meta>\n<episode_content>\n${episode.content}\n</episode_content>`,
        },
      ],
    });

    if (!response.parsed_output) {
      throw new Error(
        `failed to parse extraction output (stop_reason=${response.stop_reason})`,
      );
    }
    return response.parsed_output;
  }
}
