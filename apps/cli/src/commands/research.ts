import type { Command } from "commander";
import { WebResearcher, ingestEpisode, researchMarkdown } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

export function registerResearch(program: Command): void {
  program
    .command("research <query...>")
    .description("Web-search for methods and approaches; --save ingests findings into memory")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--save", "ingest the findings as an episode (pending extraction)")
    .option("--model <model>", "override model")
    .option("--json", "JSON output")
    .action(
      async (
        queryWords: string[],
        options: { engagement?: string; save?: boolean; model?: string; json?: boolean },
      ) => {
        try {
          if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
            throw new Error("ANTHROPIC_API_KEY not found — research needs the Claude API");
          }
          const query = queryWords.join(" ");
          const researcher = new WebResearcher({ model: options.model });
          const result = await researcher.research(query);
          if (options.json) console.log(JSON.stringify(result));
          else console.log(researchMarkdown(result));

          if (options.save) {
            const episodeId = withLedger(options.engagement, (db) =>
              ingestEpisode(db, {
                kind: "text",
                content: researchMarkdown(result),
                sourceUri: `websearch://${new Date().toISOString().slice(0, 10)}/${encodeURIComponent(query.slice(0, 60))}`,
              }),
            );
            console.error(`\nSaved as ${episodeId} — run openfde extract to structure it.`);
          }
        } catch (error) {
          fail(error);
        }
      },
    );
}
