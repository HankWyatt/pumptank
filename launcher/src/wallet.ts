import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export function loadWallet(env: Record<string, string | undefined>): Keypair {
  if (!env.WALLET) throw new Error("WALLET env var (JSON secret-key array) is required");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.WALLET)));
}

export async function hasSufficientBalance(
  conn: Connection, pubkey: PublicKey, requiredSol: number,
): Promise<boolean> {
  const lamports = await conn.getBalance(pubkey);
  return lamports >= requiredSol * LAMPORTS_PER_SOL;
}
