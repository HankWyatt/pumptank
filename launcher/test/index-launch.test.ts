import { expect, test, vi } from "vitest";

// Mirror cli.test.ts: stub the pump SDK so the loader stays offline. The pure
// helpers under test never touch the SDK (it's loaded via createRequire in main()).
vi.mock("@pump-fun/pump-sdk", () => ({ OnlinePumpSdk: class {}, PumpSdk: class {} }));

import {
  INDEX_ID, INDEX_NAME, INDEX_SYMBOL, INDEX_DEV_BUY_TOKENS,
  buildIndexItem, resolveIndexDevBuySol, indexLaunchOpts, indexBatchOpts, indexPreview,
} from "../src/index-launch.js";

test("buildIndexItem returns the index LaunchItem with devBuy=true", () => {
  const item = buildIndexItem("/abs/pumptanklogo.png");
  expect(item.id).toBe(INDEX_ID);
  expect(item.id).toBe("index-pumptank");
  expect(item.name).toBe(INDEX_NAME);
  expect(item.symbol).toBe(INDEX_SYMBOL);
  expect(item.imagePath).toBe("/abs/pumptanklogo.png");
  expect(item.devBuy).toBe(true);
  expect(item.description.toLowerCase()).toContain("not financial advice");
});

test("INDEX_DEV_BUY_TOKENS is 10% of the 1e15 supply", () => {
  expect(INDEX_DEV_BUY_TOKENS).toBe(100_000_000_000_000n); // 1e14 = 10% of 1e15
});

test("resolveIndexDevBuySol: default 3.5, env override, rejects bad values", () => {
  expect(resolveIndexDevBuySol({})).toBe(3.5);
  expect(resolveIndexDevBuySol({ INDEX_DEV_BUY_SOL: "4.2" })).toBe(4.2);
  expect(() => resolveIndexDevBuySol({ INDEX_DEV_BUY_SOL: "0" })).toThrow(/INDEX_DEV_BUY_SOL/);
  expect(() => resolveIndexDevBuySol({ INDEX_DEV_BUY_SOL: "x" })).toThrow(/INDEX_DEV_BUY_SOL/);
});

test("indexLaunchOpts: 1e14 tokens + a slippage-buffered lamport cap", () => {
  const opts = indexLaunchOpts(150, 3.5, 200_000);
  expect(opts.devBuyTokens).toBe(100_000_000_000_000n);
  // 3.5 * (1 + 150/10000) * 1e9 = 3,552,500,000
  expect(opts.solCapLamports).toBe(3_552_500_000n);
  expect(opts.priorityFeeMicroLamports).toBe(200_000);
});

test("indexLaunchOpts rounds the lamport cap UP (ceil), not down", () => {
  // 0.0000000005 * (1 + 150/10000) * 1e9 = 0.5075 lamports -> ceil = 1n
  expect(indexLaunchOpts(150, 0.0000000005, 0).solCapLamports).toBe(1n);
});

test("indexBatchOpts: devBuySol is the INDEX figure (so the spend cap accounts for it)", () => {
  const cfg = { slippageBps: 150, priorityFeeMicroLamports: 200_000, pacingMs: 1500,
    maxTotalSpendSol: 5, maxRetriesPerToken: 2 } as any;
  const b = indexBatchOpts(cfg, 3.5);
  expect(b.devBuySol).toBe(3.5);
  expect(b.maxTotalSpendSol).toBe(5);
  expect(b.maxRetriesPerToken).toBe(2);
});

test("indexPreview: mentions PUMPTANK, 10%, and the cap", () => {
  const { capSol, line } = indexPreview(3.5);
  expect(capSol).toBe(3.5);
  expect(line).toMatch(/PUMPTANK/);
  expect(line).toMatch(/10%/);
  expect(line).toMatch(/3\.50/);
});
