import type { Command } from "commander";
import { addAsset, buildDemoBrief, demoBriefMarkdown } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

export function registerDemo(program: Command): void {
  program
    .command("demo <topic...>")
    .description("Assemble a demo brief from memory: pain, vocabulary, constraints, data — hand it to a coding agent")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--save", "also store the brief as a demo asset")
    .option("--json", "JSON output")
    .action(
      (topicWords: string[], options: { engagement?: string; save?: boolean; json?: boolean }) => {
        try {
          const topic = topicWords.join(" ");
          const { brief, slug } = withLedger(options.engagement, (db, slug) => ({
            brief: buildDemoBrief(db, topic),
            slug,
          }));
          const markdown = demoBriefMarkdown(brief);
          if (options.json) console.log(JSON.stringify(brief));
          else console.log(markdown);
          if (options.save) {
            const ref = addAsset(slug, "demo", topic, markdown);
            console.error(`\nSaved demo asset: ${ref.path}`);
          }
        } catch (error) {
          fail(error);
        }
      },
    );
}
