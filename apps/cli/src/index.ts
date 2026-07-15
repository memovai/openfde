import { Command } from "commander";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import {
  AnthropicExtractor,
  MockExtractor,
  addTaskNote,
  buildReport,
  buildTaskContext,
  contextMarkdown,
  createEngagement,
  createTask,
  getTask,
  ingestEpisode,
  listEngagements,
  listTasks,
  openLedger,
  recall,
  reportMarkdown,
  resolveEngagement,
  runExtraction,
  taskEvents,
  transitionTask,
  useEngagement,
  type Extractor,
  type RecallHit,
  type TaskStatus,
} from "@openfde/core";
import type { EpisodeKind } from "@openfde/ontology";
import { serve } from "./serve/server.js";

const program = new Command();
program
  .name("openfde")
  .description(
    "Local engagement memory for forward deployed engineers: interviews in, traceable memory out",
  )
  .version("0.1.0");

function fail(error: unknown): never {
  console.error(`openfde: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

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

program
  .command("extract")
  .description("Run ontology-constrained extraction and resolution over pending episodes")
  .option("-e, --engagement <slug>", "target engagement (defaults to current)")
  .option("--mock", "use the offline mock extractor (testing)")
  .option("--model <model>", "override model (default OPENFDE_MODEL or claude-opus-4-8)")
  .option("--json", "JSON output")
  .action(
    async (options: { engagement?: string; mock?: boolean; model?: string; json?: boolean }) => {
      try {
        const slug = resolveEngagement(options.engagement);
        const db = openLedger(slug);
        let extractor: Extractor;
        if (options.mock) {
          extractor = new MockExtractor();
        } else {
          if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
            throw new Error(
              "ANTHROPIC_API_KEY not found. Set the key, or use --mock for the offline extractor",
            );
          }
          extractor = new AnthropicExtractor({ model: options.model });
        }
        const stats = await runExtraction(db, extractor);
        db.close();
        if (options.json) console.log(JSON.stringify({ engagement: slug, ...stats }));
        else
          console.log(
            `Processed ${stats.episodes} episode(s): +${stats.facts.ADD} facts, ` +
              `${stats.facts.INVALIDATE} superseded, ${stats.facts.NOOP} deduped, ${stats.failed} failed`,
          );
      } catch (error) {
        fail(error);
      }
    },
  );

function renderHit(hit: RecallHit): string {
  const time = hit.validFrom ?? hit.occurredAt ?? "";
  const status = hit.expired ? " [superseded]" : "";
  const object = hit.object ? ` -> ${hit.object}` : "";
  return [
    `* ${hit.statement}${status}`,
    `  ${hit.subject} --${hit.predicate}--${object}${time ? `  (${time.slice(0, 10)})` : ""}`,
    `  source: ${hit.sourceUri}${hit.speaker ? `  speaker: ${hit.speaker}` : ""}`,
    hit.quote ? `  quote: "${hit.quote}"` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

program
  .command("recall <query...>")
  .description("Search engagement memory (no LLM, milliseconds, citations always included)")
  .option("-e, --engagement <slug>", "target engagement (defaults to current)")
  .option(
    "-m, --mode <mode>",
    "default|handoff (handoff includes superseded facts on a timeline)",
    "default",
  )
  .option("-n, --limit <n>", "max results", "20")
  .option("--json", "JSON output (for agents)")
  .action(
    (
      query: string[],
      options: { engagement?: string; mode: string; limit: string; json?: boolean },
    ) => {
      try {
        const slug = resolveEngagement(options.engagement);
        const db = openLedger(slug);
        const hits = recall(db, query.join(" "), {
          mode: options.mode as "default" | "handoff",
          limit: Number(options.limit),
        });
        db.close();
        if (options.json) {
          console.log(JSON.stringify({ engagement: slug, hits }));
          return;
        }
        if (hits.length === 0) {
          console.log("No hits. Try different keywords, or run openfde extract first");
          return;
        }
        console.log(hits.map(renderHit).join("\n\n"));
      } catch (error) {
        fail(error);
      }
    },
  );

program
  .command("remember <fact...>")
  .description("Record a fact directly (knowledge flowing back from agents mid-task)")
  .requiredOption("--source <uri>", "source URI (required, provenance hard constraint)")
  .option("-e, --engagement <slug>", "target engagement (defaults to current)")
  .option("-s, --speaker <name>", "who the information came from")
  .option("--json", "JSON output")
  .action(
    async (
      factWords: string[],
      options: { source: string; engagement?: string; speaker?: string; json?: boolean },
    ) => {
      try {
        const slug = resolveEngagement(options.engagement);
        const db = openLedger(slug);
        const id = ingestEpisode(db, {
          kind: "text",
          content: factWords.join(" "),
          sourceUri: options.source,
          speaker: options.speaker,
        });
        db.close();
        if (options.json) console.log(JSON.stringify({ engagement: slug, episodeId: id }));
        else console.log(`Recorded (episode ${id}). Run openfde extract to structure it.`);
      } catch (error) {
        fail(error);
      }
    },
  );

/* ---------------- agent-pull dispatch: task verbs ---------------- */

function withLedger<T>(engagement: string | undefined, fn: (db: ReturnType<typeof openLedger>) => T): T {
  const slug = resolveEngagement(engagement);
  const db = openLedger(slug);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

function actorName(explicit?: string): string {
  return explicit ?? process.env.OPENFDE_ACTOR ?? process.env.USER ?? "unknown";
}

const task = program
  .command("task")
  .description("Traceable task cards in the engagement ledger (agent-pull dispatch)");

task
  .command("create <title...>")
  .description("Create a task card (ready to be claimed)")
  .option("-e, --engagement <slug>", "target engagement (defaults to current)")
  .option("-d, --desc <text>", "description")
  .option("-c, --criteria <text>", "acceptance criteria (becomes the eval rubric)")
  .option("--source <uri>", "traceability: which interview/fact this task came from")
  .option("--draft", "create as draft instead of ready")
  .option("--json", "JSON output")
  .action((titleWords: string[], options: {
    engagement?: string; desc?: string; criteria?: string;
    source?: string; draft?: boolean; json?: boolean;
  }) => {
    try {
      const row = withLedger(options.engagement, (db) =>
        createTask(db, {
          title: titleWords.join(" "),
          description: options.desc,
          criteria: options.criteria,
          sourceUri: options.source,
          draft: options.draft,
          actor: actorName(),
        }),
      );
      if (options.json) console.log(JSON.stringify(row));
      else console.log(`Created ${row.id} [${row.status}] ${row.title}`);
    } catch (error) {
      fail(error);
    }
  });

task
  .command("list")
  .description("List task cards")
  .option("-e, --engagement <slug>", "target engagement (defaults to current)")
  .option("-s, --status <status>", "filter by status")
  .option("--json", "JSON output")
  .action((options: { engagement?: string; status?: string; json?: boolean }) => {
    try {
      const rows = withLedger(options.engagement, (db) =>
        listTasks(db, { status: options.status as TaskStatus | undefined }),
      );
      if (options.json) {
        console.log(JSON.stringify({ tasks: rows }));
        return;
      }
      if (rows.length === 0) {
        console.log("No tasks. Create one with: openfde task create <title>");
        return;
      }
      for (const row of rows) {
        const who = row.claimed_by ? ` @${row.claimed_by}` : "";
        console.log(`${row.id}  [${row.status}]${who}  ${row.title}`);
      }
    } catch (error) {
      fail(error);
    }
  });

task
  .command("show <id>")
  .description("Show a task card with its event log")
  .option("-e, --engagement <slug>", "target engagement (defaults to current)")
  .option("--json", "JSON output")
  .action((id: string, options: { engagement?: string; json?: boolean }) => {
    try {
      const data = withLedger(options.engagement, (db) => {
        const row = getTask(db, id);
        if (!row) throw new Error(`task "${id}" not found`);
        return { task: row, events: taskEvents(db, id) };
      });
      if (options.json) {
        console.log(JSON.stringify(data));
        return;
      }
      const { task: row, events } = data;
      console.log(`${row.id}  [${row.status}]${row.claimed_by ? ` @${row.claimed_by}` : ""}`);
      console.log(row.title);
      if (row.description) console.log(`\n${row.description}`);
      if (row.criteria) console.log(`\nacceptance criteria:\n${row.criteria}`);
      if (row.source_uri) console.log(`\norigin: ${row.source_uri}`);
      console.log("\nevents:");
      for (const ev of events) {
        const what =
          ev.kind === "status" ? `${ev.from_status} -> ${ev.to_status}` : ev.kind;
        console.log(
          `  ${ev.at.slice(0, 19)}  ${what}${ev.actor ? ` (${ev.actor})` : ""}${ev.note ? `: ${ev.note}` : ""}`,
        );
      }
    } catch (error) {
      fail(error);
    }
  });

function transitionCommand(
  name: string,
  description: string,
  to: TaskStatus,
): void {
  task
    .command(`${name} <id>`)
    .description(description)
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--by <actor>", "who is acting (default: $OPENFDE_ACTOR or $USER)")
    .option("--note <text>", "attach a note to the transition")
    .option("--json", "JSON output")
    .action((id: string, options: { engagement?: string; by?: string; note?: string; json?: boolean }) => {
      try {
        const row = withLedger(options.engagement, (db) =>
          transitionTask(db, id, to, { actor: actorName(options.by), note: options.note }),
        );
        if (options.json) console.log(JSON.stringify(row));
        else console.log(`${row.id} -> [${row.status}]`);
      } catch (error) {
        fail(error);
      }
    });
}

transitionCommand("ready", "Publish a draft / re-open a rejected task", "ready");
transitionCommand("claim", "Claim a ready task", "claimed");
transitionCommand("start", "Start working on a claimed task", "running");
transitionCommand("done", "Submit running work for review", "review");
transitionCommand("accept", "Accept reviewed work", "accepted");
transitionCommand("reject", "Reject reviewed work", "rejected");

task
  .command("update <id>")
  .description("Append a progress note to a task")
  .option("-e, --engagement <slug>", "target engagement (defaults to current)")
  .option("--by <actor>", "who is acting")
  .requiredOption("--note <text>", "the note")
  .option("--json", "JSON output")
  .action((id: string, options: { engagement?: string; by?: string; note: string; json?: boolean }) => {
    try {
      withLedger(options.engagement, (db) => addTaskNote(db, id, options.note, actorName(options.by)));
      if (options.json) console.log(JSON.stringify({ id, noted: true }));
      else console.log(`Noted on ${id}`);
    } catch (error) {
      fail(error);
    }
  });

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

program
  .command("report")
  .description("Executive engagement report: opportunities, load relief, automation coverage, value")
  .option("-e, --engagement <slug>", "target engagement (defaults to current)")
  .option("--json", "JSON output")
  .action((options: { engagement?: string; json?: boolean }) => {
    try {
      const slug = resolveEngagement(options.engagement);
      const report = withLedger(options.engagement, (db) => buildReport(db, slug));
      if (options.json) console.log(JSON.stringify(report));
      else console.log(reportMarkdown(report));
    } catch (error) {
      fail(error);
    }
  });

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

program.parseAsync(process.argv);
