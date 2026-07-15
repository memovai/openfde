import type { Command } from "commander";
import { buildTaskContext, contextMarkdown } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

export function registerContext(program: Command): void {
  program
    .command("context <taskId>")
    .description("Assemble the memory ammunition pack for a task (constraints + related facts)")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("-n, --limit <n>", "max related facts", "15")
    .option("--json", "JSON output")
    .action((taskId: string, options: { engagement?: string; limit: string; json?: boolean }) => {
      try {
        const context = withLedger(options.engagement, (db) =>
          buildTaskContext(db, taskId, Number(options.limit)),
        );
        if (options.json) console.log(JSON.stringify(context));
        else console.log(contextMarkdown(context));
      } catch (error) {
        fail(error);
      }
    });
}
