import type { Command } from "commander";
import { resolveEngagement } from "@openfde/core";
import { fail } from "../lib/helpers.js";
import { serve } from "@openfde/webui";

export function registerServe(program: Command): void {
  program
    .command("serve")
    .description("Start the local graph UI (optional daemon; the CLI works without it)")
    .option("-p, --port <port>", "port to listen on", "4517")
    .option("-e, --engagement <slug>", "initial engagement (defaults to current)")
    .action((options: { port: string; engagement?: string }) => {
      try {
        resolveEngagement(options.engagement); // fail fast if nothing to show
        serve({ port: Number(options.port) });
      } catch (error) {
        fail(error);
      }
    });
}
