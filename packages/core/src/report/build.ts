import type { Ledger } from "../ledger/database.js";
import { listTasks, type TaskRow } from "../dispatch/tasks.js";

/**
 * The engagement report (DESIGN 4.10): the executive-facing projection of the
 * memory graph. Answers the four questions a customer's boss asks after the
 * interview phase: what can you take over, how much load does it remove,
 * what gets replaced, and what is it worth. Every claim is derived from the
 * ledger and carries its citation; missing numbers become explicit
 * quantification questions instead of invented ROI.
 */

export interface Evidence {
  statement: string;
  quote: string | null;
  sourceUri: string;
  speaker: string | null;
}

export interface PainPointReport {
  name: string;
  summary: string | null;
  reporters: string[];
  evidence: Evidence[];
  quantified: boolean;
}

export interface AutomationReport {
  step: string;
  asset: string;
  evidence: Evidence[];
}

/** One line of the live progress feed: a task event with its task title */
export interface ActivityEntry {
  at: string;
  taskTitle: string;
  kind: "created" | "status" | "note";
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actor: string | null;
}

export interface ReportData {
  engagement: string;
  generatedAt: string;
  coverage: {
    episodes: number;
    sources: number;
    speakers: string[];
    entities: number;
    activeFacts: number;
  };
  painPoints: PainPointReport[];
  automations: AutomationReport[];
  constraints: Evidence[];
  tasks: {
    byStatus: Record<string, number>;
    delivered: TaskRow[];
    inFlight: TaskRow[];
    proposed: TaskRow[];
  };
  activity: ActivityEntry[];
  quantifyQuestions: string[];
}

interface FactEvidenceRow {
  statement: string;
  quote: string | null;
  sourceUri: string;
  speaker: string | null;
  subject: string;
  subjectType: string;
  object: string | null;
  objectType: string | null;
  predicate: string;
}

const EVIDENCE_SELECT = `
  SELECT f.statement, f.quote, f.predicate,
         e.source_uri AS sourceUri, e.speaker,
         s.name AS subject, s.type AS subjectType,
         o.name AS object, o.type AS objectType
  FROM facts f
  JOIN entities s ON s.id = f.subject_id
  LEFT JOIN entities o ON o.id = f.object_id
  JOIN episodes e ON e.id = f.episode_id
  WHERE f.expired_at IS NULL
`;

function toEvidence(row: FactEvidenceRow): Evidence {
  return {
    statement: row.statement,
    quote: row.quote,
    sourceUri: row.sourceUri,
    speaker: row.speaker,
  };
}

/** Heuristic: an opportunity counts as quantified once its evidence carries numbers */
function hasNumbers(evidence: Evidence[]): boolean {
  return evidence.some((e) => /\d/.test(`${e.statement} ${e.quote ?? ""}`));
}

export function buildReport(db: Ledger, engagement: string): ReportData {
  const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
  const facts = db.prepare(EVIDENCE_SELECT).all() as FactEvidenceRow[];

  // Pain points: entity + who reported them + everything said about them
  const painEntities = db
    .prepare(`SELECT name, summary FROM entities WHERE type = 'PainPoint' AND expired_at IS NULL`)
    .all() as { name: string; summary: string | null }[];
  const painPoints: PainPointReport[] = painEntities.map((p) => {
    const related = facts.filter((f) => f.subject === p.name || f.object === p.name);
    const reporters = [
      ...new Set(
        related
          .filter((f) => f.predicate === "REPORTED" && f.subjectType === "Person")
          .map((f) => f.subject),
      ),
    ];
    const evidence = related.map(toEvidence);
    return {
      name: p.name,
      summary: p.summary,
      reporters,
      evidence,
      quantified: hasNumbers(evidence),
    };
  });

  // Automation coverage: AUTOMATES edges (asset -> workflow step)
  const automations: AutomationReport[] = facts
    .filter((f) => f.predicate === "AUTOMATES" && f.object)
    .map((f) => ({
      step: f.object!,
      asset: f.subject,
      evidence: [toEvidence(f)],
    }));

  const constraints = facts
    .filter((f) => f.predicate === "BLOCKS" || f.subjectType === "Constraint")
    .map(toEvidence);

  const allTasks = listTasks(db);
  const byStatus: Record<string, number> = {};
  for (const t of allTasks) byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
  const tasks = {
    byStatus,
    delivered: allTasks.filter((t) => t.status === "accepted"),
    inFlight: allTasks.filter((t) => ["claimed", "running", "review"].includes(t.status)),
    proposed: allTasks.filter((t) => ["draft", "ready"].includes(t.status)),
  };

  const speakers = (
    db
      .prepare(`SELECT DISTINCT speaker FROM episodes WHERE speaker IS NOT NULL`)
      .all() as { speaker: string }[]
  ).map((r) => r.speaker);

  const activity = db
    .prepare(
      `SELECT e.at, t.title AS taskTitle, e.kind, e.from_status AS fromStatus,
              e.to_status AS toStatus, e.note, e.actor
       FROM task_events e JOIN tasks t ON t.id = e.task_id
       ORDER BY e.at DESC LIMIT 12`,
    )
    .all() as ActivityEntry[];

  const quantifyQuestions = painPoints
    .filter((p) => !p.quantified)
    .map(
      (p) =>
        `How many hours per week does "${p.name}" cost${p.reporters.length ? ` ${p.reporters.join(", ")}` : ""}, and how many people are involved?`,
    );

  return {
    engagement,
    generatedAt: new Date().toISOString(),
    coverage: {
      episodes: count("SELECT count(*) AS n FROM episodes"),
      sources: count("SELECT count(DISTINCT source_uri) AS n FROM episodes"),
      speakers,
      entities: count("SELECT count(*) AS n FROM entities WHERE expired_at IS NULL"),
      activeFacts: count("SELECT count(*) AS n FROM facts WHERE expired_at IS NULL"),
    },
    painPoints,
    automations,
    constraints,
    tasks,
    activity,
    quantifyQuestions,
  };
}
