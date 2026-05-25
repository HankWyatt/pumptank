import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";

export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export function creatorVaultPda(creator: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), creator.toBuffer()], PUMP_PROGRAM_ID,
  )[0];
}

export async function getVaultClaimable(conn: Connection, creator: PublicKey): Promise<bigint> {
  return BigInt(await conn.getBalance(creatorVaultPda(creator), "confirmed"));
}

export interface CollectOpts {
  pumpportalUrl: string;
  priorityFeeSol?: number;
  fetchImpl?: typeof fetch;
}

// Thin PumpPortal local-tx wrapper: fetch a serialized collectCreatorFee tx, sign
// locally (keep custody), submit via our RPC. CONFIRM the request shape against
// PumpPortal docs at build (the one pinned piece); pump auto-distributes per each
// token's configured split.
export async function collectCreatorFee(
  conn: Connection, wallet: Keypair, opts: CollectOpts,
): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${opts.pumpportalUrl}/api/trade-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: wallet.publicKey.toBase58(),
      action: "collectCreatorFee",
      pool: "pump",
      priorityFee: opts.priorityFeeSol ?? 0.00001,
    }),
  });
  if (!res.ok) throw new Error(`PumpPortal collectCreatorFee failed: ${res.status} ${await res.text()}`);
  const tx = VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
  tx.sign([wallet]);
  return conn.sendRawTransaction(tx.serialize());
}
