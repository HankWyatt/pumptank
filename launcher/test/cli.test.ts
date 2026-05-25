import { expect, test } from "vitest";
import { preview, assertCanBroadcast } from "../src/cli.js";

const items = Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, name: "N", symbol: `S${i}`, description: "d", imagePath: "/x.png" }));

test("preview totals dev-buys", () => {
  const { totalSol, line } = preview(items, { devBuySol: 0.4306 } as any);
  expect(totalSol).toBeCloseTo(43.06, 1);
  expect(line).toMatch(/100/);
});

test("assertCanBroadcast throws without --confirm", () => {
  expect(() => assertCanBroadcast({ confirm: false } as any)).toThrow(/confirm/i);
});

test("assertCanBroadcast passes with --confirm", () => {
  expect(() => assertCanBroadcast({ confirm: true } as any)).not.toThrow();
});
