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
import { loadMetadataUris, metadataUriFor } from "./metadata.js";
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

export async function main(argv: string[], env: Record<string, string | undefined>): Promise<void> {
  const cfg = buildConfig(argv, env); // reuses MAX_TOTAL_SPEND_SOL/RPC_URL/SLIPPAGE_BPS/PRIORITY_FEE/--confirm
  const dataDir = join(process.cwd(), "..", "data");
  const imagePath = flagOr(argv, "--image", join(dataDir, "index", "pumptanklogo.png"));
  if (!existsSync(imagePath)) throw new Error(`index image not found: ${imagePath}`);
  const indexDevBuySol = resolveIndexDevBuySol(env);
  if (indexDevBuySol > cfg.maxTotalSpendSol) {
    throw new Error(`INDEX_DEV_BUY_SOL (${indexDevBuySol}) exceeds MAX_TOTAL_SPEND_SOL (${cfg.maxTotalSpendSol}); raise MAX_TOTAL_SPEND_SOL`);
  }
  const item = buildIndexItem(imagePath);

  // Preflight (dry-run too): the index token's self-hosted metadata must be staged.
  const metadataUris = loadMetadataUris(dataDir);
  metadataUriFor(item, metadataUris);

  const { line } = indexPreview(indexDevBuySol);
  console.log(line);
  if (!cfg.confirm) { console.log("DRY RUN -- no transactions broadcast. Re-run with --confirm to launch."); return; }

  const wallet = loadWallet(env);
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  const opts = indexLaunchOpts(cfg.slippageBps, indexDevBuySol, cfg.priorityFeeMicroLamports);
  const required = indexDevBuySol * 1.08 + 0.02; // dev-buy (slippage buffer) + create rent
  if (!(await hasSufficientBalance(conn, wallet.publicKey, required))) {
    throw new Error(`wallet balance below required ~${required.toFixed(2)} SOL`);
  }
  // ESM/CJS: load the official SDK via createRequire (its ESM build's named anchor BN import breaks under Node ESM).
  const { OnlinePumpSdk, PumpSdk } = createRequire(import.meta.url)("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");
  const onlineSdk = new OnlinePumpSdk(conn);
  const pumpSdk = new PumpSdk();
  const global = await onlineSdk.fetchGlobal();

  // The index is a dev-buy → build/reuse the ALT so create_v2+buy fits one legacy tx.
  const staticAddrs = await computeStaticLutAddresses((m: Keypair) => pumpSdk.createV2AndBuyInstructions({
    global, mint: m.publicKey, name: item.name, symbol: item.symbol, uri: "https://pump.fun",
    creator: wallet.publicKey, user: wallet.publicKey,
    amount: new BN(opts.devBuyTokens.toString()), solAmount: new BN(opts.solCapLamports.toString()), mayhemMode: false,
  } as any), wallet.publicKey);
  console.log(`lookup table: ${staticAddrs.length} static accounts`);
  const lookupTable = await loadOrCreateLookupTable(conn, wallet, staticAddrs, join(dataDir, "launch-alt.json"));

  const deps: LaunchDeps = {
    global,
    uploadMetadata: (it) => Promise.resolve(metadataUriFor(it, metadataUris)),
    buildCreateAndBuy: (args) => pumpSdk.createV2AndBuyInstructions({ ...args, mint: args.mint.publicKey } as any),
    buildCreate: async (args) => [await pumpSdk.createV2Instruction({ ...args, mint: args.mint.publicKey, mayhemMode: false } as any)],
    connection: conn as unknown as LaunchDeps["connection"],
    lookupTable,
  };
  const ledger = new Ledger(join(dataDir, "launch-ledger.json"));
  const mintstore = new MintStore(join(dataDir, ".mint-keys"));
  const result = await runBatch(
    [item], ledger, mintstore,
    (mint, it) => launchOne(deps, wallet, mint, it, opts),
    (mintB58) => mintExistsOnChain(conn, new PublicKey(mintB58)),
    indexBatchOpts(cfg, indexDevBuySol),
  );
  const entry = ledger.get(item.id);
  console.log(`Done: ${result.succeeded} launched, ${result.failed} failed.`);
  console.log(`$PUMPTANK mint: ${entry?.mint ?? "(see launch-ledger.json)"}  sig: ${entry?.signature ?? ""}`);
}

function isMainModule(): boolean {
  const entry = processArgv[1];
  if (!entry) return false;
  try { return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isMainModule()) {
  main(process.argv.slice(2), process.env).catch((e) => { console.error(e); process.exit(1); });
}
