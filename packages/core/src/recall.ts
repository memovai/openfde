import type { Ledger } from "./db.js";
import { ftsQuery } from "./fts.js";

export interface RecallHit {
  factId: string;
  statement: string;
  predicate: string;
  subject: string;
  object: string | null;
  quote: string | null;
  sourceUri: string;
  speaker: string | null;
  occurredAt: string | null;
  validFrom: string | null;
  expired: boolean;
  invalidatedBy: string | null;
}

export interface RecallOptions {
  mode?: "default" | "handoff";
  limit?: number;
  /** Handoff mode includes superseded facts (answers "what did we know then / why did it change") */
  includeExpired?: boolean;
}

const HIT_SELECT = `
  SELECT f.id AS factId, f.statement, f.predicate, f.quote,
         f.valid_from AS validFrom, f.expired_at AS expiredAt, f.invalidated_by AS invalidatedBy,
         s.name AS subject, o.name AS object,
         e.source_uri AS sourceUri, e.speaker, e.occurred_at AS occurredAt
  FROM facts f
  JOIN entities s ON s.id = f.subject_id
  LEFT JOIN entities o ON o.id = f.object_id
  JOIN episodes e ON e.id = f.episode_id
`;

interface RawHit {
  factId: string;
  statement: string;
  predicate: string;
  quote: string | null;
  validFrom: string | null;
  expiredAt: string | null;
  invalidatedBy: string | null;
  subject: string;
  object: string | null;
  sourceUri: string;
  speaker: string | null;
  occurredAt: string | null;
}

function toHit(row: RawHit): RecallHit {
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
    expired: row.expiredAt !== null,
    invalidatedBy: row.invalidatedBy,
  };
}

/**
 * No LLM on the read path: direct FTS hits + 1-hop neighborhood expansion from
 * entity-name hits + temporal filtering. Handoff mode orders by timeline and
 * includes superseded facts (with what replaced them).
 */
export function recall(db: Ledger, query: string, options: RecallOptions = {}): RecallHit[] {
  const mode = options.mode ?? "default";
  const limit = options.limit ?? 20;
  const includeExpired = options.includeExpired ?? mode === "handoff";
  const expiredFilter = includeExpired ? "" : "AND f.expired_at IS NULL";
  const fts = ftsQuery(query);

  const direct = db
    .prepare(
      `${HIT_SELECT}
       WHERE f.id IN (SELECT fact_id FROM fact_fts WHERE fact_fts MATCH ?)
       ${expiredFilter}
       LIMIT ?`,
    )
    .all(fts, limit) as RawHit[];

  const entityIds = db
    .prepare(
      `SELECT id FROM entities
       WHERE id IN (SELECT entity_id FROM entity_fts WHERE entity_fts MATCH ?)
       AND expired_at IS NULL LIMIT 10`,
    )
    .all(fts) as { id: string }[];

  let neighbors: RawHit[] = [];
  if (entityIds.length > 0) {
    const placeholders = entityIds.map(() => "?").join(",");
    neighbors = db
      .prepare(
        `${HIT_SELECT}
         WHERE (f.subject_id IN (${placeholders}) OR f.object_id IN (${placeholders}))
         ${expiredFilter}
         LIMIT ?`,
      )
      .all(...entityIds.map((e) => e.id), ...entityIds.map((e) => e.id), limit) as RawHit[];
  }

  const byId = new Map<string, RawHit>();
  for (const row of [...direct, ...neighbors]) byId.set(row.factId, row);
  const hits = [...byId.values()].map(toHit);

  if (mode === "handoff") {
    hits.sort((a, b) =>
      (a.validFrom ?? a.occurredAt ?? "").localeCompare(b.validFrom ?? b.occurredAt ?? ""),
    );
  }
  return hits.slice(0, limit);
}
