import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadFeeConfig, saveFeeConfig, markOptin, markShared, markDistributed } from "../src/feeconfig.js";

const FOUNDER = "So11111111111111111111111111111111111111112"; // a valid base58 pubkey
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"; // a valid base58 pubkey
const SIGS = { sharingConfigSig: "sig-share", setSharesSig: "sig-set" };
const path = () => join(mkdtempSync(join(tmpdir(), "fee-")), "fee-config.json");

test("markOptin sets optedIn + founderWallet + mint, stays 100% house", () => {
  const cfg = markOptin({}, "a", FOUNDER, MINT);
  expect(cfg.a.optedIn).toBe(true);
  expect(cfg.a.founderWallet).toBe(FOUNDER);
  expect(cfg.a.mint).toBe(MINT);
  expect(cfg.a.split).toBe("house_100");
  expect(cfg.a.changeUsed).toBe(false);
  expect(cfg.a.pool).toBeNull();
});

test("markOptin rejects an invalid founder wallet", () => {
  expect(() => markOptin({}, "a", "not-a-pubkey", MINT)).toThrow(/wallet/i);
});

test("markShared moves to 80/20, locks, and records the sigs", () => {
  let cfg = markOptin({}, "a", FOUNDER, MINT);
  cfg = markShared(cfg, "a", SIGS);
  expect(cfg.a.split).toBe("split_80_20");
  expect(cfg.a.changeUsed).toBe(true);
  expect(cfg.a.changedAt).not.toBeNull();
  expect(cfg.a.sharingConfigSig).toBe("sig-share");
  expect(cfg.a.setSharesSig).toBe("sig-set");
});

test("markShared refuses a second change (one-time lock)", () => {
  const cfg = markShared(markOptin({}, "a", FOUNDER, MINT), "a", SIGS);
  expect(() => markShared(cfg, "a", SIGS)).toThrow(/already|locked|used/i);
});

test("markShared refuses an un-opted token", () => {
  expect(() => markShared({}, "a", SIGS)).toThrow(/opt/i);
});

test("markDistributed records the distribute sig", () => {
  let cfg = markShared(markOptin({}, "a", FOUNDER, MINT), "a", SIGS);
  cfg = markDistributed(cfg, "a", "sig-dist");
  expect(cfg.a.distributeSig).toBe("sig-dist");
  // keeps the prior state intact
  expect(cfg.a.split).toBe("split_80_20");
});

test("save + load round-trips the extended shape", () => {
  const p = path();
  saveFeeConfig(p, markShared(markOptin({}, "a", FOUNDER, MINT), "a", SIGS));
  const loaded = loadFeeConfig(p);
  expect(loaded.a.founderWallet).toBe(FOUNDER);
  expect(loaded.a.mint).toBe(MINT);
  expect(loaded.a.split).toBe("split_80_20");
  expect(loaded.a.setSharesSig).toBe("sig-set");
  expect(loadFeeConfig("/no/such/file.json")).toEqual({});
});
