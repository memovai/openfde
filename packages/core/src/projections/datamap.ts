import type { Ledger } from "../ledger/database.js";

/**
 * The data negotiation map (Palantir/YC analysis, "not doing pipelines"):
 * data integration's bottleneck is political, not technical — who owns the
 * data, who trusts it, what depends on it. The graph already knows; this is
 * the projection an FDE brings into the access-negotiation meeting.
 */

export interface DataSourceMap {
  name: string;
  summary: string | null;
  trust: string | null;
  owners: string[];
  trustedBy: string[];
  dependents: string[];
  evidence: { statement: string; sourceUri: string; speaker: string | null }[];
}

export function buildDataMap(db: Ledger): DataSourceMap[] {
  const sources = db
    .prepare(
      `SELECT id, name, summary, trust FROM entities
       WHERE type = 'DataSource' AND expired_at IS NULL ORDER BY name COLLATE NOCASE`,
    )
    .all() as { id: string; name: string; summary: string | null; trust: string | null }[];

  const relations = db
    .prepare(
      `SELECT f.predicate, f.statement, f.object_id, f.subject_id,
              s.name AS subject, s.type AS subjectType,
              e.source_uri AS sourceUri, e.speaker
       FROM facts f
       JOIN entities s ON s.id = f.subject_id
       JOIN episodes e ON e.id = f.episode_id
       WHERE f.expired_at IS NULL AND f.object_id IS NOT NULL`,
    )
    .all() as {
    predicate: string;
    statement: string;
    object_id: string;
    subject: string;
    subjectType: string;
    sourceUri: string;
    speaker: string | null;
  }[];

  return sources.map((src) => {
    const incoming = relations.filter((r) => r.object_id === src.id);
    return {
      name: src.name,
      summary: src.summary,
      trust: src.trust,
      owners: incoming.filter((r) => r.predicate === "OWNS").map((r) => r.subject),
      trustedBy: incoming.filter((r) => r.predicate === "TRUSTS").map((r) => r.subject),
      dependents: incoming.filter((r) => r.predicate === "DEPENDS_ON").map((r) => r.subject),
      evidence: incoming.slice(0, 3).map((r) => ({
        statement: r.statement,
        sourceUri: r.sourceUri,
        speaker: r.speaker,
      })),
    };
  });
}

export function dataMapMarkdown(map: DataSourceMap[], engagement: string): string {
  const md: string[] = [
    `# Data negotiation map — ${engagement}`,
    "",
    "Who owns each data source, who trusts it, and what depends on it.",
    "Bring this into the access-negotiation meeting; the bottleneck is political, not technical.",
    "",
  ];
  if (map.length === 0) {
    md.push("_No data sources recorded yet._");
    return md.join("\n");
  }
  md.push(
    "| Data source | Trust | Owners | Trusted by | Depended on by |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const src of map) {
    md.push(
      `| **${src.name}** | ${src.trust ?? "unknown"} | ${src.owners.join(", ") || "?"} | ${src.trustedBy.join(", ") || "?"} | ${src.dependents.join(", ") || "—"} |`,
    );
  }
  md.push("");
  for (const src of map) {
    if (src.evidence.length === 0) continue;
    md.push(`## ${src.name}`, "");
    if (src.summary) md.push(src.summary, "");
    for (const e of src.evidence) {
      md.push(`- ${e.statement}`, `  source: ${e.sourceUri}${e.speaker ? ` — ${e.speaker}` : ""}`);
    }
    if (src.owners.length === 0) {
      md.push(`- **Open question:** who is the data owner to negotiate with?`);
    }
    md.push("");
  }
  return md.join("\n");
}
