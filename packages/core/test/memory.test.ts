import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEnv, teardownEnv, INTERVIEW, type TestEnv } from "./helpers.js";
import { ingestEpisode, runExtraction, recall, MockExtractor } from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });
const db = () => env.db;

describe("provenance hard constraint", () => {
  it("rejects ingestion without a source_uri", () => {
    expect(() =>
      ingestEpisode(db(), { kind: "text", content: "hello", sourceUri: "  " }),
    ).toThrow(/provenance/);
  });
});

describe("ingest -> extract -> resolve", () => {
  it("extraction produces entities and facts, every fact carries provenance", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: INTERVIEW,
      sourceUri: "interview://2026-07-15/onsite",
      speaker: "Wang",
      occurredAt: "2026-07-15T10:00:00Z",
    });
    const stats = await runExtraction(db(), new MockExtractor());
    expect(stats.episodes).toBe(1);
    expect(stats.facts.ADD).toBe(2);

    const facts = db().prepare("SELECT episode_id FROM facts").all() as { episode_id: string }[];
    expect(facts).toHaveLength(2);
    expect(facts.every((f) => f.episode_id.startsWith("ep_"))).toBe(true);
  });

  it("re-ingesting identical content resolves to NOOP, no duplicate facts", async () => {
    for (let i = 0; i < 2; i++) {
      ingestEpisode(db(), {
        kind: "message",
        content: INTERVIEW,
        sourceUri: `interview://2026-07-15/onsite#${i}`,
      });
    }
    const stats = await runExtraction(db(), new MockExtractor());
    expect(stats.facts.ADD).toBe(2);
    expect(stats.facts.NOOP).toBe(2);
    const count = db().prepare("SELECT count(*) AS n FROM facts").get() as { n: number };
    expect(count.n).toBe(2);
  });

  it("contradiction: new statement on the same triple supersedes without deleting", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content:
        "Person:Wang|TRUSTS|DataSource:settlement-db :: Wang only trusts data from the settlement DB",
      sourceUri: "interview://march",
      occurredAt: "2026-03-01T00:00:00Z",
    });
    await runExtraction(db(), new MockExtractor());
    ingestEpisode(db(), {
      kind: "message",
      content:
        "Person:Wang|TRUSTS|DataSource:settlement-db :: Wang says the settlement DB lags now and he cross-checks everything",
      sourceUri: "interview://july",
      occurredAt: "2026-07-01T00:00:00Z",
    });
    const stats = await runExtraction(db(), new MockExtractor());
    expect(stats.facts.INVALIDATE).toBe(1);

    const rows = db()
      .prepare("SELECT expired_at, invalidated_by FROM facts ORDER BY created_at")
      .all() as { expired_at: string | null; invalidated_by: string | null }[];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.expired_at).not.toBeNull();
    expect(rows[0]!.invalidated_by).toMatch(/^fact_/);
    expect(rows[1]!.expired_at).toBeNull();
  });

  it("entity resolution: case-insensitive reuse, no duplicate entities", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: [
        "Person:Wang|OWNS|System:sap :: Wang owns SAP",
        "Workflow:reconciliation|DEPENDS_ON|System:SAP :: Reconciliation depends on SAP",
      ].join("\n"),
      sourceUri: "doc://systems",
    });
    await runExtraction(db(), new MockExtractor());
    const systems = db()
      .prepare("SELECT name FROM entities WHERE type = 'System'")
      .all() as { name: string }[];
    expect(systems).toHaveLength(1);
  });
});

describe("recall", () => {
  beforeEach(async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: INTERVIEW,
      sourceUri: "interview://2026-07-15/onsite",
      occurredAt: "2026-07-15T10:00:00Z",
    });
    await runExtraction(db(), new MockExtractor());
  });

  it("keyword hit returns facts with provenance", () => {
    const hits = recall(db(), "settlement");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.sourceUri).toBe("interview://2026-07-15/onsite");
    expect(hits[0]!.quote).toContain("settlement");
  });

  it("entity-name hit expands one hop: querying SAP surfaces reconciliation facts", () => {
    const hits = recall(db(), "SAP");
    expect(hits.some((h) => h.statement.includes("reconciliation"))).toBe(true);
  });

  it("handoff mode includes superseded facts ordered on a timeline", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content:
        "Person:Wang|TRUSTS|DataSource:settlement-db :: Wang no longer trusts the settlement DB",
      sourceUri: "interview://later",
      occurredAt: "2026-08-01T00:00:00Z",
    });
    await runExtraction(db(), new MockExtractor());

    const defaults = recall(db(), "settlement");
    expect(defaults.every((h) => !h.expired)).toBe(true);

    const handoff = recall(db(), "settlement", { mode: "handoff" });
    expect(handoff.some((h) => h.expired)).toBe(true);
    const expired = handoff.find((h) => h.expired)!;
    expect(expired.invalidatedBy).toMatch(/^fact_/);
  });
});

describe("multilingual content (CJK segmentation)", () => {
  // Engagement material arrives in any language; FTS5's unicode61 tokenizer
  // cannot segment CJK, so this guards the app-level segmentation layer.
  it("substring queries match CJK content on both fact and entity paths", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content:
        "Workflow:月度対帳|DEPENDS_ON|System:SAP :: 月度対帳プロセスはSAPのエクスポートに依存する",
      sourceUri: "interview://tokyo-onsite",
    });
    await runExtraction(db(), new MockExtractor());
    const hits = recall(db(), "対帳");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.statement).toContain("月度対帳");
  });
});
