import type { Ledger } from "./db.js";
import { listTasks, type TaskRow } from "./tasks.js";

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
    quantifyQuestions,
  };
}

function evidenceLines(evidence: Evidence[]): string[] {
  const lines: string[] = [];
  for (const e of evidence.slice(0, 3)) {
    lines.push(`  - ${e.statement}`);
    if (e.quote) lines.push(`    > ${e.quote.replace(/\n/g, " ")}`);
    lines.push(`    source: ${e.sourceUri}${e.speaker ? ` — ${e.speaker}` : ""}`);
  }
  return lines;
}

export function reportMarkdown(report: ReportData): string {
  const md: string[] = [
    `# Engagement report — ${report.engagement}`,
    "",
    `Generated ${report.generatedAt.slice(0, 10)} from ${report.coverage.episodes} sessions, ` +
      `${report.coverage.activeFacts} verified facts` +
      (report.coverage.speakers.length
        ? `, interviews with ${report.coverage.speakers.join(", ")}`
        : "") +
      ". Every claim below links back to its source.",
    "",
    "## 1. What we can take off your team's plate",
    "",
  ];

  if (report.painPoints.length === 0 && report.tasks.proposed.length === 0) {
    md.push("_No opportunities recorded yet — ingest interview material first._");
  }
  for (const p of report.painPoints) {
    md.push(
      `- **${p.name}**${p.reporters.length ? ` — reported by ${p.reporters.join(", ")}` : ""}`,
      ...evidenceLines(p.evidence),
      "",
    );
  }

  md.push("## 2. Where the hours go today", "");
  const quantified = report.painPoints.filter((p) => p.quantified);
  const unquantified = report.painPoints.filter((p) => !p.quantified);
  if (report.painPoints.length === 0) md.push("_No pain points recorded yet._");
  if (quantified.length > 0) {
    for (const p of quantified) md.push(`- **${p.name}**`, ...evidenceLines(p.evidence), "");
  }
  if (unquantified.length > 0) {
    md.push(
      `${unquantified.length} opportunity(ies) still need numbers — see the quantification questions in section 4.`,
      "",
    );
  }

  md.push("## 3. What gets replaced", "");
  if (report.automations.length === 0) {
    md.push("_No automation coverage recorded yet._");
  }
  for (const a of report.automations) {
    md.push(`- **${a.step}** ← automated by \`${a.asset}\``, ...evidenceLines(a.evidence), "");
  }
  if (report.tasks.delivered.length > 0) {
    md.push("", "Delivered and accepted:");
    for (const t of report.tasks.delivered) md.push(`- ${t.title}`);
  }

  md.push("", "## 4. Value and next steps", "");
  const statusLine = Object.entries(report.tasks.byStatus)
    .map(([s, n]) => `${n} ${s}`)
    .join(" · ");
  md.push(
    `Task pipeline: ${statusLine || "empty"}.`,
    "",
    `Constraints we will respect (${report.constraints.length}):`,
    "",
  );
  for (const c of report.constraints) md.push(`- ${c.statement} (${c.sourceUri})`);

  if (report.quantifyQuestions.length > 0) {
    md.push(
      "",
      "To turn this into a hard number, we need answers to:",
      "",
      ...report.quantifyQuestions.map((q) => `- ${q}`),
    );
  } else if (report.painPoints.length > 0) {
    md.push("", "All recorded opportunities carry quantitative evidence.");
  }

  md.push("", "---", "_Generated by openfde from the engagement memory. Numbers are only claimed where sources contain them._");
  return md.join("\n");
}
