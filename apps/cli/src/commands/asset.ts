import type { Command } from "commander";
import { readFileSync } from "node:fs";
import { ASSET_TYPES, addAsset, assetStats, listAssets, readAsset, type AssetType } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

function checkType(type: string): AssetType {
  if (!ASSET_TYPES.includes(type as AssetType)) {
    throw new Error(`unknown asset type "${type}" (use ${ASSET_TYPES.join("|")})`);
  }
  return type as AssetType;
}

export function registerAsset(program: Command): void {
  const asset = program
    .command("asset")
    .description("The engagement asset library: rubrics, prompts, eval cases, demos, playbooks, skills");

  asset
    .command("add <type> <name...>")
    .description("Store an asset from --file or --text")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--file <path>", "read content from a file (use - for stdin)")
    .option("--text <content>", "inline content")
    .option("--json", "JSON output")
    .action(
      (
        type: string,
        nameWords: string[],
        options: { engagement?: string; file?: string; text?: string; json?: boolean },
      ) => {
        try {
          const content = options.text
            ?? (options.file ? (options.file === "-" ? readFileSync(0, "utf8") : readFileSync(options.file, "utf8")) : undefined);
          if (!content) throw new Error("provide --file or --text");
          const ref = withLedger(options.engagement, (_db, slug) =>
            addAsset(slug, checkType(type), nameWords.join(" "), content),
          );
          if (options.json) console.log(JSON.stringify(ref));
          else console.log(`Saved ${ref.type}/${ref.name} -> ${ref.path}`);
        } catch (error) {
          fail(error);
        }
      },
    );

  asset
    .command("list")
    .description("List assets (per-type counts with --stats)")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("-t, --type <type>", "filter by type")
    .option("--stats", "per-type counts (product-leverage signal)")
    .option("--json", "JSON output")
    .action((options: { engagement?: string; type?: string; stats?: boolean; json?: boolean }) => {
      try {
        const result = withLedger(options.engagement, (_db, slug) =>
          options.stats
            ? assetStats(slug)
            : listAssets(slug, options.type ? checkType(options.type) : undefined),
        );
        if (options.json) {
          console.log(JSON.stringify(result));
          return;
        }
        if (options.stats) {
          for (const [type, n] of Object.entries(result)) console.log(`${type}: ${n}`);
          return;
        }
        const refs = result as ReturnType<typeof listAssets>;
        if (refs.length === 0) console.log("No assets yet. Add one with: openfde asset add");
        for (const ref of refs) console.log(`${ref.type}/${ref.name}`);
      } catch (error) {
        fail(error);
      }
    });

  asset
    .command("show <type> <name...>")
    .description("Print an asset")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .action((type: string, nameWords: string[], options: { engagement?: string }) => {
      try {
        const content = withLedger(options.engagement, (_db, slug) =>
          readAsset(slug, checkType(type), nameWords.join(" ")),
        );
        console.log(content);
      } catch (error) {
        fail(error);
      }
    });
}
