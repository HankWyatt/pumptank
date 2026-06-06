import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Load the house/deployer keypair from the WALLET env var. Accepts either:
 *  - a base58 private key string (what Phantom/Solflare "Export Private Key" gives) —
 *    64-byte secret key, or a 32-byte seed; or
 *  - a JSON secret-key byte array, e.g. solana-keygen's id.json: [12,34,...].
 */
export function loadWallet(env: Record<string, string | undefined>): Keypair {
  const raw = env.WALLET?.trim();
  if (!raw) {
    throw new Error("WALLET env var is required (a base58 private key, or a JSON secret-key byte array)");
  }
  // JSON byte-array form: [12,34,...]
  if (raw.startsWith("[")) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
  // base58 form (Phantom/Solflare export)
  let bytes: Uint8Array;
  try {
    bytes = bs58.decode(raw);
  } catch {
    throw new Error("WALLET is not valid base58; paste your wallet's exported private key, or a JSON byte array");
  }
  if (bytes.length === 64) return Keypair.fromSecretKey(bytes);
  if (bytes.length === 32) return Keypair.fromSeed(bytes);
  throw new Error(`WALLET base58 decodes to ${bytes.length} bytes; expected 64 (secret key) or 32 (seed)`);
}

export async function hasSufficientBalance(
  conn: Connection, pubkey: PublicKey, requiredSol: number,
): Promise<boolean> {
  const lamports = await conn.getBalance(pubkey);
  return lamports >= requiredSol * LAMPORTS_PER_SOL;
}
