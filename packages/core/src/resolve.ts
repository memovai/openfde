import type { EntityDraft, FactDraft, ResolutionOp } from "@openfde/ontology";
import type { Ledger } from "./db.js";
import { newId, nowIso } from "./db.js";
import { cjkSegment } from "./fts.js";

export interface EntityRow {
  id: string;
  type: string;
  name: string;
  summary: string | null;
  trust: string | null;
}

export interface FactRow {
  id: string;
  predicate: string;
  subject_id: string;
  object_id: string | null;
  statement: string;
  episode_id: string;
  expired_at: string | null;
}

/**
 * Entity resolution v0: reuse on same-type, case-insensitive exact name match;
 * otherwise create. (Embedding candidate recall + LLM adjudication will replace
 * this implementation behind the same interface; callers won't notice.)
 */
export function resolveEntity(db: Ledger, draft: EntityDraft): EntityRow {
  const existing = db
    .prepare(
      `SELECT id, type, name, summary, trust FROM entities
       WHERE type = ? AND lower(name) = lower(?) AND expired_at IS NULL`,
    )
    .get(draft.type, draft.name) as EntityRow | undefined;

  if (existing) {
    if (draft.trust && draft.trust !== "unknown" && draft.trust !== existing.trust) {
      db.prepare(`UPDATE entities SET trust = ? WHERE id = ?`).run(draft.trust, existing.id);
      existing.trust = draft.trust;
    }
    return existing;
  }

  const row: EntityRow = {
    id: newId("ent"),
    type: draft.type,
    name: draft.name,
    summary: draft.summary,
    trust: draft.trust ?? null,
  };
  db.prepare(
    `INSERT INTO entities (id, type, name, summary, trust, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(row.id, row.type, row.name, row.summary, row.trust, nowIso());
  db.prepare(`INSERT INTO entity_fts (name, summary, entity_id) VALUES (?, ?, ?)`).run(
    cjkSegment(row.name),
    cjkSegment(row.summary ?? ""),
    row.id,
  );
  return row;
}

export interface ResolvedFact {
  op: ResolutionOp;
  factId: string | null;
  invalidatedFactId?: string;
}

/**
 * Two-phase write resolution v0:
 * - active fact with identical triple and identical statement → NOOP
 * - same (subject, predicate, object) but a new statement → supersede: old fact
 *   is invalidated (never deleted) and linked to its replacement
 * - anything else → ADD
 */
export function resolveFact(
  db: Ledger,
  draft: FactDraft,
  subjectId: string,
  objectId: string | null,
  episodeId: string,
): ResolvedFact {
  const active = db
    .prepare(
      `SELECT id, statement FROM facts
       WHERE subject_id = ? AND predicate = ? AND object_id IS ? AND expired_at IS NULL`,
    )
    .all(subjectId, draft.predicate, objectId) as Pick<FactRow, "id" | "statement">[];

  const duplicate = active.find(
    (f) => f.statement.trim().toLowerCase() === draft.statement.trim().toLowerCase(),
  );
  if (duplicate) return { op: "NOOP", factId: duplicate.id };

  const now = nowIso();
  const factId = newId("fact");
  db.prepare(
    `INSERT INTO facts (id, predicate, subject_id, object_id, statement, quote, episode_id, created_at, valid_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    factId,
    draft.predicate,
    subjectId,
    objectId,
    draft.statement,
    draft.quote,
    episodeId,
    now,
    draft.validFrom,
  );
  db.prepare(`INSERT INTO fact_fts (statement, quote, fact_id) VALUES (?, ?, ?)`).run(
    cjkSegment(draft.statement),
    cjkSegment(draft.quote),
    factId,
  );

  const superseded = active[0];
  if (superseded) {
    db.prepare(
      `UPDATE facts SET expired_at = ?, valid_until = ?, invalidated_by = ? WHERE id = ?`,
    ).run(now, draft.validFrom ?? now, factId, superseded.id);
    return { op: "INVALIDATE", factId, invalidatedFactId: superseded.id };
  }
  return { op: "ADD", factId };
}
