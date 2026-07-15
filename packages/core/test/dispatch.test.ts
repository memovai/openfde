import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEnv, teardownEnv, INTERVIEW, type TestEnv } from "./helpers.js";
import {
  ingestEpisode, runExtraction, MockExtractor,
  createTask, listTasks, transitionTask, addTaskNote, taskEvents,
  buildTaskContext, contextMarkdown,
} from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });
const db = () => env.db;

describe("tasks (agent-pull dispatch)", () => {
  it("lifecycle: create -> claim -> start -> done -> accept, with audit trail", () => {
    const row = createTask(db(), {
      title: "Automate CSV cleanup",
      criteria: "Cleanup step runs without manual edits",
      sourceUri: "interview://2026-07-15/onsite",
      actor: "eric",
    });
    expect(row.status).toBe("ready");

    transitionTask(db(), row.id, "claimed", { actor: "claude-code" });
    transitionTask(db(), row.id, "running", { actor: "claude-code" });
    addTaskNote(db(), row.id, "found the export job config", "claude-code");
    transitionTask(db(), row.id, "review", { actor: "claude-code", note: "ready for eval" });
    const final = transitionTask(db(), row.id, "accepted", { actor: "eric" });
    expect(final.status).toBe("accepted");

    const events = taskEvents(db(), row.id);
    expect(events.map((e) => e.kind)).toEqual([
      "created", "status", "status", "note", "status", "status",
    ]);
    expect(events[1]!.actor).toBe("claude-code");
  });

  it("illegal transitions are rejected", () => {
    const row = createTask(db(), { title: "A task" });
    expect(() => transitionTask(db(), row.id, "accepted")).toThrow(/illegal transition/);
    expect(() => transitionTask(db(), row.id, "running")).toThrow(/illegal transition/);
  });

  it("unclaim releases the claim", () => {
    const row = createTask(db(), { title: "A task" });
    transitionTask(db(), row.id, "claimed", { actor: "claude-code" });
    const released = transitionTask(db(), row.id, "ready");
    expect(released.claimed_by).toBeNull();
    expect(listTasks(db(), { status: "ready" })).toHaveLength(1);
  });

  it("context bundle always ships constraints and finds related memory with citations", async () => {
    ingestEpisode(db(), {
      kind: "message",
      content: [
        "Constraint:no-direct-prod-access|BLOCKS|Workflow:reconciliation :: Security forbids direct production DB access",
        "Workflow:reconciliation|DEPENDS_ON|System:SAP :: Reconciliation depends on the SAP export",
        "Person:Wang|OWNS|System:CRM :: Wang owns the CRM",
      ].join("\n"),
      sourceUri: "interview://onsite",
    });
    await runExtraction(db(), new MockExtractor());

    const row = createTask(db(), {
      title: "Automate reconciliation export",
      description: "Replace the manual SAP export step",
    });
    const context = buildTaskContext(db(), row.id);

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
