import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEnv, teardownEnv, type TestEnv } from "./helpers.js";
import {
  buildFlows,
  buildOverviewFlow,
  entityFlow,
  flowsMarkdown,
  ingestEpisode,
  runExtraction,
  entityNote,
  MockExtractor,
} from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });
const db = () => env.db;

async function seed(): Promise<void> {
  ingestEpisode(db(), {
    kind: "message",
    content: [
      "Workflow:monthly-reconciliation|SUPPORTS|Goal:close-books-fast :: Reconciliation supports closing the books quickly",
      "WorkflowStep:csv-cleanup|PART_OF|Workflow:monthly-reconciliation :: CSV cleanup is a step of reconciliation",
      "Workflow:monthly-reconciliation|DEPENDS_ON|System:SAP :: Reconciliation depends on the SAP export",
      "Constraint:no-direct-prod-access|BLOCKS|Workflow:monthly-reconciliation :: Security forbids direct production access",
      "Asset:reconciliation-agent|AUTOMATES|WorkflowStep:csv-cleanup :: The agent automates the CSV cleanup step",
      "Person:Wang|OWNS|System:SAP :: Wang owns SAP",
    ].join("\n"),
    sourceUri: "interview://onsite",
  });
  await runExtraction(db(), new MockExtractor());
}

describe("flow extraction", () => {
  it("builds one mermaid diagram per workflow from flow-shaped facts", async () => {
    await seed();
    const flows = buildFlows(db());
    expect(flows).toHaveLength(1);
    const flow = flows[0]!;
    expect(flow.name).toBe("monthly-reconciliation");
    expect(flow.mermaid).toContain("flowchart LR");
    expect(flow.mermaid).toContain('"csv-cleanup"');
    expect(flow.mermaid).toContain("|PART_OF|");
    expect(flow.mermaid).toContain("|AUTOMATES|");
    expect(flow.mermaid).toContain("-.->|BLOCKS|");
    expect(flow.sources).toEqual(["interview://onsite"]);
    // ownership is data-map territory, not flow territory
    expect(flow.mermaid).not.toContain("Wang");
  });

  it("builds the goal overview and embeds flows in workflow/goal notes", async () => {
    await seed();
    const overview = buildOverviewFlow(db());
    expect(overview?.mermaid).toContain('"close-books-fast"');

    const wf = db().prepare(`SELECT id FROM entities WHERE name = 'monthly-reconciliation'`).get() as { id: string };
    expect(entityFlow(db(), wf.id)).toContain("flowchart LR");
    expect(entityNote(db(), wf.id)).toContain("```mermaid");

    const person = db().prepare(`SELECT id FROM entities WHERE name = 'Wang'`).get() as { id: string };
    expect(entityFlow(db(), person.id)).toBeNull();
  });

  it("renders markdown with fences and provenance, and an empty state", async () => {
    expect(flowsMarkdown([], "acme-corp")).toContain("No flows yet");
    await seed();
    const md = flowsMarkdown(buildFlows(db()), "acme-corp");
    expect(md).toContain("```mermaid");
    expect(md).toContain("interview://onsite");
  });
});
