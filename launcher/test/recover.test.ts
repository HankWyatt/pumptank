import { expect, test } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { mintExistsOnChain } from "../src/recover.js";

test("true when the mint account exists", async () => {
  const conn = { getAccountInfo: async () => ({ lamports: 1 }) } as any;
  expect(await mintExistsOnChain(conn, new PublicKey("11111111111111111111111111111111"))).toBe(true);
});

test("false when getAccountInfo returns null", async () => {
  const conn = { getAccountInfo: async () => null } as any;
  expect(await mintExistsOnChain(conn, new PublicKey("11111111111111111111111111111111"))).toBe(false);
});
