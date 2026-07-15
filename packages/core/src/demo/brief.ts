import type { Ledger } from "../ledger/database.js";
import { recall, type RecallHit } from "../ledger/recall.js";

/**
 * The demo brief (gap #1 from the Palantir/YC analysis): YC's FDE playbook
 * is "the demo is the sales pitch" — hear the pain in meeting one, come back
 * next day with a demo that makes the customer feel seen. This assembles the
 * ammunition: their pain, their vocabulary, their constraints, their data —
 * ready to hand to a coding agent that builds the demo.
 */

interface EntityRow {
  name: string;
  type: string;
  summary: string | null;
  trust: string | null;
}

export interface DemoBrief {
  topic: string;
  audience: EntityRow[];
  pains: RecallHit[];
  goals: EntityRow[];
  vocabulary: EntityRow[];
  constraints: RecallHit[];
  dataSources: EntityRow[];
}

export function buildDemoBrief(db: Ledger, topic: string, limit = 12): DemoBrief {
  const hits = recall(db, topic, { limit: limit * 2 });
  const hitNames = new Set<string>();
  for (const hit of hits) {
    hitNames.add(hit.subject);
    if (hit.object) hitNames.add(hit.object);
  }

  const entities = db
    .prepare(`SELECT name, type, summary, trust FROM entities WHERE expired_at IS NULL`)
    .all() as EntityRow[];
  const related = entities.filter((e) => hitNames.has(e.name));

  const constraints = db
    .prepare(
      `SELECT f.id AS factId, f.statement, f.predicate, f.quote,
              f.valid_from AS validFrom, NULL AS expiredAt, NULL AS invalidatedBy,
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
      return { ...row, expired: false } as unknown as RecallHit;
    });

  return {
    topic,
    audience: entities.filter((e) => e.type === "Person"),
    pains: hits.filter((h) => h.predicate === "REPORTED" || /pain/i.test(h.predicate)),
    goals: entities.filter((e) => e.type === "Goal"),
    vocabulary: related.filter((e) => !["Person", "Goal"].includes(e.type)),
    constraints,
    dataSources: entities.filter((e) => e.type === "DataSource"),
  };
}

function cite(hit: RecallHit): string {
  const lines = [`- ${hit.statement}`];
  if (hit.quote) lines.push(`  > ${hit.quote.replace(/\n/g, " ")}`);
  lines.push(`  source: ${hit.sourceUri}${hit.speaker ? ` — ${hit.speaker}` : ""}`);
  return lines.join("\n");
}

/** The markdown handed to a coding agent (or a human) building the demo */
export function demoBriefMarkdown(brief: DemoBrief): string {
  const md: string[] = [
    `# Demo brief: ${brief.topic}`,
    "",
    "Goal of the demo: make the customer feel seen. Show the smallest end-to-end slice",
    "that removes a pain they told us about, in their own vocabulary, on data shaped like theirs.",
    "",
    `## Who is in the room (${brief.audience.length})`,
    "",
  ];
  if (brief.audience.length === 0) md.push("_No people recorded yet._");
  for (const p of brief.audience) md.push(`- **${p.name}**${p.summary ? ` — ${p.summary}` : ""}`);

  md.push("", `## The pain to hit (${brief.pains.length})`, "");
  if (brief.pains.length === 0) md.push("_No pain points matched this topic — run `openfde recall` to explore._");
  for (const pain of brief.pains) md.push(cite(pain), "");

  if (brief.goals.length > 0) {
    md.push(`## Value it should ladder up to`, "");
    for (const g of brief.goals) md.push(`- **${g.name}**${g.summary ? ` — ${g.summary}` : ""}`);
    md.push("");
  }

  md.push(`## Speak their language`, "");
  if (brief.vocabulary.length === 0) md.push("_No related entities found for this topic._");
  for (const v of brief.vocabulary) {
    md.push(`- \`${v.name}\` (${v.type})${v.summary ? ` — ${v.summary}` : ""}`);
  }

  md.push("", `## Constraints the demo must respect (${brief.constraints.length})`, "");
  if (brief.constraints.length === 0) md.push("_None recorded._");
  for (const c of brief.constraints) md.push(cite(c), "");

  md.push(`## Data to fake convincingly (${brief.dataSources.length})`, "");
  for (const ds of brief.dataSources) {
    md.push(
      `- **${ds.name}**${ds.trust && ds.trust !== "unknown" ? ` (trust: ${ds.trust})` : ""}${ds.summary ? ` — ${ds.summary}` : ""}`,
    );
  }

  md.push(
    "",
    "---",
    "## Instructions for the coding agent",
    "",
    "1. Build the smallest demo that shows the pain above disappearing end to end — no scaffolding tours, no settings pages.",
    "2. Use the customer's vocabulary from this brief for every label, entity, and file name.",
    "3. Seed it with fake data shaped like the data sources above (names, volumes, formats).",
    "4. Respect every constraint listed — a demo that violates one kills trust.",
    "5. Optimize for the first 60 seconds: the moment they recognize their own workflow, you have them.",
  );
  return md.join("\n");
}
