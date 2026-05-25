import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadFeeConfig, saveFeeConfig, markOptin, markRedirected } from "../src/feeconfig.js";

const VALID = "So11111111111111111111111111111111111111112"; // a valid base58 pubkey
const path = () => join(mkdtempSync(join(tmpdir(), "fee-")), "fee-config.json");

test("markOptin sets optedIn + validates the payout wallet", () => {
  const cfg = markOptin({}, "a", VALID);
  expect(cfg.a.optedIn).toBe(true);
  expect(cfg.a.payoutWallet).toBe(VALID);
  expect(cfg.a.split).toBe("house_100");
  expect(cfg.a.changeUsed).toBe(false);
});

test("markOptin rejects an invalid wallet", () => {
  expect(() => markOptin({}, "a", "not-a-pubkey")).toThrow(/wallet/i);
});

test("markRedirected requires opted-in + wallet, then locks", () => {
  let cfg = markOptin({}, "a", VALID);
  cfg = markRedirected(cfg, "a");
  expect(cfg.a.split).toBe("split_80_20");
  expect(cfg.a.changeUsed).toBe(true);
  expect(cfg.a.changedAt).not.toBeNull();
});

test("markRedirected refuses a second redirect (one-change lock)", () => {
  let cfg = markRedirected(markOptin({}, "a", VALID), "a");
  expect(() => markRedirected(cfg, "a")).toThrow(/already|locked|used/i);
});

test("markRedirected refuses an un-opted token", () => {
  expect(() => markRedirected({}, "a")).toThrow(/opt/i);
});

test("save + load round-trips", () => {
  const p = path();
  saveFeeConfig(p, markOptin({}, "a", VALID));
  expect(loadFeeConfig(p).a.payoutWallet).toBe(VALID);
  expect(loadFeeConfig("/no/such/file.json")).toEqual({});
});
