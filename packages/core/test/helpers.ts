import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEngagement, openLedger, type Ledger } from "../src/index.js";

export interface TestEnv {
  home: string;
  db: Ledger;
}

/** Isolated OPENFDE_HOME + a fresh "acme-corp" engagement per test */
export function setupEnv(): TestEnv {
  const home = mkdtempSync(join(tmpdir(), "openfde-test-"));
  process.env.OPENFDE_HOME = home;
  createEngagement("acme corp");
  return { home, db: openLedger("acme-corp") };
}

export function teardownEnv(env: TestEnv): void {
  env.db.close();
  rmSync(env.home, { recursive: true, force: true });
  delete process.env.OPENFDE_HOME;
}

export const INTERVIEW = [
  "Person:Wang|TRUSTS|DataSource:settlement-db :: Wang only trusts data from the settlement DB",
  "Workflow:monthly-reconciliation|DEPENDS_ON|System:SAP :: The monthly reconciliation workflow depends on the SAP export",
].join("\n");
