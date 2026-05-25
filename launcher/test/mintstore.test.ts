import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MintStore } from "../src/mintstore.js";

const dir = () => mkdtempSync(join(tmpdir(), "mint-"));

test("returns a stable keypair per id (same pubkey on reload)", () => {
  const d = dir();
  const kp1 = new MintStore(d).getOrCreate("a");
  const kp2 = new MintStore(d).getOrCreate("a"); // fresh instance reloads from disk
  expect(kp2.publicKey.toBase58()).toBe(kp1.publicKey.toBase58());
});

test("different ids get different mints", () => {
  const d = dir();
  const s = new MintStore(d);
  expect(s.getOrCreate("a").publicKey.toBase58()).not.toBe(s.getOrCreate("b").publicKey.toBase58());
});
