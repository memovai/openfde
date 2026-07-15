import type { Command } from "commander";
import { openLedger, resolveEngagement } from "@openfde/core";
import { fail } from "../lib/helpers.js";

export function registerStatus(program: Command): void {
  program
    .command("status")
    .description("Memory overview for the current engagement")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--json", "JSON output")
    .action((options: { engagement?: string; json?: boolean }) => {
      try {
        const slug = resolveEngagement(options.engagement);
        const db = openLedger(slug);
        const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
        const summary = {
          engagement: slug,
          episodes: count("SELECT count(*) AS n FROM episodes"),
          pending: count("SELECT count(*) AS n FROM episodes WHERE extraction_status = 'pending'"),
          entities: count("SELECT count(*) AS n FROM entities WHERE expired_at IS NULL"),
          activeFacts: count("SELECT count(*) AS n FROM facts WHERE expired_at IS NULL"),
          expiredFacts: count("SELECT count(*) AS n FROM facts WHERE expired_at IS NOT NULL"),
          openTasks: count(
            "SELECT count(*) AS n FROM tasks WHERE status NOT IN ('accepted','rejected')",
          ),
        };
        db.close();
        if (options.json) console.log(JSON.stringify(summary));
        else
          console.log(
            `engagement: ${summary.engagement}\n` +
              `episodes: ${summary.episodes} (${summary.pending} pending extraction)\n` +
              `entities: ${summary.entities}  active facts: ${summary.activeFacts}  superseded: ${summary.expiredFacts}\n` +
              `open tasks: ${summary.openTasks}`,
          );
      } catch (error) {
        fail(error);
      }
    });
}
