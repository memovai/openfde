import type { Ledger } from "../ledger/database.js";
import { recall, type RecallHit } from "../ledger/recall.js";
import { getTask, type TaskRow } from "./tasks.js";

/**
 * The context bundle: the memory ammunition pack an agent reads before
 * starting a task (DESIGN 4.6). Constraints are always shipped; related
 * memory comes from recall over the task title/description; every item
 * carries its citation.
 */

export interface TaskContext {
  task: TaskRow;
  /** Active facts involving Constraint entities or BLOCKS edges — always shipped */
  constraints: RecallHit[];
  /** Memory related to the task title/description */
  related: RecallHit[];
}

export function buildTaskContext(db: Ledger, taskId: string, limit = 15): TaskContext {
  const task = getTask(db, taskId);
  if (!task) throw new Error(`task "${taskId}" not found`);

  const constraints = db
    .prepare(
      `SELECT f.id AS factId, f.statement, f.predicate, f.quote,
              f.valid_from AS validFrom, f.expired_at AS expiredAt, f.invalidated_by AS invalidatedBy,
              s.name AS subject, o.name AS object,
              e.source_uri AS sourceUri, e.speaker, e.occurred_at AS occurredAt
       FROM facts f
       JOIN entities s ON s.id = f.subject_id
       LEFT JOIN entities o ON o.id = f.object_id
       JOIN episodes e ON e.id = f.episode_id
       WHERE f.expired_at IS NULL AND (f.predicate = 'BLOCKS' OR s.type = 'Constraint')`,
    )
    .all()
    .map((raw) => {
      const row = raw as Record<string, unknown>;
      return {
      factId: row.factId,
      statement: row.statement,
      predicate: row.predicate,
      subject: row.subject,
      object: row.object,
      quote: row.quote,
      sourceUri: row.sourceUri,
      speaker: row.speaker,
      occurredAt: row.occurredAt,
      validFrom: row.validFrom,
      expired: false,
      invalidatedBy: null,
      };
    }) as RecallHit[];

  const query = [task.title, task.description ?? ""].join(" ").trim();
  const constraintIds = new Set(constraints.map((c) => c.factId));
  const related = recall(db, query, { limit }).filter((h) => !constraintIds.has(h.factId));

  return { task, constraints, related };
}

function contextBullet(hit: RecallHit): string {
  const lines = [
    `- ${hit.statement}`,
    `  (${hit.subject} ${hit.predicate}${hit.object ? ` ${hit.object}` : ""})`,
  ];
  if (hit.quote) lines.push(`  > ${hit.quote.replace(/\n/g, " ")}`);
  lines.push(`  source: ${hit.sourceUri}${hit.speaker ? ` — ${hit.speaker}` : ""}`);
  return lines.join("\n");
}

/** Markdown ammunition pack an agent reads before starting the task */
export function contextMarkdown(context: TaskContext): string {
  const { task, constraints, related } = context;
  const md: string[] = [
    `# Task context: ${task.title}`,
    "",
    `task: ${task.id} · status: ${task.status}`,
  ];
  if (task.source_uri) md.push(`origin: ${task.source_uri}`);
  if (task.description) md.push("", task.description);
  if (task.criteria) md.push("", "## Acceptance criteria", "", task.criteria);

  md.push("", `## Constraints — read before acting (${constraints.length})`, "");
  if (constraints.length === 0) md.push("_None recorded._");
  for (const hit of constraints) md.push(contextBullet(hit), "");

  md.push(`## Related memory (${related.length})`, "");
  if (related.length === 0) md.push("_No related facts found. Consider `openfde recall` with other terms._");
  for (const hit of related) md.push(contextBullet(hit), "");

  md.push(
    "---",
    "While working: record discoveries with `openfde remember \"<fact>\" --source <uri>`,",
    `report progress with \`openfde task update ${task.id} --note "..."\`,`,
    `finish with \`openfde task done ${task.id}\`.`,
  );
  return md.join("\n");
}
