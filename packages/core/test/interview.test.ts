import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEnv, teardownEnv, type TestEnv } from "./helpers.js";
import {
  buildInterviewGuide,
  interviewMarkdown,
  ingestEpisode,
  runExtraction,
  MockExtractor,
} from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });
const db = () => env.db;

describe("interview guide (dot-line-plane)", () => {
  it("top-down on an empty graph opens with value-plane questions", () => {
    const guide = buildInterviewGuide(db(), "acme-corp", "top-down");
    const plane = guide.sections.find((s) => s.title.startsWith("Plane"))!;
    expect(plane.questions.some((q) => q.includes("success"))).toBe(true);
    expect(interviewMarkdown(guide)).toContain("## Plane — organizational value");
  });

  it("top-down projects graph gaps into targeted questions", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: [
        "Goal:faster-month-close|RELATES_TO|Customer:acme :: Acme wants to close the books in 3 days instead of 10",
        "Workflow:reconciliation|DEPENDS_ON|System:SAP :: Reconciliation depends on SAP",
        "Person:Wang|TRUSTS|DataSource:mes-db :: Wang mentioned the MES DB once",
      ].join("\n"),
      sourceUri: "interview://exec",
    });
    await runExtraction(db(), new MockExtractor());
    // clear the trust marker so the data source counts as unknown
    db().prepare(`UPDATE entities SET trust = NULL WHERE type = 'DataSource'`).run();

    const guide = buildInterviewGuide(db(), "acme-corp", "top-down");
    const all = guide.sections.flatMap((s) => s.questions).join("\n");
    // goal exists but nothing SUPPORTS it
    expect(all).toContain('Which business flows deliver "faster-month-close"');
    // workflow exists but serves no goal and has no steps
    expect(all).toContain('Which value does "reconciliation" serve');
    expect(all).toContain('Walk me through "reconciliation"');
    // data source with unknown trust
    expect(all).toContain('Do people actually trust "mes-db"');
  });

  it("bottom-up surfaces structure gaps as mining leads", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: [
        "Decision:use-sap-export|DECIDED_BY|Person:Wang :: They chose SAP export",
        "WorkflowStep:csv-cleanup|RELATES_TO|Person:Li :: Li does CSV cleanup",
        "Person:Li|REPORTED|PainPoint:manual-cleanup :: Li cleans CSVs by hand",
      ].join("\n"),
      sourceUri: "interview://floor",
    });
    await runExtraction(db(), new MockExtractor());

    const guide = buildInterviewGuide(db(), "acme-corp", "bottom-up");
    const all = guide.sections.flatMap((s) => s.questions).join("\n");
    expect(all).toContain('Why was "use-sap-export" decided that way');
    expect(all).toContain('Which flow does the step "csv-cleanup" belong to');
    expect(all).toContain('Which business flow does "manual-cleanup" live in?');
  });
});
