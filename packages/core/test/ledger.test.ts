import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEngagement,
  listEngagements,
  resolveEngagement,
  openLedger,
  ingestEpisode,
  runExtraction,
  recall,
  MockExtractor,
  createTask,
  listTasks,
  transitionTask,
  addTaskNote,
  taskEvents,
  buildTaskContext,
  contextMarkdown,
  buildReport,
  reportMarkdown,
  type Ledger,
} from "../src/index.js";

let home: string;
let db: Ledger;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "openfde-test-"));
  process.env.OPENFDE_HOME = home;
  createEngagement("acme corp");
  db = openLedger("acme-corp");
});

afterEach(() => {
  db.close();
  rmSync(home, { recursive: true, force: true });
  delete process.env.OPENFDE_HOME;
});

describe("engagement", () => {
  it("directory-level isolation: created engagement is listed and becomes current", () => {
    expect(listEngagements()).toEqual(["acme-corp"]);
    expect(resolveEngagement()).toBe("acme-corp");
  });

  it("rejects duplicate names", () => {
    expect(() => createEngagement("Acme Corp")).toThrow(/already exists/);
  });
});

describe("provenance hard constraint", () => {
  it("rejects ingestion without a source_uri", () => {
    expect(() =>
      ingestEpisode(db, { kind: "text", content: "hello", sourceUri: "  " }),
    ).toThrow(/provenance/);
  });
});

const INTERVIEW = [
  "Person:Wang|TRUSTS|DataSource:settlement-db :: Wang only trusts data from the settlement DB",
  "Workflow:monthly-reconciliation|DEPENDS_ON|System:SAP :: The monthly reconciliation workflow depends on the SAP export",
].join("\n");

describe("ingest -> extract -> resolve", () => {
  it("extraction produces entities and facts, every fact carries provenance", async () => {
    ingestEpisode(db, {
      kind: "message",
      content: INTERVIEW,
      sourceUri: "interview://2026-07-15/onsite",
      speaker: "Wang",
      occurredAt: "2026-07-15T10:00:00Z",
    });
    const stats = await runExtraction(db, new MockExtractor());
    expect(stats.episodes).toBe(1);
    expect(stats.facts.ADD).toBe(2);

    const facts = db.prepare("SELECT episode_id FROM facts").all() as { episode_id: string }[];
    expect(facts).toHaveLength(2);
    expect(facts.every((f) => f.episode_id.startsWith("ep_"))).toBe(true);
  });

  it("re-ingesting identical content resolves to NOOP, no duplicate facts", async () => {
    for (let i = 0; i < 2; i++) {
      ingestEpisode(db, {
        kind: "message",
        content: INTERVIEW,
        sourceUri: `interview://2026-07-15/onsite#${i}`,
      });
    }
    const stats = await runExtraction(db, new MockExtractor());
    expect(stats.facts.ADD).toBe(2);
    expect(stats.facts.NOOP).toBe(2);
    const count = db.prepare("SELECT count(*) AS n FROM facts").get() as { n: number };
    expect(count.n).toBe(2);
  });

  it("contradiction: new statement on the same triple supersedes without deleting", async () => {
    ingestEpisode(db, {
      kind: "message",
      content:
        "Person:Wang|TRUSTS|DataSource:settlement-db :: Wang only trusts data from the settlement DB",
      sourceUri: "interview://march",
      occurredAt: "2026-03-01T00:00:00Z",
    });
    await runExtraction(db, new MockExtractor());
    ingestEpisode(db, {
      kind: "message",
      content:
        "Person:Wang|TRUSTS|DataSource:settlement-db :: Wang says the settlement DB lags now and he cross-checks everything",
      sourceUri: "interview://july",
      occurredAt: "2026-07-01T00:00:00Z",
    });
    const stats = await runExtraction(db, new MockExtractor());
    expect(stats.facts.INVALIDATE).toBe(1);

    const rows = db
      .prepare("SELECT expired_at, invalidated_by FROM facts ORDER BY created_at")
      .all() as { expired_at: string | null; invalidated_by: string | null }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.expired_at).not.toBeNull();
    expect(rows[0]!.invalidated_by).toMatch(/^fact_/);
    expect(rows[1]!.expired_at).toBeNull();
  });

  it("entity resolution: case-insensitive reuse, no duplicate entities", async () => {
    ingestEpisode(db, {
      kind: "message",
      content: [
        "Person:Wang|OWNS|System:sap :: Wang owns SAP",
        "Workflow:reconciliation|DEPENDS_ON|System:SAP :: Reconciliation depends on SAP",
      ].join("\n"),
      sourceUri: "doc://systems",
    });
    await runExtraction(db, new MockExtractor());
    const systems = db
      .prepare("SELECT name FROM entities WHERE type = 'System'")
      .all() as { name: string }[];
    expect(systems).toHaveLength(1);
  });
});

describe("recall", () => {
  beforeEach(async () => {
    ingestEpisode(db, {
      kind: "message",
      content: INTERVIEW,
      sourceUri: "interview://2026-07-15/onsite",
      occurredAt: "2026-07-15T10:00:00Z",
    });
    await runExtraction(db, new MockExtractor());
  });

  it("keyword hit returns facts with provenance", () => {
    const hits = recall(db, "settlement");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.sourceUri).toBe("interview://2026-07-15/onsite");
    expect(hits[0]!.quote).toContain("settlement");
  });

  it("entity-name hit expands one hop: querying SAP surfaces reconciliation facts", () => {
    const hits = recall(db, "SAP");
    expect(hits.some((h) => h.statement.includes("reconciliation"))).toBe(true);
  });

  it("handoff mode includes superseded facts ordered on a timeline", async () => {
    ingestEpisode(db, {
      kind: "message",
      content:
        "Person:Wang|TRUSTS|DataSource:settlement-db :: Wang no longer trusts the settlement DB",
      sourceUri: "interview://later",
      occurredAt: "2026-08-01T00:00:00Z",
    });
    await runExtraction(db, new MockExtractor());

    const defaults = recall(db, "settlement");
    expect(defaults.every((h) => !h.expired)).toBe(true);

    const handoff = recall(db, "settlement", { mode: "handoff" });
    expect(handoff.some((h) => h.expired)).toBe(true);
    const expired = handoff.find((h) => h.expired)!;
    expect(expired.invalidatedBy).toMatch(/^fact_/);
  });
});

describe("tasks (agent-pull dispatch)", () => {
  it("lifecycle: create -> claim -> start -> done -> accept, with audit trail", () => {
    const row = createTask(db, {
      title: "Automate CSV cleanup",
      criteria: "Cleanup step runs without manual edits",
      sourceUri: "interview://2026-07-15/onsite",
      actor: "eric",
    });
    expect(row.status).toBe("ready");

    transitionTask(db, row.id, "claimed", { actor: "claude-code" });
    transitionTask(db, row.id, "running", { actor: "claude-code" });
    addTaskNote(db, row.id, "found the export job config", "claude-code");
    transitionTask(db, row.id, "review", { actor: "claude-code", note: "ready for eval" });
    const final = transitionTask(db, row.id, "accepted", { actor: "eric" });
    expect(final.status).toBe("accepted");

    const events = taskEvents(db, row.id);
    expect(events.map((e) => e.kind)).toEqual([
      "created", "status", "status", "note", "status", "status",
    ]);
    expect(events[1]!.actor).toBe("claude-code");
  });

  it("illegal transitions are rejected", () => {
    const row = createTask(db, { title: "A task" });
    expect(() => transitionTask(db, row.id, "accepted")).toThrow(/illegal transition/);
    expect(() => transitionTask(db, row.id, "running")).toThrow(/illegal transition/);
  });

  it("unclaim releases the claim", () => {
    const row = createTask(db, { title: "A task" });
    transitionTask(db, row.id, "claimed", { actor: "claude-code" });
    const released = transitionTask(db, row.id, "ready");
    expect(released.claimed_by).toBeNull();
    expect(listTasks(db, { status: "ready" })).toHaveLength(1);
  });

  it("context bundle always ships constraints and finds related memory with citations", async () => {
    ingestEpisode(db, {
      kind: "message",
      content: [
        "Constraint:no-direct-prod-access|BLOCKS|Workflow:reconciliation :: Security forbids direct production DB access",
        "Workflow:reconciliation|DEPENDS_ON|System:SAP :: Reconciliation depends on the SAP export",
        "Person:Wang|OWNS|System:CRM :: Wang owns the CRM",
      ].join("\n"),
      sourceUri: "interview://onsite",
    });
    await runExtraction(db, new MockExtractor());

    const row = createTask(db, {
      title: "Automate reconciliation export",
      description: "Replace the manual SAP export step",
    });
    const context = buildTaskContext(db, row.id);

    expect(context.constraints).toHaveLength(1);
    expect(context.constraints[0]!.statement).toContain("Security forbids");
    expect(context.related.some((h) => h.statement.includes("SAP export"))).toBe(true);
    expect(context.related.some((h) => h.statement.includes("CRM"))).toBe(false);

    const md = contextMarkdown(context);
    expect(md).toContain("## Constraints");
    expect(md).toContain("source: interview://onsite");
    expect(md).toContain(`openfde task done ${row.id}`);
  });
});

describe("engagement report", () => {
  it("answers the four boss questions from the graph, with citations and honest gaps", async () => {
    ingestEpisode(db, {
      kind: "message",
      content: [
        "Person:Li|REPORTED|PainPoint:manual-csv-cleanup :: Li spends every Friday manually cleaning CSV exports",
        "Person:Kim|REPORTED|PainPoint:report-copy-paste :: Kim copies 40 numbers into the weekly report, about 3 hours each time",
        "Asset:reconciliation-agent|AUTOMATES|WorkflowStep:csv-cleanup :: The reconciliation agent automates the CSV cleanup step",
        "Constraint:no-direct-prod-access|BLOCKS|Workflow:reconciliation :: Security forbids direct production DB access",
      ].join("\n"),
      sourceUri: "interview://onsite",
      speaker: "Wang",
    });
    await runExtraction(db, new MockExtractor());
    const done = createTask(db, { title: "Ship CSV cleanup automation" });
    transitionTask(db, done.id, "claimed", { actor: "claude-code" });
    transitionTask(db, done.id, "running");
    transitionTask(db, done.id, "review");
    transitionTask(db, done.id, "accepted");
    createTask(db, { title: "Automate the weekly report" });

    const report = buildReport(db, "acme-corp");

    // Q1/Q2: opportunities with reporters; quantified vs not
    expect(report.painPoints).toHaveLength(2);
    const csv = report.painPoints.find((p) => p.name === "manual-csv-cleanup")!;
    expect(csv.reporters).toEqual(["Li"]);
    expect(csv.quantified).toBe(false);
    const copyPaste = report.painPoints.find((p) => p.name === "report-copy-paste")!;
    expect(copyPaste.quantified).toBe(true); // "40 numbers … 3 hours" carries digits

    // Q3: automation coverage + delivered tasks
    expect(report.automations).toHaveLength(1);
    expect(report.automations[0]!.step).toBe("csv-cleanup");
    expect(report.tasks.delivered.map((t) => t.title)).toEqual(["Ship CSV cleanup automation"]);

    // Q4: constraints + honest quantification questions only for the unquantified
    expect(report.constraints.length).toBeGreaterThan(0);
    expect(report.quantifyQuestions).toHaveLength(1);
    expect(report.quantifyQuestions[0]).toContain("manual-csv-cleanup");

    const md = reportMarkdown(report);
    expect(md).toContain("## 1. What we can take off your team's plate");
    expect(md).toContain("source: interview://onsite");
    expect(md).toContain("we need answers to");
  });
});

describe("multilingual content (CJK segmentation)", () => {
  // Engagement material arrives in any language; FTS5's unicode61 tokenizer
  // cannot segment CJK, so this guards the app-level segmentation layer.
  it("substring queries match CJK content on both fact and entity paths", async () => {
    ingestEpisode(db, {
      kind: "message",
      content:
        "Workflow:月度対帳|DEPENDS_ON|System:SAP :: 月度対帳プロセスはSAPのエクスポートに依存する",
      sourceUri: "interview://tokyo-onsite",
    });
    await runExtraction(db, new MockExtractor());
    const hits = recall(db, "対帳");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.statement).toContain("月度対帳");
  });
});
