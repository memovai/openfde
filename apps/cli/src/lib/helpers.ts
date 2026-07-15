import { openLedger, resolveEngagement } from "@openfde/core";

export function fail(error: unknown): never {
  console.error(`openfde: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

/** Open the engagement ledger, run fn, always close. */
export function withLedger<T>(
  engagement: string | undefined,
  fn: (db: ReturnType<typeof openLedger>, slug: string) => T,
): T {
  const slug = resolveEngagement(engagement);
  const db = openLedger(slug);
  try {
    return fn(db, slug);
  } finally {
    db.close();
  }
}

/** Who is acting: explicit flag > OPENFDE_ACTOR > OS user. */
export function actorName(explicit?: string): string {
  return explicit ?? process.env.OPENFDE_ACTOR ?? process.env.USER ?? "unknown";
}
