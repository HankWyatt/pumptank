import { expect, test, vi } from "vitest";

// The pump SDK's ESM bundle re-exports a named `BN` from the CJS `@coral-xyz/anchor`,
// which Vitest's loader can't resolve. cli.ts's pure helpers under test don't touch the
// SDK, so stub the module to keep this suite offline and load-safe.
vi.mock("@pump-fun/pump-sdk", () => ({ OnlinePumpSdk: class {}, PumpSdk: class {} }));

import { preview, assertCanBroadcast } from "../src/cli.js";

const items = Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, name: "N", symbol: `S${i}`, description: "d", imagePath: "/x.png", devBuy: true }));

test("preview totals dev-buys", () => {
  const { totalSol, line } = preview(items, { devBuySol: 0.4306 } as any);
  expect(totalSol).toBeCloseTo(43.06, 1);
  expect(line).toMatch(/100/);
});

test("preview counts ONLY dev-buys in a mixed set (create-only coins don't add to the spend)", () => {
  const mixed = [
    ...items, // 100 dev-buy
    ...Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, name: "N", symbol: `C${i}`, description: "d", imagePath: "/x.png", devBuy: false })),
  ];
  const { totalSol, line } = preview(mixed, { devBuySol: 0.4306 } as any);
  expect(totalSol).toBeCloseTo(43.06, 1); // 100 × 0.4306, NOT 150 ×
  expect(line).toMatch(/150 tokens \(100 dev-buy, 50 create-only\)/);
});

test("assertCanBroadcast throws without --confirm", () => {
  expect(() => assertCanBroadcast({ confirm: false } as any)).toThrow(/confirm/i);
});

test("assertCanBroadcast passes with --confirm", () => {
  expect(() => assertCanBroadcast({ confirm: true } as any)).not.toThrow();
});
