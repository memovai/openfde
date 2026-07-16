import type { Ledger } from "../ledger/database.js";

/**
 * Flow diagrams are auto-extracted mermaid projections of the ledger.
 * Where notes explain entities in prose, flows explain the *process*:
 * which goals a workflow supports, which steps compose it, what it
 * depends on, what blocks it, and what already automates it.
 *
 * The emitted mermaid sticks to a small flowchart subset (nodes, labeled
 * edges, :::class tags, classDef) so it renders both on GitHub and in the
 * webui's built-in renderer.
 */

export interface FlowDiagram {
  /** Entity name the diagram is anchored on (workflow name, or "overview") */
  name: string;
  title: string;
  mermaid: string;
  /** Source URIs of the facts the diagram was derived from */
  sources: string[];
  /** How many facts back this diagram */
  factCount: number;
}

interface FlowFact {
  predicate: string;
  subject: string;
  subjectType: string;
  object: string;
  objectType: string;
  source_uri: string;
}

const NODE_CLASS: Record<string, string> = {
  Goal: "goal",
  Workflow: "workflow",
  WorkflowStep: "step",
  System: "system",
  DataSource: "datasource",
  Constraint: "constraint",
  Asset: "asset",
  PainPoint: "pain",
  Decision: "decision",
  Person: "person",
  Customer: "person",
};

/** classDef palette matching the webui light theme; GitHub renders it too */
const CLASS_DEFS = [
  "classDef goal fill:#faf3dc,stroke:#a16207,color:#26241f",
  "classDef workflow fill:#eeebfa,stroke:#6d5bd0,color:#26241f",
  "classDef step fill:#f5f4fc,stroke:#9186d8,color:#26241f",
  "classDef system fill:#e9f0f7,stroke:#3b6ea5,color:#26241f",
  "classDef datasource fill:#e6f2f1,stroke:#0f766e,color:#26241f",
  "classDef constraint fill:#f9ebea,stroke:#b3423a,color:#26241f",
  "classDef asset fill:#e9f3ec,stroke:#2e7d4f,color:#26241f",
  "classDef pain fill:#f4ecf5,stroke:#96609a,color:#26241f",
  "classDef decision fill:#f7edef,stroke:#b05a70,color:#26241f",
  "classDef person fill:#f5f1e3,stroke:#8f7524,color:#26241f",
];

function flowFacts(db: Ledger): FlowFact[] {
  return db
    .prepare(
      `SELECT f.predicate, s.name AS subject, s.type AS subjectType,
              o.name AS object, o.type AS objectType, e.source_uri
       FROM facts f
       JOIN entities s ON s.id = f.subject_id
       JOIN entities o ON o.id = f.object_id
       JOIN episodes e ON e.id = f.episode_id
       WHERE f.expired_at IS NULL AND f.object_id IS NOT NULL`,
    )
    .all() as FlowFact[];
}

class MermaidBuilder {
  private ids = new Map<string, string>();
  private declared = new Set<string>();
  private lines: string[] = [];
  private classes = new Set<string>();

  private id(name: string): string {
    let id = this.ids.get(name);
    if (!id) {
      id = `n${this.ids.size}`;
      this.ids.set(name, id);
    }
    return id;
  }

  private node(name: string, type: string): string {
    const id = this.id(name);
    if (!this.declared.has(id)) {
      this.declared.add(id);
      const cls = NODE_CLASS[type] ?? "person";
      this.classes.add(cls);
      const label = name.replace(/"/g, "'");
      this.lines.push(`  ${id}["${label}"]:::${cls}`);
    }
    return id;
  }

  edge(fact: FlowFact, opts: { dashed?: boolean; reverse?: boolean } = {}): void {
    const from = opts.reverse
      ? this.node(fact.object, fact.objectType)
      : this.node(fact.subject, fact.subjectType);
    const to = opts.reverse
      ? this.node(fact.subject, fact.subjectType)
      : this.node(fact.object, fact.objectType);
    const arrow = opts.dashed ? "-.->" : "-->";
    this.lines.push(`  ${from} ${arrow}|${fact.predicate}| ${to}`);
  }

  get empty(): boolean {
    return this.lines.length === 0;
  }

  build(direction: "LR" | "TD" = "LR"): string {
    const defs = CLASS_DEFS.filter((d) => this.classes.has(d.split(" ")[1]!));
    return [`flowchart ${direction}`, ...this.lines, ...defs.map((d) => `  ${d}`)].join("\n");
  }
}

/** Edges rendered dashed: obstacles rather than flow */
const DASHED = new Set(["BLOCKS", "REPORTED"]);

/**
 * One diagram per workflow: the line (线) with its steps (点), upstream
 * dependencies, blocking constraints, automation assets, and the goal
 * plane (面) it supports.
 */
export function buildFlows(db: Ledger): FlowDiagram[] {
  const facts = flowFacts(db);
  const diagrams: FlowDiagram[] = [];

  const workflows = [
    ...new Set(
      facts.flatMap((f) => [
        f.subjectType === "Workflow" ? f.subject : null,
        f.objectType === "Workflow" ? f.object : null,
      ]),
    ),
  ].filter((w): w is string => w !== null);

  for (const wf of workflows.sort()) {
    const b = new MermaidBuilder();
    const sources = new Set<string>();
    let count = 0;

    // the line and its dots: the workflow plus its PART_OF steps
    const spine = new Set([wf]);
    for (const f of facts) {
      if (f.predicate === "PART_OF" && f.object === wf) spine.add(f.subject);
    }

    // expand outward only along flow semantics, never through people
    const relevant = (f: FlowFact): boolean => {
      switch (f.predicate) {
        case "PART_OF":
          return f.object === wf;
        case "SUPPORTS":
        case "DEPENDS_ON":
          return spine.has(f.subject);
        case "BLOCKS":
        case "AUTOMATES":
          return spine.has(f.object);
        case "RELATES_TO":
          return spine.has(f.subject) || spine.has(f.object);
        default:
          return false;
      }
    };

    for (const f of facts) {
      if (!relevant(f)) continue;
      b.edge(f, { dashed: DASHED.has(f.predicate) });
      sources.add(f.source_uri);
      count++;
    }

    if (b.empty) continue;
    diagrams.push({
      name: wf,
      title: `Flow — ${wf}`,
      mermaid: b.build("LR"),
      sources: [...sources].sort(),
      factCount: count,
    });
  }

  return diagrams;
}

/** The plane (面): every goal and what supports it, one org-value overview */
export function buildOverviewFlow(db: Ledger): FlowDiagram | null {
  const facts = flowFacts(db);
  const b = new MermaidBuilder();
  const sources = new Set<string>();
  let count = 0;
  for (const f of facts) {
    if (f.predicate !== "SUPPORTS" && f.objectType !== "Goal" && f.subjectType !== "Goal") continue;
    b.edge(f, { dashed: DASHED.has(f.predicate) });
    sources.add(f.source_uri);
    count++;
  }
  if (b.empty) return null;
  return {
    name: "overview",
    title: "Value overview — goals and what supports them",
    mermaid: b.build("LR"),
    sources: [...sources].sort(),
    factCount: count,
  };
}

/** Mermaid for a single entity's note (workflow or goal), or null */
export function entityFlow(db: Ledger, entityId: string): string | null {
  const row = db
    .prepare(`SELECT name, type FROM entities WHERE id = ?`)
    .get(entityId) as { name: string; type: string } | undefined;
  if (!row) return null;
  if (row.type === "Goal") return buildOverviewFlow(db)?.mermaid ?? null;
  if (row.type !== "Workflow") return null;
  return buildFlows(db).find((d) => d.name === row.name)?.mermaid ?? null;
}

export function flowsMarkdown(diagrams: FlowDiagram[], engagement: string): string {
  const md = [`# Flows — ${engagement}`, ""];
  if (diagrams.length === 0) {
    md.push(
      "_No flows yet. Flows are extracted from workflow facts — ingest interviews and run `openfde extract`._",
    );
    return md.join("\n");
  }
  md.push(
    "Auto-extracted from the ledger: every edge below is a recorded fact with a source.",
    "",
  );
  for (const d of diagrams) {
    md.push(`## ${d.title}`, "", "```mermaid", d.mermaid, "```", "");
    md.push(`<small>${d.factCount} facts · ${d.sources.join(" · ")}</small>`, "");
  }
  return md.join("\n");
}
