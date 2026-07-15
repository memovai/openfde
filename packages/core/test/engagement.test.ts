import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEnv, teardownEnv, INTERVIEW, type TestEnv } from "./helpers.js";
import { createEngagement, listEngagements, resolveEngagement } from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });
const db = () => env.db;

describe("engagement", () => {
  it("directory-level isolation: created engagement is listed and becomes current", () => {
    expect(listEngagements()).toEqual(["acme-corp"]);
    expect(resolveEngagement()).toBe("acme-corp");
  });

  it("rejects duplicate names", () => {
    expect(() => createEngagement("Acme Corp")).toThrow(/already exists/);
  });
});
