import type { Command } from "commander";
import { addCanvasCard, readCanvas } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

export function registerCanvas(program: Command): void {
  const canvas = program
    .command("canvas")
    .description("The free-form card canvas of the engagement (drag-edited in the webui)");

  canvas
    .command("show")
    .description("Print canvas cards")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--json", "JSON output")
    .action((options: { engagement?: string; json?: boolean }) => {
      try {
        const data = withLedger(options.engagement, (_db, slug) => readCanvas(slug));
        if (options.json) {
          console.log(JSON.stringify(data));
          return;
        }
        if (data.cards.length === 0) {
          console.log("Empty canvas. Add a card with: openfde canvas add <text>");
          return;
        }
        for (const card of data.cards) {
          console.log(`${card.id}  (${card.x},${card.y})  ${card.text.split("\n")[0]}`);
        }
      } catch (error) {
        fail(error);
      }
    });

  canvas
    .command("add <text...>")
    .description("Add a markdown card to the canvas")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--x <n>", "x position", parseFloat)
    .option("--y <n>", "y position", parseFloat)
    .option("--json", "JSON output")
    .action((textWords: string[], options: { engagement?: string; x?: number; y?: number; json?: boolean }) => {
      try {
        const card = withLedger(options.engagement, (_db, slug) =>
          addCanvasCard(slug, textWords.join(" "), { x: options.x, y: options.y }),
        );
        if (options.json) console.log(JSON.stringify(card));
        else console.log(`Added ${card.id} at (${card.x},${card.y})`);
      } catch (error) {
        fail(error);
      }
    });
}
