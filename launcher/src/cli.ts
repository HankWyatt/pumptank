import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { createRequire } from "node:module";
import { join } from "node:path";
import { argv as processArgv } from "node:process";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import type { Config, LaunchItem } from "./types.js";
import { buildConfig } from "./config.js";
import { loadLaunchItems } from "./products.js";
import { Ledger } from "./ledger.js";
import { MintStore } from "./mintstore.js";
import { loadWallet, hasSufficientBalance } from "./wallet.js";
import { launchOne } from "./launch.js";
import type { LaunchDeps } from "./launch.js";
import { uploadTokenMetadata } from "./metadata.js";
import { mintExistsOnChain } from "./recover.js";
import { runBatch } from "./orchestrate.js";
import { computeStaticLutAddresses, loadOrCreateLookupTable } from "./alt.js";

export function preview(items: LaunchItem[], cfg: Config): { totalSol: number; line: string } {
  const totalSol = items.length * cfg.devBuySol;
  return { totalSol, line: `Would launch ${items.length} tokens; dev-buys ~= ${totalSol.toFixed(2)} SOL (+ ~1.25% trading fee, rent, priority fees)` };
}

export function assertCanBroadcast(cfg: Config): void {
  if (!cfg.confirm) throw new Error("refusing to broadcast: pass --confirm to spend real SOL (default is dry-run)");
}

export async function main(argv: string[], env: Record<string, string | undefined>): Promise<void> {
  const cfg = buildConfig(argv, env);
  const dataDir = join(process.cwd(), "..", "data");
  let items = loadLaunchItems(dataDir);
  if (cfg.only) items = items.filter((i) => i.id === cfg.only);
  if (cfg.limit !== undefined) items = items.slice(0, cfg.limit);

  const { line } = preview(items, cfg);
  console.log(line);
  if (!cfg.confirm) { console.log("DRY RUN -- no transactions broadcast. Re-run with --confirm to launch."); return; }
  assertCanBroadcast(cfg);

  const wallet = loadWallet(env);
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  // Funding precheck: dev-buys cost ~devBuySol each (×1.08 slippage/fee buffer); EVERY
  // coin (dev-buy and create-only) locks ~0.02 SOL rent + priority fees.
  const devBuyCount = items.filter((i) => i.devBuy).length;
  const totalCount = items.length;
  console.log(`launching ${totalCount} coins (${devBuyCount} dev-buy, ${totalCount - devBuyCount} create-only)`);
  const required = devBuyCount * cfg.devBuySol * 1.08 + totalCount * 0.02; // dev-buys + per-coin rent/fee buffer
  if (!(await hasSufficientBalance(conn, wallet.publicKey, required))) {
    throw new Error(`wallet balance below required ~${required.toFixed(2)} SOL`);
  }
  // The official SDK's ESM build does a named `import { BN } from "@coral-xyz/anchor"`,
  // which Node ESM cannot resolve from the CJS anchor package. Load the working CJS
  // build via createRequire instead. Lazy here so the dry-run path never loads the SDK.
  const { OnlinePumpSdk, PumpSdk } = createRequire(import.meta.url)("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");
  const onlineSdk = new OnlinePumpSdk(conn);
  const pumpSdk = new PumpSdk();
  const global = await onlineSdk.fetchGlobal();
  const solCapLamports = BigInt(Math.ceil(cfg.devBuySol * (1 + cfg.slippageBps / 10_000) * 1e9));
  // Build/reuse ONE Address Lookup Table of the static accounts so each create+buy
  // fits a single legacy tx (the official SDK's SOL create_v2+buy is ~1250B > 1232).
  const staticAddrs = await computeStaticLutAddresses((m: Keypair) => pumpSdk.createV2AndBuyInstructions({
    global, mint: m.publicKey, name: "sample", symbol: "smpl", uri: "https://pump.fun",
    creator: wallet.publicKey, user: wallet.publicKey,
    amount: new BN(cfg.devBuyTokens.toString()), solAmount: new BN(solCapLamports.toString()), mayhemMode: false,
  } as any), wallet.publicKey);
  console.log(`lookup table: ${staticAddrs.length} static accounts`);
  const lookupTable = await loadOrCreateLookupTable(conn, wallet, staticAddrs, join(dataDir, "launch-alt.json"));
  const deps: LaunchDeps = {
    global,
    uploadMetadata: (item) => uploadTokenMetadata(item),
    buildCreateAndBuy: (args) =>
      pumpSdk.createV2AndBuyInstructions({ ...args, mint: args.mint.publicKey } as any),
    // create_v2-only (no dev-buy). The SDK returns a single ix; wrap it in an array.
    buildCreate: async (args) =>
      [await pumpSdk.createV2Instruction({ ...args, mint: args.mint.publicKey, mayhemMode: false } as any)],
    connection: conn as unknown as LaunchDeps["connection"],
    lookupTable,
  };
  const ledger = new Ledger(join(dataDir, "launch-ledger.json"));
  const mintstore = new MintStore(join(dataDir, ".mint-keys"));
  const result = await runBatch(
    items, ledger, mintstore,
    (mint, item) => launchOne(deps, wallet, mint, item, {
      devBuyTokens: cfg.devBuyTokens,
      solCapLamports,
      priorityFeeMicroLamports: cfg.priorityFeeMicroLamports,
    }),
    (mintB58) => mintExistsOnChain(conn, new PublicKey(mintB58)),
    cfg,
  );
  console.log(`Done: ${result.succeeded} launched, ${result.failed} failed, ${result.skipped} skipped`);
}

// entrypoint: only run when invoked directly (not when imported by tests)
function isMainModule(): boolean {
  const entry = processArgv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main(process.argv.slice(2), process.env).catch((e) => { console.error(e); process.exit(1); });
}
