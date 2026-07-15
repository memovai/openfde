import type { Ledger } from "../ledger/database.js";

/**
 * The interview guide (DESIGN 4.13): questions are projections of gaps in
 * the memory graph, organized by the dot-line-plane lens (DESIGN 4.12) —
 * plane = organizational value (Goal), line = business workflows (Workflow),
 * dot = decisions / steps / pains on a flow.
 *
 * Top-down is the boss interview (value first); bottom-up is knowledge
 * mining (thin spots in what we already collected).
 */

export type InterviewMode = "top-down" | "bottom-up";

export interface InterviewSection {
  title: string;
  intro: string;
  questions: string[];
}

export interface InterviewGuide {
  engagement: string;
  mode: InterviewMode;
  sections: InterviewSection[];
}

interface NameRow {
  name: string;
}

function names(db: Ledger, sql: string): string[] {
  return (db.prepare(sql).all() as NameRow[]).map((r) => r.name);
}

function buildTopDown(db: Ledger): InterviewSection[] {
  const sections: InterviewSection[] = [];

  // ---- plane: organizational value ----
  const goals = names(db, `SELECT name FROM entities WHERE type = 'Goal' AND expired_at IS NULL`);
  const planeQuestions: string[] = [];
  if (goals.length === 0) {
    planeQuestions.push(
      "What outcomes would make this quarter (or year) a success for your organization?",
      "How is that success measured today — which numbers does leadership actually look at?",
      "If one thing could run 10x faster or cheaper, what would move the business most?",
    );
  }
  const unsupportedGoals = names(
    db,
    `SELECT g.name FROM entities g
     WHERE g.type = 'Goal' AND g.expired_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM facts f WHERE f.predicate = 'SUPPORTS' AND f.object_id = g.id AND f.expired_at IS NULL
       )`,
  );
  for (const goal of unsupportedGoals) {
    planeQuestions.push(`Which business flows deliver "${goal}", and who owns each of them?`);
  }
  sections.push({
    title: "Plane — organizational value",
    intro: "Start where the boss lives: what the organization is trying to achieve.",
    questions: planeQuestions,
  });

  // ---- line: business flows ----
  const lineQuestions: string[] = [];
  const orphanWorkflows = names(
    db,
    `SELECT w.name FROM entities w
     WHERE w.type = 'Workflow' AND w.expired_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM facts f WHERE f.predicate = 'SUPPORTS' AND f.subject_id = w.id AND f.expired_at IS NULL
       )`,
  );
  for (const workflow of orphanWorkflows) {
    lineQuestions.push(`Which value does "${workflow}" serve — why does the organization run it?`);
  }
  const stepslessWorkflows = names(
    db,
    `SELECT w.name FROM entities w
     WHERE w.type = 'Workflow' AND w.expired_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM facts f
         JOIN entities s ON s.id = f.subject_id
         WHERE f.predicate = 'PART_OF' AND f.object_id = w.id AND f.expired_at IS NULL
       )`,
  );
  for (const workflow of stepslessWorkflows) {
    lineQuestions.push(
      `Walk me through "${workflow}" step by step — where does it start, what happens in the middle, where does it end?`,
    );
  }
  sections.push({
    title: "Line — business flows",
    intro: "Map each flow that carries the value, end to end.",
    questions: lineQuestions,
  });

  // ---- dot: decisions, pains, trust ----
  const dotQuestions: string[] = [];
  const untrustedSources = names(
    db,
    `SELECT name FROM entities
     WHERE type = 'DataSource' AND expired_at IS NULL AND (trust IS NULL OR trust = 'unknown')`,
  );
  for (const source of untrustedSources) {
    dotQuestions.push(`Do people actually trust "${source}"? Who double-checks it, and against what?`);
  }
  const unquantifiedPains = (
    db
      .prepare(
        `SELECT p.name FROM entities p
         WHERE p.type = 'PainPoint' AND p.expired_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM facts f
             WHERE (f.subject_id = p.id OR f.object_id = p.id)
               AND f.expired_at IS NULL
               AND (f.statement GLOB '*[0-9]*' OR f.quote GLOB '*[0-9]*')
           )`,
      )
      .all() as NameRow[]
  ).map((r) => r.name);
  for (const pain of unquantifiedPains) {
    dotQuestions.push(`How many hours per week does "${pain}" cost, and how many people are involved?`);
  }
  sections.push({
    title: "Dot — decisions, pains, trust",
    intro: "Zoom into each flow: where it hurts, who decides, what can't be touched.",
    questions: dotQuestions,
  });

  return sections;
}

function buildBottomUp(db: Ledger): InterviewSection[] {
  const sections: InterviewSection[] = [];

  const pending = (db.prepare(
    `SELECT count(*) AS n FROM episodes WHERE extraction_status = 'pending'`,
  ).get() as { n: number }).n;

  const mining: string[] = [];
  if (pending > 0) {
    mining.push(`${pending} episode(s) are still pending extraction — run \`openfde extract\` first.`);
  }
  const thinEntities = names(
    db,
    `SELECT e.name FROM entities e
     WHERE e.expired_at IS NULL AND e.type != 'Goal'
       AND (SELECT count(*) FROM facts f
            WHERE (f.subject_id = e.id OR f.object_id = e.id) AND f.expired_at IS NULL) <= 1
     ORDER BY e.type LIMIT 10`,
  );
  for (const entity of thinEntities) {
    mining.push(`"${entity}" was mentioned once and never again — ask a practitioner what it really is.`);
  }
  sections.push({
    title: "Thin spots",
    intro: "Things the material barely touched; each is a lead for the next session.",
    questions: mining,
  });

  const structure: string[] = [];
  const rationalelessDecisions = names(
    db,
    `SELECT d.name FROM entities d
     WHERE d.type = 'Decision' AND d.expired_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM facts f
         WHERE f.subject_id = d.id AND f.predicate = 'RATIONALE' AND f.expired_at IS NULL
       )`,
  );
  for (const decision of rationalelessDecisions) {
    structure.push(`Why was "${decision}" decided that way — what alternatives were rejected, and by whom?`);
  }
  const orphanSteps = names(
    db,
    `SELECT s.name FROM entities s
     WHERE s.type = 'WorkflowStep' AND s.expired_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM facts f
         WHERE f.subject_id = s.id AND f.predicate = 'PART_OF' AND f.expired_at IS NULL
       )`,
  );
  for (const step of orphanSteps) {
    structure.push(`Which flow does the step "${step}" belong to, and what comes before/after it?`);
  }
  const orphanPains = names(
    db,
    `SELECT p.name FROM entities p
     WHERE p.type = 'PainPoint' AND p.expired_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM facts f
         JOIN entities o ON o.id = f.object_id
         WHERE f.subject_id = p.id AND o.type IN ('Workflow','WorkflowStep') AND f.expired_at IS NULL
       )
       AND NOT EXISTS (
         SELECT 1 FROM facts f2
         JOIN entities s2 ON s2.id = f2.subject_id
         WHERE f2.object_id = p.id AND s2.type IN ('Workflow','WorkflowStep') AND f2.expired_at IS NULL
       )`,
  );
  for (const pain of orphanPains) {
    structure.push(`Which business flow does "${pain}" live in?`);
  }
  sections.push({
    title: "Structure gaps",
    intro: "Dots we collected but could not yet attach to a line or a plane.",
    questions: structure,
  });

  return sections;
}

export function buildInterviewGuide(
  db: Ledger,
  engagement: string,
  mode: InterviewMode,
): InterviewGuide {
  return {
    engagement,
    mode,
    sections: mode === "top-down" ? buildTopDown(db) : buildBottomUp(db),
  };
}

export function interviewMarkdown(guide: InterviewGuide): string {
  const md: string[] = [
    `# Interview guide — ${guide.engagement} (${guide.mode})`,
    "",
    guide.mode === "top-down"
      ? "Value first, then flows, then the points where they hurt. Questions below are gaps in the current memory graph."
      : "Mining leads: thin spots and unattached dots in what we already collected.",
    "",
  ];
  let total = 0;
  for (const section of guide.sections) {
    md.push(`## ${section.title}`, "", `_${section.intro}_`, "");
    if (section.questions.length === 0) {
      md.push("- Covered — no open gaps here.");
    }
    for (const q of section.questions) {
      md.push(`- ${q}`);
      total += 1;
    }
    md.push("");
  }
  md.push(
    "---",
    total === 0
      ? "_The graph has no open gaps at this level. Ingest more material or switch modes._"
      : `_${total} question(s) generated from graph gaps. After the session: \`openfde ingest\` + \`openfde extract\`, then regenerate._`,
  );
  return md.join("\n");
}
