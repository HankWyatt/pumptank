import { expect, test } from "vitest";
import { backfillMints } from "../src/backfill.js";
import type { LedgerEntry } from "../src/types.js";

const MINT_A = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MINT_B = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const OTHER = "So11111111111111111111111111111111111111112";

function entry(p: Partial<LedgerEntry> & Pick<LedgerEntry, "id" | "mint" | "status">): LedgerEntry {
  return { attempts: 1, ts: "2026-06-04T00:00:00.000Z", ...p };
}

function makeLedger(): Record<string, LedgerEntry> {
  return {
    a: entry({ id: "a", mint: MINT_A, status: "success" }),     // success + mint -> backfill into null record
    b: entry({ id: "b", mint: "", status: "failed" }),          // failed -> ignored
    c: entry({ id: "c", mint: "", status: "attempting" }),      // attempting, no mint -> ignored
    d: entry({ id: "d", mint: MINT_B, status: "success" }),     // success but id not in products -> notFound
    e: entry({ id: "e", mint: MINT_A, status: "success" }),     // success, record already at same mint -> alreadySet
    f: entry({ id: "f", mint: MINT_A, status: "success" }),     // success, record at DIFFERENT mint -> conflict
  };
}

function makeProducts(): any[] {
  return [
    { id: "a", token: { name: "A", symbol: "A", description: "d", mint: null } },
    { id: "b", token: { name: "B", symbol: "B", description: "d", mint: null } },
    { id: "c", token: { name: "C", symbol: "C", description: "d", mint: null } },
    { id: "e", token: { name: "E", symbol: "E", description: "d", mint: MINT_A } },
    { id: "f", token: { name: "F", symbol: "F", description: "d", mint: OTHER } },
    { id: "z", token: { name: "Z", symbol: "Z", description: "d", mint: null } }, // no ledger entry -> untouched
  ];
}

test("backfills a success+mint into a record whose token.mint is null", () => {
  const r = backfillMints(makeLedger(), makeProducts());
  expect(r.backfilled).toEqual(["a"]);
  const a = r.products.find((p) => p.id === "a");
  expect(a.token.mint).toBe(MINT_A);
});

test("ignores failed and attempting (no-mint) ledger entries", () => {
  const r = backfillMints(makeLedger(), makeProducts());
  // b (failed) and c (attempting) never appear in any bucket
  for (const bucket of [r.backfilled, r.alreadySet, r.conflicts, r.notFound]) {
    expect(bucket).not.toContain("b");
    expect(bucket).not.toContain("c");
  }
  const b = r.products.find((p) => p.id === "b");
  const c = r.products.find((p) => p.id === "c");
  expect(b.token.mint).toBe(null);
  expect(c.token.mint).toBe(null);
});

test("same mint already set is idempotent (alreadySet, not re-backfilled)", () => {
  const r = backfillMints(makeLedger(), makeProducts());
  expect(r.alreadySet).toEqual(["e"]);
  expect(r.backfilled).not.toContain("e");
  const e = r.products.find((p) => p.id === "e");
  expect(e.token.mint).toBe(MINT_A);
});

test("different existing mint is a conflict and is left unchanged", () => {
  const r = backfillMints(makeLedger(), makeProducts());
  expect(r.conflicts).toEqual(["f"]);
  const f = r.products.find((p) => p.id === "f");
  expect(f.token.mint).toBe(OTHER); // NOT overwritten
});

test("a success ledger id with no matching product is notFound", () => {
  const r = backfillMints(makeLedger(), makeProducts());
  expect(r.notFound).toEqual(["d"]);
});

test("records with no ledger entry are left untouched", () => {
  const r = backfillMints(makeLedger(), makeProducts());
  const z = r.products.find((p) => p.id === "z");
  expect(z.token.mint).toBe(null);
});

test("returns a new array and does not mutate the input products' token.mint", () => {
  const products = makeProducts();
  const r = backfillMints(makeLedger(), products);
  expect(r.products).not.toBe(products);
  // input record for "a" still null (no deep mutation of caller's data)
  expect(products.find((p) => p.id === "a")!.token.mint).toBe(null);
});

test("idempotent: re-running over already-backfilled output sets nothing new", () => {
  const first = backfillMints(makeLedger(), makeProducts());
  const second = backfillMints(makeLedger(), first.products);
  expect(second.backfilled).toEqual([]);
  expect(second.alreadySet.sort()).toEqual(["a", "e"]);
  expect(second.conflicts).toEqual(["f"]);
});
