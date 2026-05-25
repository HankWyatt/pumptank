import { expect, test, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { creatorVaultPda, getVaultClaimable, collectCreatorFee, PUMP_PROGRAM_ID } from "../src/collect.js";

test("creatorVaultPda derives a deterministic PDA owned by the pump program", () => {
  const creator = Keypair.generate().publicKey;
  const a = creatorVaultPda(creator);
  const b = creatorVaultPda(creator);
  expect(a.equals(b)).toBe(true);
  expect(a).toBeInstanceOf(PublicKey);
  expect(PUMP_PROGRAM_ID.toBase58()).toBe("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
});

test("getVaultClaimable returns the vault lamport balance as bigint", async () => {
  const conn = { getBalance: async () => 12345 } as any;
  expect(await getVaultClaimable(conn, Keypair.generate().publicKey)).toBe(12345n);
});

test("collectCreatorFee throws on a non-OK PumpPortal response", async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "err" });
  const conn = { sendRawTransaction: vi.fn() } as any;
  await expect(collectCreatorFee(conn, Keypair.generate(),
    { pumpportalUrl: "https://pumpportal.fun", fetchImpl })).rejects.toThrow(/collectCreatorFee/i);
  expect(conn.sendRawTransaction).not.toHaveBeenCalled();
});
