import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { engagementDir, slugify } from "../engagement/paths.js";

/**
 * The asset library (DESIGN 4.4): prompts, rubrics, eval datasets, demos,
 * playbooks, and skills are versioned FILES under the engagement directory —
 * git-ready, agent-readable, promotable to a team repo behind the
 * desensitization gate. Evaluation consumes rubric assets and feeds scores
 * and new cases back into the library.
 */

export const ASSET_TYPES = ["rubric", "prompt", "eval", "demo", "playbook", "skill"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface AssetRef {
  type: AssetType;
  name: string;
  path: string;
}

export function assetsDir(engagement: string, type?: AssetType): string {
  const base = join(engagementDir(engagement), "assets");
  return type ? join(base, `${type}s`) : base;
}

export function addAsset(
  engagement: string,
  type: AssetType,
  name: string,
  content: string,
): AssetRef {
  if (!content?.trim()) throw new Error("an asset needs content");
  const slug = slugify(name);
  const dir = assetsDir(engagement, type);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${slug}.md`);
  writeFileSync(path, content.endsWith("\n") ? content : content + "\n");
  return { type, name: slug, path };
}

export function listAssets(engagement: string, type?: AssetType): AssetRef[] {
  const types = type ? [type] : [...ASSET_TYPES];
  const refs: AssetRef[] = [];
  for (const t of types) {
    const dir = assetsDir(engagement, t);
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).sort()) {
      if (!file.endsWith(".md")) continue;
      refs.push({ type: t, name: file.replace(/\.md$/, ""), path: join(dir, file) });
    }
  }
  return refs;
}

export function readAsset(engagement: string, type: AssetType, name: string): string {
  const path = join(assetsDir(engagement, type), `${slugify(name)}.md`);
  if (!existsSync(path)) throw new Error(`asset ${type}/${name} not found`);
  return readFileSync(path, "utf8");
}

/** Append an eval case (input + verdict) to a rubric's case file — the growing dataset */
export function appendEvalCase(
  engagement: string,
  rubricName: string,
  entry: Record<string, unknown>,
): string {
  const dir = assetsDir(engagement, "eval");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${slugify(rubricName)}.cases.jsonl`);
  writeFileSync(path, JSON.stringify(entry) + "\n", { flag: "a" });
  return path;
}

/** Cross-engagement leverage: how much of the library exists, per type */
export function assetStats(engagement: string): Record<AssetType, number> {
  const stats = Object.fromEntries(ASSET_TYPES.map((t) => [t, 0])) as Record<AssetType, number>;
  for (const ref of listAssets(engagement)) stats[ref.type] += 1;
  return stats;
}
