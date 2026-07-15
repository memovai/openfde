import type { Command } from "commander";
import { readFileSync } from "node:fs";
import {
  AnthropicJudge,
  MockJudge,
  addTaskNote,
  appendEvalCase,
  getTask,
  verdictMarkdown,
  type Judge,
} from "@openfde/core";
import { actorName, fail, withLedger } from "../lib/helpers.js";

export function registerEval(program: Command): void {
  program
    .command("eval <taskId>")
    .description("Judge submitted work against the task's acceptance criteria (rubric)")
    .requiredOption("--input <file>", "file containing the work to judge (use - for stdin)")
    .option("-e, --engagement <slug>", "target engagement (defaults to current)")
    .option("--mock", "use the deterministic mock judge (testing)")
    .option("--model <model>", "override model")
    .option("--json", "JSON output")
    .action(
      async (
        taskId: string,
        options: { input: string; engagement?: string; mock?: boolean; model?: string; json?: boolean },
      ) => {
        try {
          const work =
            options.input === "-" ? readFileSync(0, "utf8") : readFileSync(options.input, "utf8");

          const { rubric, slug } = withLedger(options.engagement, (db, slug) => {
            const task = getTask(db, taskId);
            if (!task) throw new Error(`task "${taskId}" not found`);
            if (!task.criteria) {
              throw new Error(`task "${taskId}" has no acceptance criteria to judge against`);
            }
            return { rubric: task.criteria, slug };
          });

          let judge: Judge;
          if (options.mock) judge = new MockJudge();
          else {
            if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
              throw new Error("ANTHROPIC_API_KEY not found. Set the key, or use --mock");
            }
            judge = new AnthropicJudge({ model: options.model });
          }
          const verdict = await judge.judge(rubric, work);

          // verdict lands in the task's audit trail and grows the eval dataset
          withLedger(options.engagement, (db) =>
            addTaskNote(
              db,
              taskId,
              `eval ${verdict.verdict} (${verdict.score}/100): ${verdict.reasoning}`,
              actorName("judge"),
            ),
          );
          const casePath = appendEvalCase(slug, taskId, {
            at: new Date().toISOString(),
            taskId,
            rubric,
            workExcerpt: work.slice(0, 2000),
            ...verdict,
          });

          if (options.json) console.log(JSON.stringify({ taskId, casePath, ...verdict }));
          else console.log(`${verdictMarkdown(verdict)}\n\neval case appended: ${casePath}`);
        } catch (error) {
          fail(error);
        }
      },
    );
}
