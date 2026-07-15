import Database from "better-sqlite3";
import { ledgerDbPath, engagementDir, ensureDir } from "../engagement/paths.js";

export type Ledger = Database.Database;

/**
 * One SQLite file per engagement.
 * Design constraints (see DESIGN.md 4.2):
 * - provenance hard constraint: facts.episode_id NOT NULL — sourceless facts are rejected at the schema level
 * - bi-temporal: created_at/expired_at (system time) + valid_from/valid_until (business time)
 * - contradictions invalidate, never delete: invalidated_by links to the replacement, history stays queryable
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('text','message','json')),
  content TEXT NOT NULL,
  source_uri TEXT NOT NULL,
  span TEXT,
  speaker TEXT,
  occurred_at TEXT,
  ingested_at TEXT NOT NULL,
  extraction_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (extraction_status IN ('pending','done','failed','skipped'))
);

CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  summary TEXT,
  trust TEXT,
  created_at TEXT NOT NULL,
  expired_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_entities_type_name ON entities(type, name);

CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  predicate TEXT NOT NULL,
  subject_id TEXT NOT NULL REFERENCES entities(id),
  object_id TEXT REFERENCES entities(id),
  statement TEXT NOT NULL,
  quote TEXT,
  episode_id TEXT NOT NULL REFERENCES episodes(id),
  created_at TEXT NOT NULL,
  expired_at TEXT,
  valid_from TEXT,
  valid_until TEXT,
  invalidated_by TEXT REFERENCES facts(id)
);
CREATE INDEX IF NOT EXISTS idx_facts_triple ON facts(subject_id, predicate, object_id);
CREATE INDEX IF NOT EXISTS idx_facts_episode ON facts(episode_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('draft','ready','claimed','running','review','accepted','rejected')),
  criteria TEXT,
  source_uri TEXT,
  claimed_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Append-only audit trail: every transition and note is an event
CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('created','status','note')),
  from_status TEXT,
  to_status TEXT,
  note TEXT,
  actor TEXT
);
CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);

-- FTS content is maintained by the write path (CJK segmentation happens in app code; SQL triggers cannot do it)
CREATE VIRTUAL TABLE IF NOT EXISTS fact_fts USING fts5(
  statement, quote, fact_id UNINDEXED
);
CREATE VIRTUAL TABLE IF NOT EXISTS entity_fts USING fts5(
  name, summary, entity_id UNINDEXED
);
`;

export function openLedger(slug: string): Ledger {
  ensureDir(engagementDir(slug));
  const db = new Database(ledgerDbPath(slug));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export function newId(prefix: string): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return `${prefix}_${rand}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
