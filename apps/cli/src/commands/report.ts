import type { Command } from "commander";
import { buildReport, reportMarkdown, resolveEngagement } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

export function registerReport(program: Command): void {
  program
    .command("report")
    .description("Executive engagement report: opportunities, load relief, automation coverage, value")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--json", "JSON output")
    .action((options: { engagement?: string; json?: boolean }) => {
      try {
        const slug = resolveEngagement(options.engagement);
        const report = withLedger(options.engagement, (db) => buildReport(db, slug));
        if (options.json) console.log(JSON.stringify(report));
        else console.log(reportMarkdown(report));
      } catch (error) {
        fail(error);
      }
    });
}
