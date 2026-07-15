import type { Command } from "commander";
import {
  AnthropicExtractor,
  MockExtractor,
  openLedger,
  resolveEngagement,
  runExtraction,
  type Extractor,
} from "@openfde/core";
import { fail } from "../lib/helpers.js";

export function registerExtract(program: Command): void {
  program
    .command("extract")
    .description("Run ontology-constrained extraction and resolution over pending episodes")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--mock", "use the offline mock extractor (testing)")
    .option("--model <model>", "override model (default OPENFDE_MODEL or claude-opus-4-8)")
    .option("--json", "JSON output")
    .action(
      async (options: { engagement?: string; mock?: boolean; model?: string; json?: boolean }) => {
        try {
          const slug = resolveEngagement(options.engagement);
          const db = openLedger(slug);
          let extractor: Extractor;
          if (options.mock) {
            extractor = new MockExtractor();
          } else {
            if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
              throw new Error(
                "ANTHROPIC_API_KEY not found. Set the key, or use --mock for the offline extractor",
              );
            }
            extractor = new AnthropicExtractor({ model: options.model });
          }
          const stats = await runExtraction(db, extractor);
          db.close();
          if (options.json) console.log(JSON.stringify({ engagement: slug, ...stats }));
          else
            console.log(
              `Processed ${stats.episodes} episode(s): +${stats.facts.ADD} facts, ` +
                `${stats.facts.INVALIDATE} superseded, ${stats.facts.NOOP} deduped, ${stats.failed} failed`,
            );
        } catch (error) {
          fail(error);
        }
      },
    );
}
