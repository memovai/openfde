import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { setupEnv, teardownEnv, type TestEnv } from "./helpers.js";
import { createPage, deletePage, listPages, readPage, writePage } from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });

describe("pages", () => {
  it("creates, lists, reads, writes, and deletes markdown pages", () => {
    const ref = createPage("acme-corp", "Rollout plan");
    expect(ref.slug).toBe("rollout-plan");
    expect(existsSync(ref.path)).toBe(true);
    expect(readPage("acme-corp", "rollout-plan")).toBe("# Rollout plan\n");

    writePage("acme-corp", "rollout-plan", "# Rollout plan v2\n\nPhase one ships Friday.");
    expect(readPage("acme-corp", "rollout-plan")).toContain("Phase one");
    expect(listPages("acme-corp")[0]!.title).toBe("Rollout plan v2");

    deletePage("acme-corp", "rollout-plan");
    expect(listPages("acme-corp")).toHaveLength(0);
  });

  it("rejects duplicates, unknown slugs, and empty titles", () => {
    createPage("acme-corp", "Notes");
    expect(() => createPage("acme-corp", "Notes")).toThrow(/already exists/);
    expect(() => readPage("acme-corp", "nope")).toThrow(/not found/);
    expect(() => writePage("acme-corp", "nope", "x")).toThrow(/not found/);
    expect(() => createPage("acme-corp", "  ")).toThrow(/title/);
  });
});
