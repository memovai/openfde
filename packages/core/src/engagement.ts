import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import {
  engagementDir,
  engagementsDir,
  globalConfigPath,
  ensureDir,
  openfdeHome,
  rawDir,
  slugify,
} from "./paths.js";
import { openLedger } from "./db.js";

interface GlobalConfig {
  currentEngagement?: string;
}

function readConfig(): GlobalConfig {
  const path = globalConfigPath();
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as GlobalConfig;
}

function writeConfig(config: GlobalConfig): void {
  ensureDir(openfdeHome());
  writeFileSync(globalConfigPath(), JSON.stringify(config, null, 2) + "\n");
}

export function createEngagement(name: string): string {
  const slug = slugify(name);
  if (existsSync(engagementDir(slug))) {
    throw new Error(`engagement "${slug}" already exists`);
  }
  ensureDir(rawDir(slug));
  openLedger(slug).close();
  const config = readConfig();
  config.currentEngagement = slug;
  writeConfig(config);
  return slug;
}

export function listEngagements(): string[] {
  const dir = engagementsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

export function useEngagement(slug: string): void {
  if (!existsSync(engagementDir(slug))) {
    throw new Error(`engagement "${slug}" does not exist; run \`openfde engagement create\` first`);
  }
  const config = readConfig();
  config.currentEngagement = slug;
  writeConfig(config);
}

/** Resolve the active engagement: explicit arg > global config. Fails loudly — every data operation must have a clear owner. */
export function resolveEngagement(explicit?: string): string {
  if (explicit) {
    if (!existsSync(engagementDir(explicit))) {
      throw new Error(`engagement "${explicit}" does not exist`);
    }
    return explicit;
  }
  const config = readConfig();
  if (config.currentEngagement && existsSync(engagementDir(config.currentEngagement))) {
    return config.currentEngagement;
  }
  throw new Error(
    "no engagement selected. Create one with `openfde engagement create <name>` or switch with `openfde engagement use <slug>`",
  );
}
