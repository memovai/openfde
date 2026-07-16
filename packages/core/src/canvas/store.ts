import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";
import { engagementDir } from "../engagement/paths.js";

/**
 * The canvas is a free-form spatial surface per engagement: markdown
 * cards placed anywhere, for the thinking that precedes structure.
 * Stored as one JSON file next to the ledger; the webui drags cards
 * around, the CLI reads and appends the same file.
 */

export interface CanvasCard {
  id: string;
  x: number;
  y: number;
  /** card width in px (webui hint; optional) */
  w?: number;
  /** markdown content */
  text: string;
}

export interface CanvasData {
  cards: CanvasCard[];
}

export function canvasPath(engagement: string): string {
  return join(engagementDir(engagement), "canvas.json");
}

export function readCanvas(engagement: string): CanvasData {
  const path = canvasPath(engagement);
  if (!existsSync(path)) return { cards: [] };
  const data = JSON.parse(readFileSync(path, "utf8")) as CanvasData;
  return { cards: Array.isArray(data.cards) ? data.cards : [] };
}

export function writeCanvas(engagement: string, data: CanvasData): CanvasData {
  const cards = (data.cards ?? []).map((c) => ({
    id: String(c.id || `card_${randomBytes(4).toString("hex")}`),
    x: Number(c.x) || 0,
    y: Number(c.y) || 0,
    ...(c.w ? { w: Number(c.w) } : {}),
    text: String(c.text ?? ""),
  }));
  const path = canvasPath(engagement);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify({ cards }, null, 2) + "\n");
  return { cards };
}

export function addCanvasCard(
  engagement: string,
  text: string,
  position?: { x?: number; y?: number },
): CanvasCard {
  if (!text?.trim()) throw new Error("a canvas card needs text");
  const data = readCanvas(engagement);
  // stack new cards diagonally so CLI-added cards never fully overlap
  const n = data.cards.length;
  const card: CanvasCard = {
    id: `card_${randomBytes(4).toString("hex")}`,
    x: position?.x ?? 60 + (n % 8) * 40,
    y: position?.y ?? 60 + (n % 8) * 40,
    text: text.trim(),
  };
  data.cards.push(card);
  writeCanvas(engagement, data);
  return card;
}
