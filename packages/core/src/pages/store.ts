import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { engagementDir, slugify } from "../engagement/paths.js";

/**
 * Pages are human/agent-authored markdown documents that live next to the
 * ledger — the free-form layer on top of the extracted memory. The webui
 * edits them as blocks (Notion-style); the CLI reads and writes the same
 * files, so both sides stay in lockstep.
 */

export interface PageRef {
  slug: string;
  title: string;
  path: string;
  updatedAt: string;
}

export function pagesDir(engagement: string): string {
  return join(engagementDir(engagement), "pages");
}

function pagePath(engagement: string, slug: string): string {
  return join(pagesDir(engagement), `${slugify(slug)}.md`);
}

function titleOf(content: string, fallback: string): string {
  const heading = content.split("\n").find((l) => l.startsWith("# "));
  return heading ? heading.slice(2).trim() : fallback;
}

export function createPage(engagement: string, title: string, content?: string): PageRef {
  if (!title?.trim()) throw new Error("a page needs a title");
  const slug = slugify(title);
  const dir = pagesDir(engagement);
  mkdirSync(dir, { recursive: true });
  const path = pagePath(engagement, slug);
  if (existsSync(path)) throw new Error(`page "${slug}" already exists`);
  writeFileSync(path, content ?? `# ${title.trim()}\n`);
  return { slug, title: title.trim(), path, updatedAt: statSync(path).mtime.toISOString() };
}

export function listPages(engagement: string): PageRef[] {
  const dir = pagesDir(engagement);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const slug = file.replace(/\.md$/, "");
      const path = join(dir, file);
      return {
        slug,
        title: titleOf(readFileSync(path, "utf8"), slug),
        path,
        updatedAt: statSync(path).mtime.toISOString(),
      };
    });
}

export function readPage(engagement: string, slug: string): string {
  const path = pagePath(engagement, slug);
  if (!existsSync(path)) throw new Error(`page "${slug}" not found`);
  return readFileSync(path, "utf8");
}

export function writePage(engagement: string, slug: string, content: string): PageRef {
  const path = pagePath(engagement, slug);
  if (!existsSync(path)) throw new Error(`page "${slug}" not found`);
  writeFileSync(path, content.endsWith("\n") ? content : content + "\n");
  return {
    slug: slugify(slug),
    title: titleOf(content, slug),
    path,
    updatedAt: statSync(path).mtime.toISOString(),
  };
}

export function deletePage(engagement: string, slug: string): void {
  const path = pagePath(engagement, slug);
  if (!existsSync(path)) throw new Error(`page "${slug}" not found`);
  rmSync(path);
}
