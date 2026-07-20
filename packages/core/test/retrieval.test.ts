import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEnv, teardownEnv, type TestEnv } from "./helpers.js";
import {
  buildWhoKnows,
  ingestEpisode,
  matchingEpisodes,
  recall,
  runExtraction,
  whoKnowsMarkdown,
  MockExtractor,
} from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });
const db = () => env.db;

describe("hybrid recall", () => {
  it("finds raw episode content before extraction runs (exact error strings)", () => {
    ingestEpisode(db(), {
      kind: "text",
      content: "Restore fails with ERR_MANIFEST_TIMEOUT on the settlement export",
      sourceUri: "slack://ops/123",
    });
    const pending = matchingEpisodes(db(), "ERR_MANIFEST_TIMEOUT", { pendingOnly: true });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.sourceUri).toBe("slack://ops/123");
    expect(pending[0]!.snippet).toContain("ERR_MANIFEST_TIMEOUT");
  });

  it("fuses retrievers: a fact matched lexically AND via its entity outranks graph-only", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: [
        "Workflow:reconciliation|DEPENDS_ON|System:SAP :: The reconciliation workflow depends on the SAP export",
        "Person:Wang|OWNS|System:SAP :: Wang owns the SAP system",
      ].join("\n"),
      sourceUri: "interview://onsite",
    });
    await runExtraction(db(), new MockExtractor());
    const hits = recall(db(), "reconciliation");
    expect(hits.length).toBeGreaterThan(0);
    // top hit mentions reconciliation directly and carries retriever provenance
    expect(hits[0]!.statement).toContain("reconciliation");
    expect(hits[0]!.via).toContain("lexical");
    expect(hits[0]!.score).toBeGreaterThan(0);
    // Wang-owns-SAP arrives only through the graph/raw expansion and ranks below
    const graphOnly = hits.find((h) => h.statement.includes("Wang"));
    if (graphOnly) expect(graphOnly.score).toBeLessThan(hits[0]!.score);
  });

  it("age decay: when relevance is equal, the newer fact wins", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: "Workflow:billing-close|DEPENDS_ON|System:legacy-ftp :: Billing close pulls files over legacy FTP",
      sourceUri: "interview://2023",
      occurredAt: "2023-01-10T00:00:00Z",
    });
    ingestEpisode(db(), {
      kind: "message",
      content: "Workflow:billing-audit|DEPENDS_ON|System:s3-bucket :: Billing audit reads exports from the S3 bucket",
      sourceUri: "interview://recent",
      occurredAt: new Date().toISOString(),
    });
    await runExtraction(db(), new MockExtractor());
    const hits = recall(db(), "billing");
    expect(hits.length).toBe(2);
    expect(hits[0]!.sourceUri).toBe("interview://recent");
  });
});

describe("who knows", () => {
  it("ranks people by recorded involvement, ownership above mentions, with evidence", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: [
        "Person:Wang|OWNS|DataSource:settlement-db :: Wang owns the settlement database",
        "Person:Li|TRUSTS|DataSource:settlement-db :: Li trusts the settlement database",
      ].join("\n"),
      sourceUri: "interview://onsite",
      speaker: "Kim",
    });
    await runExtraction(db(), new MockExtractor());
    const experts = buildWhoKnows(db(), "settlement");
    expect(experts[0]!.name).toBe("Wang");
    expect(experts[0]!.score).toBeGreaterThan(experts[1]!.score);
    expect(experts[0]!.evidence[0]!.sourceUri).toBe("interview://onsite");
    const kim = experts.find((e) => e.name === "Kim");
    expect(kim?.inGraph).toBe(false);
    const md = whoKnowsMarkdown(experts, "settlement");
    expect(md).toContain("## Wang");
    expect(md).toContain("OWNS");
  });
});
