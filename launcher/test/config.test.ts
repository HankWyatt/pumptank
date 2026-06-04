import { expect, test } from "vitest";
import { buildConfig, SLIPPAGE_BPS_CAP } from "../src/config.js";

const base = { RPC_URL: "https://rpc", MAX_TOTAL_SPEND_SOL: "45" };

test("defaults to dry-run (no confirm)", () => {
  const c = buildConfig([], base);
  expect(c.confirm).toBe(false);
  expect(c.devBuySol).toBeCloseTo(0.4306);
});

test("--confirm enables broadcast", () => {
  expect(buildConfig(["--confirm"], base).confirm).toBe(true);
});

test("rejects slippage over the cap", () => {
  expect(() => buildConfig([], { ...base, SLIPPAGE_BPS: String(SLIPPAGE_BPS_CAP + 1) }))
    .toThrow(/slippage/i);
});

test("requires MAX_TOTAL_SPEND_SOL", () => {
  expect(() => buildConfig([], { RPC_URL: "https://rpc" })).toThrow(/MAX_TOTAL_SPEND_SOL/);
});

test("parses --only and --limit", () => {
  const c = buildConfig(["--only", "s5e9p1-x", "--limit", "3"], base);
  expect(c.only).toBe("s5e9p1-x");
  expect(c.limit).toBe(3);
});

test("exposes the token-pinned dev-buy amount (1.5% of supply)", () => {
  const c = buildConfig([], base);
  expect(c.devBuyTokens).toBe(15_000_000_000_000n); // 1.5% of 1e15 (Token-2022, 6dp)
  expect(c.devBuySol).toBeCloseTo(0.4306); // SOL budget/cap estimate per token
});
