import type { Command } from "commander";
import { copyFileSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { ingestEpisode, newId, openLedger, paths, resolveEngagement } from "@openfde/core";
import type { EpisodeKind } from "@openfde/ontology";
import { fail } from "../lib/helpers.js";

export function registerIngest(program: Command): void {
  program
    .command("ingest [files...]")
    .description("Ingest files or stdin as episodes (with provenance, pending extraction)")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("-k, --kind <kind>", "episode kind: text|message|json", "text")
    .option("-s, --speaker <name>", "speaker (for chat/interview material)")
    .option("--source <uri>", "source URI (defaults to file:// path when reading files)")
    .option("--occurred-at <iso>", "when the content happened (ISO 8601)")
    .option("--stdin", "read from standard input")
    .option("--json", "JSON output")
    .action(
      (
        files: string[],
        options: {
          engagement?: string;
          kind: string;
          speaker?: string;
          source?: string;
          occurredAt?: string;
          stdin?: boolean;
          json?: boolean;
        },
      ) => {
        try {
          const slug = resolveEngagement(options.engagement);
          const db = openLedger(slug);
          const ids: string[] = [];
          const kind = options.kind as EpisodeKind;

          if (options.stdin) {
            const content = readFileSync(0, "utf8");
            if (!options.source) {
              throw new Error(
                "--stdin ingestion requires an explicit --source (provenance hard constraint)",
              );
            }
            ids.push(
              ingestEpisode(db, {
                kind,
                content,
                sourceUri: options.source,
                speaker: options.speaker,
                occurredAt: options.occurredAt,
              }),
            );
          }
          for (const file of files) {
            const path = resolve(file);
            ids.push(
              ingestEpisode(db, {
                kind,
                content: readFileSync(path, "utf8"),
                sourceUri: options.source ?? `file://${path}`,
                span: basename(path),
                speaker: options.speaker,
                occurredAt: options.occurredAt,
              }),
            );
          }
          db.close();
          if (ids.length === 0) throw new Error("no input. Pass file paths or use --stdin");
          if (options.json) console.log(JSON.stringify({ engagement: slug, episodeIds: ids }));
          else
            console.log(
              `Ingested ${ids.length} episode(s) into ${slug} (pending: openfde extract)`,
            );
        } catch (error) {
          fail(error);
        }
      },
    );
}
