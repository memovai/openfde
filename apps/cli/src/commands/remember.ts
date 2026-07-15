import type { Command } from "commander";
import { ingestEpisode, openLedger, resolveEngagement } from "@openfde/core";
import { fail } from "../lib/helpers.js";

export function registerRemember(program: Command): void {
  program
    .command("remember <fact...>")
    .description("Record a fact directly (knowledge flowing back from agents mid-task)")
    .requiredOption("--source <uri>", "source URI (required, provenance hard constraint)")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("-s, --speaker <name>", "who the information came from")
    .option("--json", "JSON output")
    .action(
      async (
        factWords: string[],
        options: { source: string; engagement?: string; speaker?: string; json?: boolean },
      ) => {
        try {
          const slug = resolveEngagement(options.engagement);
          const db = openLedger(slug);
          const id = ingestEpisode(db, {
            kind: "text",
            content: factWords.join(" "),
            sourceUri: options.source,
            speaker: options.speaker,
          });
          db.close();
          if (options.json) console.log(JSON.stringify({ engagement: slug, episodeId: id }));
          else console.log(`Recorded (episode ${id}). Run openfde extract to structure it.`);
        } catch (error) {
          fail(error);
        }
      },
    );
}
