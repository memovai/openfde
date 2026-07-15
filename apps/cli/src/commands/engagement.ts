import type { Command } from "commander";
import { createEngagement, listEngagements, resolveEngagement, useEngagement } from "@openfde/core";
import { fail } from "../lib/helpers.js";

export function registerEngagement(program: Command): void {
  const engagement = program
    .command("engagement")
    .description("Manage engagements (one local directory per customer project)");

  engagement
    .command("create <name>")
    .description("Create an engagement and make it current")
    .action((name: string) => {
      try {
        const slug = createEngagement(name);
        console.log(`Created and switched to engagement: ${slug}`);
      } catch (error) {
        fail(error);
      }
    });

  engagement
    .command("list")
    .description("List all engagements")
    .option("--json", "JSON output")
    .action((options: { json?: boolean }) => {
      const all = listEngagements();
      let current: string | null = null;
      try {
        current = resolveEngagement();
      } catch {
        /* no selection is fine for list */
      }
      if (options.json) {
        console.log(JSON.stringify({ current, engagements: all }));
        return;
      }
      if (all.length === 0) {
        console.log("(none) create one with: openfde engagement create <name>");
        return;
      }
      for (const slug of all) console.log(`${slug === current ? "*" : " "} ${slug}`);
    });

  engagement
    .command("use <slug>")
    .description("Switch the current engagement")
    .action((slug: string) => {
      try {
        useEngagement(slug);
        console.log(`Current engagement: ${slug}`);
      } catch (error) {
        fail(error);
      }
    });
}
