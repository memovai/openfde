import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { setupEnv, teardownEnv, type TestEnv } from "./helpers.js";
import {
  addAsset,
  appendEvalCase,
  assetStats,
  buildDataMap,
  buildDemoBrief,
  dataMapMarkdown,
  demoBriefMarkdown,
  getTask,
  createTask,
  transitionTask,
  ingestEpisode,
  runExtraction,
  listAssets,
  readAsset,
  MockExtractor,
  MockJudge,
  buildReport,
} from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });
const db = () => env.db;

describe("asset library", () => {
  it("stores, lists, reads assets as files; stats count per type", () => {
    const ref = addAsset("acme-corp", "rubric", "CSV Cleanup", "- runs unattended\n- Li reviews only");
    expect(existsSync(ref.path)).toBe(true);
    expect(readAsset("acme-corp", "rubric", "csv cleanup")).toContain("runs unattended");
    addAsset("acme-corp", "prompt", "extraction tone", "Be terse.");
    expect(listAssets("acme-corp")).toHaveLength(2);
    expect(assetStats("acme-corp").rubric).toBe(1);
  });

  it("eval cases append to a growing jsonl dataset", () => {
    const path = appendEvalCase("acme-corp", "csv cleanup", { verdict: "pass", score: 100 });
    appendEvalCase("acme-corp", "csv cleanup", { verdict: "fail", score: 20 });
    const lines = readFileSync(path, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]!).verdict).toBe("fail");
  });
});

describe("mock judge", () => {
  it("scores work against rubric lines deterministically", async () => {
    const judge = new MockJudge();
    const rubric = "- Cleanup runs unattended\n- Alerts on failure";
    const pass = await judge.judge(rubric, "cleanup runs unattended via cron; alerts on failure to #ops");
    expect(pass.verdict).toBe("pass");
    expect(pass.score).toBe(100);
    const partial = await judge.judge(rubric, "cleanup runs unattended only");
    expect(partial.verdict).toBe("partial");
    expect(partial.criteria).toHaveLength(2);
  });
});

describe("decision lineage (task outcome)", () => {
  it("accept --outcome lands on the task and in the report", () => {
    const task = createTask(db(), { title: "Ship CSV automation" });
    transitionTask(db(), task.id, "claimed", { actor: "claude-code" });
    transitionTask(db(), task.id, "running");
    transitionTask(db(), task.id, "review");
    transitionTask(db(), task.id, "accepted", { outcome: "Friday cleanup now takes 0 hours" });
    expect(getTask(db(), task.id)!.outcome).toBe("Friday cleanup now takes 0 hours");
    const report = buildReport(db(), "acme-corp");
    expect(report.tasks.delivered[0]!.outcome).toContain("0 hours");
  });
});

describe("demo brief + data map", () => {
  beforeEach(async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: [
        "Person:Li|REPORTED|PainPoint:manual-csv-cleanup :: Li spends every Friday manually cleaning CSV exports",
        "Constraint:no-direct-prod-access|BLOCKS|Workflow:reconciliation :: Security forbids direct production DB access",
        "Person:Wang|OWNS|DataSource:settlement-db :: Wang owns the settlement DB",
        "Person:Li|TRUSTS|DataSource:settlement-db :: Li trusts the settlement DB",
        "Workflow:reconciliation|DEPENDS_ON|DataSource:settlement-db :: Reconciliation reads the settlement DB",
      ].join("\n"),
      sourceUri: "interview://onsite",
    });
    await runExtraction(db(), new MockExtractor());
  });

  it("demo brief leads with the pain, carries vocabulary, constraints, and agent instructions", () => {
    const brief = buildDemoBrief(db(), "csv cleanup");
    expect(brief.pains.some((p) => p.statement.includes("Friday"))).toBe(true);
    expect(brief.constraints).toHaveLength(1);
    const md = demoBriefMarkdown(brief);
    expect(md).toContain("make the customer feel seen");
    expect(md).toContain("Instructions for the coding agent");
    expect(md).toContain("source: interview://onsite");
  });

  it("data map shows owners, trusters, dependents per source", () => {
    const map = buildDataMap(db());
    expect(map).toHaveLength(1);
    const src = map[0]!;
    expect(src.owners).toEqual(["Wang"]);
    expect(src.trustedBy).toEqual(["Li"]);
    expect(src.dependents).toEqual(["reconciliation"]);
    expect(dataMapMarkdown(map, "acme-corp")).toContain("| **settlement-db** |");
  });
});
