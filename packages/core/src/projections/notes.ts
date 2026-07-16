import type { Ledger } from "../ledger/database.js";
import { getTask, listTasks, taskEvents, TASK_STATUSES } from "../dispatch/tasks.js";
import { entityFlow } from "./flows.js";

/**
 * Notes are read-only markdown projections of the ledger (DESIGN 4.9).
 * The server generates markdown; the UI renders it. Entity references
 * become [[wiki-links]] so the graph stays navigable in text form.
 */

interface EntityRow {
  id: string;
  type: string;
  name: string;
  summary: string | null;
  trust: string | null;
}

interface EpisodeRow {
  id: string;
  kind: string;
  content: string;
  source_uri: string;
  span: string | null;
  speaker: string | null;
  occurred_at: string | null;
  ingested_at: string;
  extraction_status: string;
}

interface FactRow {
  id: string;
  predicate: string;
  statement: string;
  quote: string | null;
  valid_from: string | null;
  expired_at: string | null;
  subject: string;
  object: string | null;
  source_uri: string;
  speaker: string | null;
  occurred_at: string | null;
  episode_id: string;
}

export interface TreeItem {
  id: string;
  label: string;
  hint?: string;
}

export interface TreeGroup {
  label: string;
  items: TreeItem[];
}

export interface TreeSection {
  label: string;
  groups: TreeGroup[];
}

export function loadTree(db: Ledger): { sections: TreeSection[] } {
  const entities = db
    .prepare(
      `SELECT id, type, name FROM entities WHERE expired_at IS NULL ORDER BY type, name COLLATE NOCASE`,
    )
    .all() as Pick<EntityRow, "id" | "type" | "name">[];

  const byType = new Map<string, TreeItem[]>();
  for (const e of entities) {
    if (!byType.has(e.type)) byType.set(e.type, []);
    byType.get(e.type)!.push({ id: e.id, label: e.name });
  }

  const episodes = db
    .prepare(
      `SELECT id, kind, source_uri, span, speaker, ingested_at, extraction_status
       FROM episodes ORDER BY ingested_at DESC`,
    )
    .all() as EpisodeRow[];

  const tasks = listTasks(db);
  const tasksByStatus = new Map<string, TreeItem[]>();
  for (const t of tasks) {
    if (!tasksByStatus.has(t.status)) tasksByStatus.set(t.status, []);
    tasksByStatus.get(t.status)!.push({ id: t.id, label: t.title });
  }

  return {
    sections: [
      {
        label: "Tasks",
        groups: TASK_STATUSES.filter((s) => tasksByStatus.has(s)).map((s) => ({
          label: s,
          items: tasksByStatus.get(s)!,
        })),
      },
      {
        label: "Entities",
        groups: [...byType.entries()].map(([type, items]) => ({ label: type, items })),
      },
      {
        label: "Episodes",
        groups: [
          {
            label: "Sources",
            items: episodes.map((ep) => ({
              id: ep.id,
              label: ep.span ?? ep.source_uri.split("/").pop() ?? ep.source_uri,
              hint: ep.extraction_status === "pending" ? "pending" : undefined,
            })),
          },
        ],
      },
    ],
  };
}

export function taskNote(db: Ledger, id: string): string | null {
  const task = getTask(db, id);
  if (!task) return null;
  const events = taskEvents(db, id);

  const md: string[] = [`# ${task.title}`, ""];
  const meta = [
    `status: \`${task.status}\``,
    task.claimed_by ? `claimed by: **${task.claimed_by}**` : null,
    `created: ${task.created_at.slice(0, 10)}`,
  ].filter(Boolean);
  md.push(meta.join(" · "));
  if (task.source_uri) md.push("", `<small>origin: ${task.source_uri}</small>`);
  if (task.description) md.push("", task.description);
  if (task.criteria) md.push("", "## Acceptance criteria", "", `> ${task.criteria}`);

  md.push("", `## Timeline (${events.length})`, "");
  for (const ev of events) {
    const what =
      ev.kind === "status"
        ? `\`${ev.from_status}\` → \`${ev.to_status}\``
        : ev.kind === "created"
          ? `created as \`${ev.to_status}\``
          : "note";
    md.push(
      `- ${what}${ev.note ? ` — ${ev.note}` : ""}`,
      `  <small>${ev.at.slice(0, 19).replace("T", " ")}${ev.actor ? ` · ${ev.actor}` : ""}</small>`,
      "",
    );
  }

  md.push(
    "## Work with it",
    "",
    "```",
    `openfde context ${task.id}`,
    `openfde task claim ${task.id} && openfde task start ${task.id}`,
    "```",
  );
  return md.join("\n");
}

const FACT_SELECT = `
  SELECT f.id, f.predicate, f.statement, f.quote, f.valid_from, f.expired_at, f.episode_id,
         s.name AS subject, o.name AS object,
         e.source_uri, e.speaker, e.occurred_at
  FROM facts f
  JOIN entities s ON s.id = f.subject_id
  LEFT JOIN entities o ON o.id = f.object_id
  JOIN episodes e ON e.id = f.episode_id
`;

function factBullet(f: FactRow, subjectPerspective: string | null): string {
  const struck = f.expired_at ? "~~" : "";
  const when = (f.valid_from ?? f.occurred_at ?? "").slice(0, 10);
  const other =
    subjectPerspective && f.subject === subjectPerspective
      ? f.object
        ? ` → [[${f.object}]]`
        : ""
      : ` ← [[${f.subject}]]`;
  const lines = [
    `- ${struck}${f.statement}${struck}${f.expired_at ? " `superseded`" : ""}`,
    `  \`${f.predicate}\`${other}${when ? ` · ${when}` : ""}`,
  ];
  if (f.quote) lines.push(`  > ${f.quote.replace(/\n/g, " ")}`);
  lines.push(`  <small>${f.source_uri}${f.speaker ? ` · ${f.speaker}` : ""}</small>`);
  return lines.join("\n");
}

export function entityNote(db: Ledger, id: string): string | null {
  const entity = db
    .prepare(`SELECT id, type, name, summary, trust FROM entities WHERE id = ?`)
    .get(id) as EntityRow | undefined;
  if (!entity) return null;

  const facts = db
    .prepare(
      `${FACT_SELECT} WHERE f.subject_id = ? OR f.object_id = ?
       ORDER BY f.expired_at IS NOT NULL, coalesce(f.valid_from, e.occurred_at, f.created_at)`,
    )
    .all(id, id) as FactRow[];

  const active = facts.filter((f) => !f.expired_at);
  const superseded = facts.filter((f) => f.expired_at);

  const md: string[] = [`# ${entity.name}`, ""];
  const badges = [`**${entity.type}**`];
  if (entity.trust && entity.trust !== "unknown") badges.push(`trust: \`${entity.trust}\``);
  md.push(badges.join(" · "));
  if (entity.summary) md.push("", `> ${entity.summary}`);

  const flow = entityFlow(db, id);
  if (flow) md.push("", "## Flow", "", "```mermaid", flow, "```");

  md.push("", `## Facts (${active.length})`, "");
  if (active.length === 0) md.push("_No active facts._");
  for (const f of active) md.push(factBullet(f, entity.name), "");

  if (superseded.length > 0) {
    md.push(`## Superseded (${superseded.length})`, "");
    for (const f of superseded) md.push(factBullet(f, entity.name), "");
  }
  return md.join("\n");
}

export function episodeNote(db: Ledger, id: string): string | null {
  const ep = db.prepare(`SELECT * FROM episodes WHERE id = ?`).get(id) as EpisodeRow | undefined;
  if (!ep) return null;

  const facts = db
    .prepare(`${FACT_SELECT} WHERE f.episode_id = ? ORDER BY f.created_at`)
    .all(id) as FactRow[];

  const title = ep.span ?? ep.source_uri.split("/").pop() ?? "episode";
  const md: string[] = [`# ${title}`, ""];
  const meta = [
    `kind: \`${ep.kind}\``,
    ep.speaker ? `speaker: **${ep.speaker}**` : null,
    ep.occurred_at ? `occurred: ${ep.occurred_at.slice(0, 10)}` : null,
    `status: \`${ep.extraction_status}\``,
  ].filter(Boolean);
  md.push(meta.join(" · "), "", `<small>${ep.source_uri}</small>`, "");

  md.push(`## Extracted facts (${facts.length})`, "");
  if (facts.length === 0) md.push("_Nothing extracted yet. Run `openfde extract`._");
  for (const f of facts) md.push(factBullet(f, null), "");

  md.push("## Source content", "", "```", ep.content.trim(), "```");
  return md.join("\n");
}

/** Resolve a [[wiki-link]] target (entity name) to its note id */
export function resolveEntityByName(db: Ledger, name: string): string | null {
  const row = db
    .prepare(
      `SELECT id FROM entities WHERE lower(name) = lower(?) AND expired_at IS NULL LIMIT 1`,
    )
    .get(name) as { id: string } | undefined;
  return row?.id ?? null;
}
