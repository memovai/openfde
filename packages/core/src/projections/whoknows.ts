import type { Ledger } from "../ledger/database.js";
import { ftsQuery } from "../ledger/search.js";

/**
 * "Who is the expert in Y?" is one of the three questions every internal
 * knowledge base exists to answer. Here it is a deterministic projection:
 * people are ranked by their recorded involvement with facts matching the
 * topic — ownership and decisions weigh more than mentions, and being the
 * person who said it counts too. Every score is backed by cited evidence.
 */

export interface ExpertEvidence {
  statement: string;
  predicate: string;
  sourceUri: string;
  role: "subject" | "object" | "speaker";
}

export interface Expert {
  name: string;
  /** true when the name resolves to a Person entity in the graph */
  inGraph: boolean;
  score: number;
  evidence: ExpertEvidence[];
}

/** How much each kind of involvement says about expertise */
const PREDICATE_WEIGHT: Record<string, number> = {
  OWNS: 3,
  DECIDED_BY: 3,
  TRUSTS: 2,
  REPORTED: 2,
};

interface FactRow {
  statement: string;
  predicate: string;
  sourceUri: string;
  speaker: string | null;
  subject: string;
  subjectType: string;
  object: string | null;
  objectType: string | null;
}

export function buildWhoKnows(db: Ledger, topic: string, limit = 5): Expert[] {
  const fts = ftsQuery(topic);
  const rows = db
    .prepare(
      `SELECT f.statement, f.predicate, e.source_uri AS sourceUri, e.speaker,
              s.name AS subject, s.type AS subjectType,
              o.name AS object, o.type AS objectType
       FROM fact_fts
       JOIN facts f ON f.id = fact_fts.fact_id
       JOIN entities s ON s.id = f.subject_id
       LEFT JOIN entities o ON o.id = f.object_id
       JOIN episodes e ON e.id = f.episode_id
       WHERE fact_fts MATCH ? AND f.expired_at IS NULL
       ORDER BY rank LIMIT 80`,
    )
    .all(fts) as FactRow[];

  const experts = new Map<string, Expert>();
  const credit = (
    name: string,
    inGraph: boolean,
    weight: number,
    row: FactRow,
    role: ExpertEvidence["role"],
  ) => {
    const key = name.toLowerCase();
    const expert = experts.get(key) ?? { name, inGraph, score: 0, evidence: [] };
    expert.inGraph = expert.inGraph || inGraph;
    expert.score += weight;
    if (expert.evidence.length < 3 && !expert.evidence.some((e) => e.statement === row.statement)) {
      expert.evidence.push({
        statement: row.statement,
        predicate: row.predicate,
        sourceUri: row.sourceUri,
        role,
      });
    }
    experts.set(key, expert);
  };

  for (const row of rows) {
    const base = PREDICATE_WEIGHT[row.predicate] ?? 1;
    if (row.subjectType === "Person" || row.subjectType === "Customer") {
      credit(row.subject, true, base * 2, row, "subject");
    }
    if (row.object && (row.objectType === "Person" || row.objectType === "Customer")) {
      credit(row.object, true, base * 1.5, row, "object");
    }
    if (row.speaker) credit(row.speaker, false, 1, row, "speaker");
  }

  return [...experts.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function whoKnowsMarkdown(experts: Expert[], topic: string): string {
  const md = [`# Who knows about "${topic}"`, ""];
  if (experts.length === 0) {
    md.push("_No one on record yet. Ingest interviews mentioning this topic and run `openfde extract`._");
    return md.join("\n");
  }
  for (const expert of experts) {
    md.push(`## ${expert.name}`, "");
    md.push(`score: ${expert.score.toFixed(1)}${expert.inGraph ? "" : " · (speaker only, not yet an entity)"}`, "");
    for (const ev of expert.evidence) {
      md.push(`- ${ev.statement}`, `  \`${ev.predicate}\` · as ${ev.role}`, `  <small>${ev.sourceUri}</small>`);
    }
    md.push("");
  }
  return md.join("\n");
}
