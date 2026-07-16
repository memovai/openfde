import type { Command } from "commander";
import { buildFlows, buildOverviewFlow, flowsMarkdown } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

export function registerFlows(program: Command): void {
  program
    .command("flows")
    .description("Auto-extracted mermaid flow diagrams: goals, workflows, steps, blockers, automation")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--json", "JSON output")
    .action((options: { engagement?: string; json?: boolean }) => {
      try {
        const { diagrams, slug } = withLedger(options.engagement, (db, slug) => {
          const overview = buildOverviewFlow(db);
          return { diagrams: [...(overview ? [overview] : []), ...buildFlows(db)], slug };
        });
        if (options.json) console.log(JSON.stringify({ engagement: slug, flows: diagrams }));
        else console.log(flowsMarkdown(diagrams, slug));
      } catch (error) {
        fail(error);
      }
    });
}
