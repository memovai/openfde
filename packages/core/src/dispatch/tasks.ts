import type { Ledger } from "../ledger/database.js";
import { newId, nowIso } from "../ledger/database.js";

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
  /** Decision lineage: what actually happened once the work was accepted */
  outcome: string | null;
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
    outcome: null,
    claimed_by: null,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO tasks (id, title, description, status, criteria, source_uri, outcome, claimed_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    task.id,
    task.title,
    task.description,
    task.status,
    task.criteria,
    task.source_uri,
    task.outcome,
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
  /** Recorded on acceptance: the observed result (decision lineage) */
  outcome?: string;
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
  db.prepare(
    `UPDATE tasks SET status = ?, claimed_by = ?, outcome = coalesce(?, outcome), updated_at = ? WHERE id = ?`,
  ).run(to, claimedBy, options.outcome ?? null, nowIso(), id);
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
