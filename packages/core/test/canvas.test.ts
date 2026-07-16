import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupEnv, teardownEnv, type TestEnv } from "./helpers.js";
import { addCanvasCard, readCanvas, writeCanvas } from "../src/index.js";

let env: TestEnv;
beforeEach(() => { env = setupEnv(); });
afterEach(() => { teardownEnv(env); });

describe("canvas", () => {
  it("starts empty, adds cards, persists positions", () => {
    expect(readCanvas("acme-corp").cards).toHaveLength(0);
    const card = addCanvasCard("acme-corp", "First demo targets the CSV pain", { x: 100, y: 80 });
    expect(card.id).toMatch(/^card_/);
    const data = readCanvas("acme-corp");
    expect(data.cards).toHaveLength(1);
    expect(data.cards[0]!.x).toBe(100);

    data.cards[0]!.x = 300;
    writeCanvas("acme-corp", data);
    expect(readCanvas("acme-corp").cards[0]!.x).toBe(300);
  });

  it("rejects empty cards and sanitizes malformed writes", () => {
    expect(() => addCanvasCard("acme-corp", "  ")).toThrow(/text/);
    const out = writeCanvas("acme-corp", { cards: [{ id: "", x: Number.NaN, y: 5, text: "ok" } as never] });
    expect(out.cards[0]!.id).toMatch(/^card_/);
    expect(out.cards[0]!.x).toBe(0);
  });
});
