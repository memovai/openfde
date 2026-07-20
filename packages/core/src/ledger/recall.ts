import type { Ledger } from "./database.js";
import { ftsQuery } from "./search.js";

/**
 * Hybrid retrieval, no LLM on the read path (design informed by how
 * Cerebras built its internal knowledge base):
 *
 * Fact retrieval fuses two ranked lists, and no single scorer is
 * trusted on its own:
 *   lexical — BM25 over extracted facts (exact tokens + term rarity)
 *   graph   — facts touching entities whose names match the query
 * (An embedding retriever slots in as a third list when it lands;
 * see ARCHITECTURE.md.)
 *
 * The lists are fused with reciprocal rank fusion (score += 1/(60+rank)),
 * then modified by recency decay (equal relevance: the newer fact wins)
 * and a superseded penalty, deduplicated, and capped per source so one
 * noisy document cannot crowd out the rest.
 *
 * Raw episode content is a separate evidence channel (matchingEpisodes):
 * BM25 over full transcripts, indexed at ingest time, so literal error
 * strings are findable before extraction runs. It deliberately does NOT
 * expand into that episode's facts — one long interview would drag its
 * unrelated facts into every result set.
 */

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
  /** fused relevance score (higher is better) */
  score: number;
  /** which retrievers surfaced this hit: lexical | raw | graph */
  via: string[];
}

export interface RecallOptions {
  mode?: "default" | "handoff";
  limit?: number;
  /** Handoff mode includes superseded facts (answers "what did we know then / why did it change") */
  includeExpired?: boolean;
}

/** An episode whose raw content matches the query (extraction may still be pending) */
export interface EpisodeMatch {
  episodeId: string;
  sourceUri: string;
  span: string | null;
  extractionStatus: string;
  snippet: string;
}

const HIT_SELECT = `
  SELECT f.id AS factId, f.statement, f.predicate, f.quote,
         f.valid_from AS validFrom, f.expired_at AS expiredAt, f.invalidated_by AS invalidatedBy,
         f.created_at AS createdAt,
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
  createdAt: string;
  subject: string;
  object: string | null;
  sourceUri: string;
  speaker: string | null;
  occurredAt: string | null;
}

const RRF_K = 60;
/** recency half-life in days: at ~180 days a fact has lost half its freshness bonus */
const HALF_LIFE_DAYS = 180;
const SOURCE_CAP = 6;

function recencyMultiplier(row: RawHit): number {
  const when = row.validFrom ?? row.occurredAt ?? row.createdAt;
  const ageDays = Math.max(0, (Date.now() - Date.parse(when)) / 86_400_000);
  if (!Number.isFinite(ageDays)) return 1;
  // floor keeps old-but-relevant facts alive; decay only breaks ties
  return 0.6 + 0.4 * Math.exp((-Math.LN2 * ageDays) / HALF_LIFE_DAYS);
}

export function recall(db: Ledger, query: string, options: RecallOptions = {}): RecallHit[] {
  const mode = options.mode ?? "default";
  const limit = options.limit ?? 20;
  const includeExpired = options.includeExpired ?? mode === "handoff";
  const expiredFilter = includeExpired ? "" : "AND f.expired_at IS NULL";
  const fts = ftsQuery(query);
  const pool = Math.max(30, limit * 3);

  // retriever: lexical over facts (BM25 = exact tokens weighted by rarity)
  const lexical = (
    db
      .prepare(`SELECT fact_id AS id FROM fact_fts WHERE fact_fts MATCH ? ORDER BY rank LIMIT ?`)
      .all(fts, pool) as { id: string }[]
  ).map((r) => r.id);

  // retriever: graph neighborhood of matching entities
  const entityIds = (
    db
      .prepare(
        `SELECT entity_id AS id FROM entity_fts WHERE entity_fts MATCH ? ORDER BY rank LIMIT 10`,
      )
      .all(fts) as { id: string }[]
  ).map((r) => r.id);
  const graph: string[] = [];
  if (entityIds.length > 0) {
    const placeholders = entityIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT id, subject_id AS sid, object_id AS oid FROM facts
         WHERE subject_id IN (${placeholders}) OR object_id IN (${placeholders})`,
      )
      .all(...entityIds, ...entityIds) as { id: string; sid: string; oid: string | null }[];
    const order = new Map(entityIds.map((id, i) => [id, i]));
    const entityRank = (r: { sid: string; oid: string | null }) =>
      Math.min(order.get(r.sid) ?? 99, order.get(r.oid ?? "") ?? 99);
    rows.sort((a, b) => entityRank(a) - entityRank(b));
    graph.push(...rows.map((r) => r.id));
  }

  // reciprocal rank fusion: consensus across retrievers beats one strong vote
  const fused = new Map<string, { score: number; via: Set<string> }>();
  for (const [name, list] of [["lexical", lexical], ["graph", graph]] as const) {
    list.forEach((factId, rank) => {
      const entry = fused.get(factId) ?? { score: 0, via: new Set<string>() };
      entry.score += 1 / (RRF_K + rank);
      entry.via.add(name);
      fused.set(factId, entry);
    });
  }
  if (fused.size === 0) return [];

  const ids = [...fused.keys()];
  const placeholders = ids.map(() => "?").join(",");
  const rows = db
    .prepare(`${HIT_SELECT} WHERE f.id IN (${placeholders}) ${expiredFilter}`)
    .all(...ids) as RawHit[];

  const hits: RecallHit[] = rows.map((row) => {
    const entry = fused.get(row.factId)!;
    let score = entry.score * recencyMultiplier(row);
    if (row.expiredAt) score *= 0.5;
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
      score,
      via: [...entry.via],
    };
  });

  if (mode === "handoff") {
    hits.sort((a, b) =>
      (a.validFrom ?? a.occurredAt ?? "").localeCompare(b.validFrom ?? b.occurredAt ?? ""),
    );
    return hits.slice(0, limit);
  }

  hits.sort((a, b) => b.score - a.score);
  // source diversity: one noisy episode cannot crowd out the rest
  const perSource = new Map<string, number>();
  const diverse: RecallHit[] = [];
  for (const hit of hits) {
    const n = perSource.get(hit.sourceUri) ?? 0;
    if (n >= SOURCE_CAP) continue;
    perSource.set(hit.sourceUri, n + 1);
    diverse.push(hit);
    if (diverse.length >= limit) break;
  }
  return diverse;
}

/**
 * Episodes whose raw content matches the query. Surfaced separately so
 * material that has not been extracted yet is still discoverable —
 * "your answer may already be ingested; run extract".
 */
export function matchingEpisodes(
  db: Ledger,
  query: string,
  options: { pendingOnly?: boolean; limit?: number } = {},
): EpisodeMatch[] {
  const fts = ftsQuery(query);
  const statusFilter = options.pendingOnly ? `AND e.extraction_status = 'pending'` : "";
  const rows = db
    .prepare(
      `SELECT e.id AS episodeId, e.source_uri AS sourceUri, e.span,
              e.extraction_status AS extractionStatus, e.content
       FROM episode_fts
       JOIN episodes e ON e.id = episode_fts.episode_id
       WHERE episode_fts MATCH ? ${statusFilter}
       ORDER BY rank LIMIT ?`,
    )
    .all(fts, options.limit ?? 5) as (EpisodeMatch & { content: string })[];
  return rows.map(({ content, ...row }) => ({
    ...row,
    snippet: content.replace(/\s+/g, " ").trim().slice(0, 140),
  }));
}
