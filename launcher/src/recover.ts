import { Connection, PublicKey } from "@solana/web3.js";

// A pump.fun create leaves a mint account on-chain. If an `attempting` entry's
// mint exists, the create already landed -> recover (do NOT relaunch).
export async function mintExistsOnChain(conn: Connection, mint: PublicKey): Promise<boolean> {
  const info = await conn.getAccountInfo(mint, "confirmed");
  return info !== null;
}
