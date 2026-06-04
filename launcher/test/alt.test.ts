import { expect, test, vi } from "vitest";
import {
  AddressLookupTableAccount, Keypair, PublicKey, TransactionInstruction,
} from "@solana/web3.js";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeStaticLutAddresses, loadOrCreateLookupTable } from "../src/alt.js";

// Fixed static accounts shared across every launch (programs, global, fee recipients, etc.).
const STATIC = Array.from({ length: 4 }, () => Keypair.generate().publicKey);
const STATIC_PROGRAM = Keypair.generate().publicKey;

// Derive a per-mint pubkey deterministically so two different mints yield different keys.
function mintDerived(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("bc"), mint.toBuffer()], STATIC_PROGRAM)[0];
}

test("computeStaticLutAddresses returns only the keys shared across launches, minus wallet + mints", async () => {
  const wallet = Keypair.generate();
  // Builder: keys = [static set..., wallet, the mint itself, a mint-derived PDA].
  // programId is a static program; wallet/mint/mint-derived all get excluded.
  const build = async (mint: Keypair) => [
    new TransactionInstruction({
      programId: STATIC_PROGRAM,
      keys: [
        ...STATIC.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })),
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: mint.publicKey, isSigner: true, isWritable: true },
        { pubkey: mintDerived(mint.publicKey), isSigner: false, isWritable: true },
      ],
      data: Buffer.alloc(0),
    }),
  ];

  const result = await computeStaticLutAddresses(build, wallet.publicKey);
  const got = new Set(result.map((k) => k.toBase58()));
  const expected = new Set([STATIC_PROGRAM, ...STATIC].map((k) => k.toBase58()));
  expect(got).toEqual(expected);
  // wallet, mint, and mint-derived keys must NOT appear.
  expect(got.has(wallet.publicKey.toBase58())).toBe(false);
  expect(result).toHaveLength(STATIC.length + 1);
});

test("loadOrCreateLookupTable reuses a persisted, valid ALT without sending a transaction", async () => {
  const dir = mkdtempSync(join(tmpdir(), "alt-"));
  const persistPath = join(dir, "lut.json");
  const altAddress = Keypair.generate().publicKey;
  const addresses = STATIC; // 4 addresses

  // Persist an existing ALT address.
  writeFileSync(persistPath, JSON.stringify({ address: altAddress.toBase58() }));
  expect(existsSync(persistPath)).toBe(true);

  const existing = new AddressLookupTableAccount({
    key: altAddress,
    state: {
      deactivationSlot: BigInt("18446744073709551615"),
      lastExtendedSlot: 100,
      lastExtendedSlotStartIndex: 0,
      authority: Keypair.generate().publicKey,
      addresses: [...addresses, Keypair.generate().publicKey], // >= addresses.length
    },
  });

  const conn = {
    getAddressLookupTable: vi.fn().mockResolvedValue({ value: existing }),
    sendTransaction: vi.fn(() => { throw new Error("must not send on reuse path"); }),
    getSlot: vi.fn(() => { throw new Error("must not query slot on reuse path"); }),
    getLatestBlockhash: vi.fn(() => { throw new Error("must not fetch blockhash on reuse path"); }),
  } as any;

  const got = await loadOrCreateLookupTable(conn, Keypair.generate(), addresses, persistPath);
  expect(got).toBe(existing);
  expect(conn.getAddressLookupTable).toHaveBeenCalledWith(altAddress);
  expect(conn.sendTransaction).not.toHaveBeenCalled();
});
