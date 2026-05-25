import { expect, test } from "vitest";
import { Keypair } from "@solana/web3.js";
import { loadWallet, hasSufficientBalance } from "../src/wallet.js";

test("loads a keypair from a JSON secret-array env", () => {
  const kp = Keypair.generate();
  const env = { WALLET: JSON.stringify(Array.from(kp.secretKey)) };
  expect(loadWallet(env).publicKey.toBase58()).toBe(kp.publicKey.toBase58());
});

test("throws when WALLET is missing", () => {
  expect(() => loadWallet({})).toThrow(/WALLET/);
});

test("balance check compares lamports to required SOL", async () => {
  const conn = { getBalance: async () => 50 * 1e9 } as any;
  expect(await hasSufficientBalance(conn, Keypair.generate().publicKey, 45)).toBe(true);
  expect(await hasSufficientBalance(conn, Keypair.generate().publicKey, 60)).toBe(false);
});
