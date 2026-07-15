import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEnv, teardownEnv, INTERVIEW, type TestEnv } from "./helpers.js";
import {
  ingestEpisode, runExtraction, MockExtractor,
  createTask, transitionTask, buildReport, reportMarkdown,
} from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });
const db = () => env.db;

describe("engagement report", () => {
  it("answers the four boss questions from the graph, with citations and honest gaps", async () => {
    ingestEpisode(db(), {
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
    await runExtraction(db(), new MockExtractor());
    const done = createTask(db(), { title: "Ship CSV cleanup automation" });
    transitionTask(db(), done.id, "claimed", { actor: "claude-code" });
    transitionTask(db(), done.id, "running");
    transitionTask(db(), done.id, "review");
    transitionTask(db(), done.id, "accepted");
    createTask(db(), { title: "Automate the weekly report" });

    const report = buildReport(db(), "acme-corp");

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
