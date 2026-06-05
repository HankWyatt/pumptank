import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { argv as processArgv } from "node:process";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import type { LaunchItem } from "./types.js";
import type { BatchOpts } from "./orchestrate.js";
import type { LaunchDeps, LaunchOpts } from "./launch.js";
import { buildConfig } from "./config.js";
import { loadWallet, hasSufficientBalance } from "./wallet.js";
import { launchOne } from "./launch.js";
import { uploadTokenMetadata } from "./metadata.js";
import { mintExistsOnChain } from "./recover.js";
import { runBatch } from "./orchestrate.js";
import { computeStaticLutAddresses, loadOrCreateLookupTable } from "./alt.js";
import { Ledger } from "./ledger.js";
import { MintStore } from "./mintstore.js";

export const INDEX_ID = "index-pumptank";
export const INDEX_NAME = "PUMPTANK";
export const INDEX_SYMBOL = "PUMPTANK";
// 10% of the 1e15 Token-2022 (6-decimal) supply. The product dev-buy was 1.5e13 (1.5%).
export const INDEX_DEV_BUY_TOKENS = 100_000_000_000_000n;
export const DEFAULT_INDEX_DEV_BUY_SOL = 3.5; // on-chain max_sol_cost ceiling (~3.1 actual at genesis)
export const INDEX_DESCRIPTION =
  "PUMPTANK — the index token of the unofficial Shark Tank tribute. Trading fees from " +
  "every product token flow to the PUMPTANK treasury. Unofficial parody; not affiliated " +
  "with Shark Tank/ABC/Sony; not financial advice; no promise of value.";

export function flagOr(argv: string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

export function buildIndexItem(imagePath: string): LaunchItem {
  return { id: INDEX_ID, name: INDEX_NAME, symbol: INDEX_SYMBOL,
    description: INDEX_DESCRIPTION, imagePath, devBuy: true };
}

export function resolveIndexDevBuySol(env: Record<string, string | undefined>): number {
  const v = Number(env.INDEX_DEV_BUY_SOL ?? DEFAULT_INDEX_DEV_BUY_SOL);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`INDEX_DEV_BUY_SOL must be a positive number, got ${env.INDEX_DEV_BUY_SOL}`);
  }
  return v;
}

export function indexLaunchOpts(
  slippageBps: number, indexDevBuySol: number, priorityFeeMicroLamports: number,
): LaunchOpts {
  const solCapLamports = BigInt(Math.ceil(indexDevBuySol * (1 + slippageBps / 10_000) * 1e9));
  return { devBuyTokens: INDEX_DEV_BUY_TOKENS, solCapLamports, priorityFeeMicroLamports };
}

export function indexBatchOpts(
  cfg: { slippageBps: number; priorityFeeMicroLamports: number; pacingMs: number;
    maxTotalSpendSol: number; maxRetriesPerToken: number },
  indexDevBuySol: number,
): BatchOpts {
  return {
    devBuySol: indexDevBuySol, // the spend cap must account for the index buy
    slippageBps: cfg.slippageBps,
    priorityFeeMicroLamports: cfg.priorityFeeMicroLamports,
    pacingMs: cfg.pacingMs,
    maxTotalSpendSol: cfg.maxTotalSpendSol,
    maxRetriesPerToken: cfg.maxRetriesPerToken,
  };
}

export function indexPreview(indexDevBuySol: number): { capSol: number; line: string } {
  return {
    capSol: indexDevBuySol,
    line: `Would launch index token $PUMPTANK with a 10% dev-buy ` +
      `(cap ~${indexDevBuySol.toFixed(2)} SOL; ~3.1 SOL actual at genesis) ` +
      `+ ~0.02 SOL create rent + priority fee`,
  };
}
