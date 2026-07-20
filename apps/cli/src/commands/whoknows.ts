import type { Command } from "commander";
import { buildWhoKnows, whoKnowsMarkdown } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

export function registerWhoknows(program: Command): void {
  program
    .command("whoknows <topic...>")
    .description("Who is the expert in a topic — ranked from recorded ownership, decisions, and mentions, with cited evidence")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("-n, --limit <n>", "max people", "5")
    .option("--json", "JSON output")
    .action((topicWords: string[], options: { engagement?: string; limit: string; json?: boolean }) => {
      try {
        const topic = topicWords.join(" ");
        const experts = withLedger(options.engagement, (db) =>
          buildWhoKnows(db, topic, Number(options.limit)),
        );
        if (options.json) console.log(JSON.stringify({ topic, experts }));
        else console.log(whoKnowsMarkdown(experts, topic));
      } catch (error) {
        fail(error);
      }
    });
}
