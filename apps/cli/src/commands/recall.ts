import type { Command } from "commander";
import { openLedger, recall, resolveEngagement, type RecallHit } from "@openfde/core";
import { fail } from "../lib/helpers.js";

export function registerRecall(program: Command): void {
  function renderHit(hit: RecallHit): string {
    const time = hit.validFrom ?? hit.occurredAt ?? "";
    const status = hit.expired ? " [superseded]" : "";
    const object = hit.object ? ` -> ${hit.object}` : "";
    return [
      `* ${hit.statement}${status}`,
      `  ${hit.subject} --${hit.predicate}--${object}${time ? `  (${time.slice(0, 10)})` : ""}`,
      `  source: ${hit.sourceUri}${hit.speaker ? `  speaker: ${hit.speaker}` : ""}`,
      hit.quote ? `  quote: "${hit.quote}"` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  program
    .command("recall <query...>")
    .description("Search engagement memory (no LLM, milliseconds, citations always included)")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option(
      "-m, --mode <mode>",
      "default|handoff (handoff includes superseded facts on a timeline)",
      "default",
    )
    .option("-n, --limit <n>", "max results", "20")
    .option("--json", "JSON output (for agents)")
    .action(
      (
        query: string[],
        options: { engagement?: string; mode: string; limit: string; json?: boolean },
      ) => {
        try {
          const slug = resolveEngagement(options.engagement);
          const db = openLedger(slug);
          const hits = recall(db, query.join(" "), {
            mode: options.mode as "default" | "handoff",
            limit: Number(options.limit),
          });
          db.close();
          if (options.json) {
            console.log(JSON.stringify({ engagement: slug, hits }));
            return;
          }
          if (hits.length === 0) {
            console.log("No hits. Try different keywords, or run openfde extract first");
            return;
          }
          console.log(hits.map(renderHit).join("\n\n"));
        } catch (error) {
          fail(error);
        }
      },
    );
}
