import type { Ledger } from "./db.js";
import { newId, nowIso } from "./db.js";
import { recall, type RecallHit } from "./recall.js";

/**
 * Agent-pull dispatch (DESIGN 4.6, Mode B): tasks are rows in the engagement
 * ledger; humans and coding agents drive them through the same CLI verbs.
 * The optional orchestrated runner (Mode A) builds on this same table later.
 */

export const TASK_STATUSES = [
  "draft",
  "ready",
  "claimed",
  "running",
  "review",
  "accepted",
  "rejected",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** Legal transitions of the task state machine */
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["ready"],
  ready: ["claimed"],
  claimed: ["running", "ready"], // ready = unclaim
  running: ["review", "ready"], // ready = abandon back to the pool
  review: ["accepted", "rejected", "running"], // running = rework
  accepted: [],
  rejected: ["ready"], // rejected work can be re-opened
};

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  criteria: string | null;
  source_uri: string | null;
  claimed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  at: string;
  kind: "created" | "status" | "note";
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  actor: string | null;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  criteria?: string;
  /** Traceability: which interview/fact/document this task came from */
  sourceUri?: string;
  draft?: boolean;
  actor?: string;
}

export function createTask(db: Ledger, input: CreateTaskInput): TaskRow {
  if (!input.title?.trim()) throw new Error("a task needs a title");
  const now = nowIso();
  const task: TaskRow = {
    id: newId("task"),
    title: input.title.trim(),
    description: input.description ?? null,
    status: input.draft ? "draft" : "ready",
    criteria: input.criteria ?? null,
    source_uri: input.sourceUri ?? null,
    claimed_by: null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO tasks (id, title, description, status, criteria, source_uri, claimed_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    task.id,
    task.title,
    task.description,
    task.status,
    task.criteria,
    task.source_uri,
    task.claimed_by,
    task.created_at,
    task.updated_at,
  );
  logEvent(db, task.id, { kind: "created", to: task.status, actor: input.actor });
  return task;
}

function logEvent(
  db: Ledger,
  taskId: string,
  event: { kind: TaskEvent["kind"]; from?: string; to?: string; note?: string; actor?: string },
): void {
  db.prepare(
    `INSERT INTO task_events (id, task_id, at, kind, from_status, to_status, note, actor)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("tev"),
    taskId,
    nowIso(),
    event.kind,
    event.from ?? null,
    event.to ?? null,
    event.note ?? null,
    event.actor ?? null,
  );
}

export function getTask(db: Ledger, id: string): TaskRow | null {
  return (db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as TaskRow | undefined) ?? null;
}

export function taskEvents(db: Ledger, id: string): TaskEvent[] {
  return db
    .prepare(`SELECT * FROM task_events WHERE task_id = ? ORDER BY at`)
    .all(id) as TaskEvent[];
}

export function listTasks(db: Ledger, options: { status?: TaskStatus } = {}): TaskRow[] {
  if (options.status) {
    return db
      .prepare(`SELECT * FROM tasks WHERE status = ? ORDER BY updated_at DESC`)
      .all(options.status) as TaskRow[];
  }
  return db.prepare(`SELECT * FROM tasks ORDER BY updated_at DESC`).all() as TaskRow[];
}

export interface TransitionOptions {
  actor?: string;
  note?: string;
}

export function transitionTask(
  db: Ledger,
  id: string,
  to: TaskStatus,
  options: TransitionOptions = {},
): TaskRow {
  const task = getTask(db, id);
  if (!task) throw new Error(`task "${id}" not found`);
  if (!TRANSITIONS[task.status].includes(to)) {
    throw new Error(
      `illegal transition ${task.status} -> ${to} (allowed: ${TRANSITIONS[task.status].join(", ") || "none"})`,
    );
  }
  const claimedBy =
    to === "claimed" ? (options.actor ?? "unknown") : to === "ready" ? null : task.claimed_by;
  db.prepare(`UPDATE tasks SET status = ?, claimed_by = ?, updated_at = ? WHERE id = ?`).run(
    to,
    claimedBy,
    nowIso(),
    id,
  );
  logEvent(db, id, {
    kind: "status",
    from: task.status,
    to,
    note: options.note,
    actor: options.actor,
  });
  return getTask(db, id)!;
}

export function addTaskNote(db: Ledger, id: string, note: string, actor?: string): void {
  if (!getTask(db, id)) throw new Error(`task "${id}" not found`);
  if (!note?.trim()) throw new Error("empty note");
  logEvent(db, id, { kind: "note", note: note.trim(), actor });
}

/* ---------------- context bundle ---------------- */

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
