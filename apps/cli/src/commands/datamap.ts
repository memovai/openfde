import type { Command } from "commander";
import { buildDataMap, dataMapMarkdown } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

export function registerDatamap(program: Command): void {
  program
    .command("datamap")
    .description("The data negotiation map: who owns each data source, who trusts it, what depends on it")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--json", "JSON output")
    .action((options: { engagement?: string; json?: boolean }) => {
      try {
        const { map, slug } = withLedger(options.engagement, (db, slug) => ({
          map: buildDataMap(db),
          slug,
        }));
        if (options.json) console.log(JSON.stringify({ engagement: slug, dataSources: map }));
        else console.log(dataMapMarkdown(map, slug));
      } catch (error) {
        fail(error);
      }
    });
}
