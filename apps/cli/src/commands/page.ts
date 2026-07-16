import type { Command } from "commander";
import { readFileSync } from "node:fs";
import { createPage, deletePage, listPages, readPage, writePage } from "@openfde/core";
import { fail, withLedger } from "../lib/helpers.js";

function contentFrom(options: { file?: string; text?: string }): string | undefined {
  if (options.text) return options.text;
  if (!options.file) return undefined;
  return options.file === "-" ? readFileSync(0, "utf8") : readFileSync(options.file, "utf8");
}

export function registerPage(program: Command): void {
  const page = program
    .command("page")
    .description("Free-form markdown pages next to the ledger (block-edited in the webui)");

  page
    .command("add <title...>")
    .description("Create a page (optionally seeded from --file or --text)")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--file <path>", "seed content from a file (use - for stdin)")
    .option("--text <content>", "inline seed content")
    .option("--json", "JSON output")
    .action((titleWords: string[], options: {
      engagement?: string; file?: string; text?: string; json?: boolean;
    }) => {
      try {
        const ref = withLedger(options.engagement, (_db, slug) =>
          createPage(slug, titleWords.join(" "), contentFrom(options)),
        );
        if (options.json) console.log(JSON.stringify(ref));
        else console.log(`Created page ${ref.slug} -> ${ref.path}`);
      } catch (error) {
        fail(error);
      }
    });

  page
    .command("list")
    .description("List pages")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--json", "JSON output")
    .action((options: { engagement?: string; json?: boolean }) => {
      try {
        const refs = withLedger(options.engagement, (_db, slug) => listPages(slug));
        if (options.json) {
          console.log(JSON.stringify({ pages: refs }));
          return;
        }
        if (refs.length === 0) console.log("No pages yet. Create one with: openfde page add <title>");
        for (const ref of refs) console.log(`${ref.slug}  ${ref.title}`);
      } catch (error) {
        fail(error);
      }
    });

  page
    .command("show <slug>")
    .description("Print a page")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .action((slug: string, options: { engagement?: string }) => {
      try {
        console.log(withLedger(options.engagement, (_db, eng) => readPage(eng, slug)));
      } catch (error) {
        fail(error);
      }
    });

  page
    .command("edit <slug>")
    .description("Replace a page's content from --file or --text")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--file <path>", "content file (use - for stdin)")
    .option("--text <content>", "inline content")
    .option("--json", "JSON output")
    .action((slug: string, options: {
      engagement?: string; file?: string; text?: string; json?: boolean;
    }) => {
      try {
        const content = contentFrom(options);
        if (!content) throw new Error("provide --file or --text");
        const ref = withLedger(options.engagement, (_db, eng) => writePage(eng, slug, content));
        if (options.json) console.log(JSON.stringify(ref));
        else console.log(`Saved page ${ref.slug}`);
      } catch (error) {
        fail(error);
      }
    });

  page
    .command("remove <slug>")
    .description("Delete a page")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .action((slug: string, options: { engagement?: string }) => {
      try {
        withLedger(options.engagement, (_db, eng) => deletePage(eng, slug));
        console.log(`Removed page ${slug}`);
      } catch (error) {
        fail(error);
      }
    });
}
