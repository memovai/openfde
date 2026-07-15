import type { Command } from "commander";
import { buildInterviewGuide, interviewMarkdown, type InterviewMode } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

export function registerInterview(program: Command): void {
  program
    .command("interview")
    .description(
      "Generate an interview guide from memory-graph gaps (top-down: value->flows->points; bottom-up: mining leads)",
    )
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("-m, --mode <mode>", "top-down|bottom-up", "top-down")
    .option("--json", "JSON output")
    .action((options: { engagement?: string; mode: string; json?: boolean }) => {
      try {
        if (!["top-down", "bottom-up"].includes(options.mode)) {
          throw new Error(`unknown mode "${options.mode}" (use top-down or bottom-up)`);
        }
        const guide = withLedger(options.engagement, (db, slug) =>
          buildInterviewGuide(db, slug, options.mode as InterviewMode),
        );
        if (options.json) console.log(JSON.stringify(guide));
        else console.log(interviewMarkdown(guide));
      } catch (error) {
        fail(error);
      }
    });
}
