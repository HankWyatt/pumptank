import {
  AddressLookupTableProgram, AddressLookupTableAccount, Connection, Keypair, PublicKey,
  TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

/** Builds a sample create+buy instruction list for a throwaway mint (same wallet). */
export type SampleBuilder = (mint: Keypair) => Promise<TransactionInstruction[]>;

/**
 * Identify the accounts that are identical across launches, so they belong in a
 * reusable ALT. Builds two sample create+buy ix lists with different throwaway
 * mints (same wallet) and returns the INTERSECTION of their account keys
 * (incl. each ix's programId), EXCLUDING the wallet (a signer — stays a direct
 * key) and the two throwaway mints (per-coin signers). Per-coin accounts
 * (bonding_curve, associated_bonding_curve, mint, user base ATA, mayhem_state,
 * etc.) differ between the two and are naturally excluded; static accounts
 * (programs, global, fee recipients, the house creator-vault, volume
 * accumulators, event authority, fee_config) are identical and kept.
 */
export async function computeStaticLutAddresses(
  build: SampleBuilder, wallet: PublicKey,
): Promise<PublicKey[]> {
  const mintA = Keypair.generate(), mintB = Keypair.generate();
  const a = await build(mintA), b = await build(mintB);
  const keysOf = (ixs: TransactionInstruction[]) =>
    new Set(ixs.flatMap((ix) => [ix.programId.toBase58(), ...ix.keys.map((k) => k.pubkey.toBase58())]));
  const inB = keysOf(b);
  const exclude = new Set([wallet.toBase58(), mintA.publicKey.toBase58(), mintB.publicKey.toBase58()]);
  const out = new Map<string, PublicKey>();
  for (const ix of a) for (const key of [ix.programId, ...ix.keys.map((k) => k.pubkey)]) {
    const s = key.toBase58();
    if (exclude.has(s) || !inB.has(s)) continue;
    if (!out.has(s)) out.set(s, key);
  }
  return [...out.values()];
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Reuse a persisted ALT if still valid, else create one (batched extends +
 * activation warmup), persist its address, and return the account. Mirrors
 * PR1's smoke-harness send machinery.
 */
export async function loadOrCreateLookupTable(
  conn: Connection, wallet: Keypair, addresses: PublicKey[], persistPath: string,
): Promise<AddressLookupTableAccount> {
  if (existsSync(persistPath)) {
    try {
      const addr = new PublicKey(JSON.parse(readFileSync(persistPath, "utf8")).address);
      const got = await conn.getAddressLookupTable(addr);
      if (got.value && got.value.state.addresses.length >= addresses.length) return got.value;
    } catch { /* fall through to create */ }
  }
  const recentSlot = await conn.getSlot("finalized");
  const [createIx, altAddress] = AddressLookupTableProgram.createLookupTable({
    authority: wallet.publicKey, payer: wallet.publicKey, recentSlot,
  });
  const send = async (instructions: TransactionInstruction[]) => {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: wallet.publicKey, recentBlockhash: blockhash, instructions,
    }).compileToV0Message();
    const tx = new VersionedTransaction(msg); tx.sign([wallet]);
    const sig = await conn.sendTransaction(tx);
    await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  };
  const BATCH = 20;
  const extend = (addrs: PublicKey[]) => AddressLookupTableProgram.extendLookupTable({
    lookupTable: altAddress, authority: wallet.publicKey, payer: wallet.publicKey, addresses: addrs,
  });
  await send([createIx, extend(addresses.slice(0, BATCH))]);
  for (let i = BATCH; i < addresses.length; i += BATCH) await send([extend(addresses.slice(i, i + BATCH))]);
  // a freshly-extended ALT is only usable the slot AFTER its last extension
  for (let attempt = 0; attempt < 30; attempt++) {
    const got = await conn.getAddressLookupTable(altAddress);
    if (got.value && got.value.state.addresses.length >= addresses.length) {
      const warmAt = await conn.getSlot();
      while ((await conn.getSlot()) <= warmAt + 1) await sleep(400);
      const ready = (await conn.getAddressLookupTable(altAddress)).value!;
      writeFileSync(persistPath, JSON.stringify({ address: altAddress.toBase58() }, null, 2));
      return ready;
    }
    await sleep(800);
  }
  throw new Error(`ALT ${altAddress.toBase58()} did not activate in time`);
}
