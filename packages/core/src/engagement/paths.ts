import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

/** OPENFDE_HOME override enables test isolation and multi-environment setups */
export function openfdeHome(): string {
  return process.env.OPENFDE_HOME ?? join(homedir(), ".openfde");
}

export function engagementsDir(): string {
  return join(openfdeHome(), "engagements");
}

export function engagementDir(slug: string): string {
  return join(engagementsDir(), slug);
}

export function ledgerDbPath(slug: string): string {
  return join(engagementDir(slug), "ledger.db");
}

export function rawDir(slug: string): string {
  return join(engagementDir(slug), "raw");
}

export function globalConfigPath(): string {
  return join(openfdeHome(), "config.json");
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`cannot derive a valid engagement slug from "${name}"`);
  return slug;
}
