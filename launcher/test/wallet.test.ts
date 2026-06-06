import { expect, test } from "vitest";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { loadWallet, hasSufficientBalance } from "../src/wallet.js";

test("loads a keypair from a JSON secret-array env", () => {
  const kp = Keypair.generate();
  const env = { WALLET: JSON.stringify(Array.from(kp.secretKey)) };
  expect(loadWallet(env).publicKey.toBase58()).toBe(kp.publicKey.toBase58());
});

test("loads a keypair from a base58 private key (Phantom/Solflare export)", () => {
  const kp = Keypair.generate();
  const env = { WALLET: bs58.encode(kp.secretKey) }; // 64-byte secret key, base58
  expect(loadWallet(env).publicKey.toBase58()).toBe(kp.publicKey.toBase58());
});

test("loads a keypair from a base58 32-byte seed", () => {
  const kp = Keypair.generate();
  const env = { WALLET: bs58.encode(kp.secretKey.slice(0, 32)) }; // seed half
  expect(loadWallet(env).publicKey.toBase58()).toBe(kp.publicKey.toBase58());
});

test("tolerates surrounding whitespace", () => {
  const kp = Keypair.generate();
  expect(loadWallet({ WALLET: `  ${bs58.encode(kp.secretKey)}\n` }).publicKey.toBase58())
    .toBe(kp.publicKey.toBase58());
});

test("throws when WALLET is missing", () => {
  expect(() => loadWallet({})).toThrow(/WALLET/);
});

test("throws a clear error on non-base58 garbage", () => {
  expect(() => loadWallet({ WALLET: "not a key!!!" })).toThrow(/base58|byte array/i);
});

test("balance check compares lamports to required SOL", async () => {
  const conn = { getBalance: async () => 50 * 1e9 } as any;
  expect(await hasSufficientBalance(conn, Keypair.generate().publicKey, 45)).toBe(true);
  expect(await hasSufficientBalance(conn, Keypair.generate().publicKey, 60)).toBe(false);
});
