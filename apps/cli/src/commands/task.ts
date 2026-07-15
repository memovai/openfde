import type { Command } from "commander";
import {
  addAsset,
  addTaskNote,
  createTask,
  getTask,
  listTasks,
  taskEvents,
  transitionTask,
  type TaskStatus,
} from "@openfde/core";
import { actorName, fail, withLedger } from "../lib/helpers.js";

export function registerTask(program: Command): void {
  /* ---------------- agent-pull dispatch: task verbs ---------------- */



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
        const row = withLedger(options.engagement, (db, slug) => {
          const task = createTask(db, {
            title: titleWords.join(" "),
            description: options.desc,
            criteria: options.criteria,
            sourceUri: options.source,
            draft: options.draft,
            actor: actorName(),
          });
          // acceptance criteria are rubric assets from birth (DESIGN 4.4)
          if (options.criteria) {
            addAsset(slug, "rubric", task.title, `# Rubric: ${task.title}\n\ntask: ${task.id}\n\n${options.criteria}`);
          }
          return task;
        });
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
      .option("--outcome <text>", "observed result (decision lineage; recorded on accept)")
      .option("--json", "JSON output")
      .action((id: string, options: { engagement?: string; by?: string; note?: string; outcome?: string; json?: boolean }) => {
        try {
          const row = withLedger(options.engagement, (db) =>
            transitionTask(db, id, to, {
              actor: actorName(options.by),
              note: options.note,
              outcome: options.outcome,
            }),
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
}
