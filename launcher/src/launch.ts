import { readFileSync } from "node:fs";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { LaunchItem } from "./types.js";

export function devBuyLamports(devBuySol: number): bigint {
  return BigInt(Math.round(devBuySol * LAMPORTS_PER_SOL));
}

export interface LaunchOpts {
  devBuySol: number;
  slippageBps: number;
  priorityFeeMicroLamports: number;
}

// `sdk` is a PumpFunSDK-shaped object; injected so tests mock it.
export async function launchOne(
  sdk: { trade: { createAndBuy: Function } },
  wallet: Keypair, mint: Keypair, item: LaunchItem, opts: LaunchOpts,
): Promise<{ mint: string; signature: string }> {
  const img = readFileSync(item.imagePath);
  const file = new Blob([img], { type: "image/png" });
  const res = await sdk.trade.createAndBuy(
    wallet, mint,
    { name: item.name, symbol: item.symbol, description: item.description, file },
    devBuyLamports(opts.devBuySol),
    BigInt(opts.slippageBps),
    { unitLimit: 300_000, unitPrice: opts.priorityFeeMicroLamports },
    "confirmed",
  );
  if (!res?.success) throw new Error(`createAndBuy failed: ${res?.error ?? "unknown"}`);
  return { mint: mint.publicKey.toBase58(), signature: res.signature };
}
