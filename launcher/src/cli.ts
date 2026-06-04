import { Connection, PublicKey } from "@solana/web3.js";
import { OnlinePumpSdk, PumpSdk } from "@pump-fun/pump-sdk";
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
  const required = items.length * cfg.devBuySol * 1.08 + items.length * 0.015; // dev-buys + ~rent/fee buffer
  if (!(await hasSufficientBalance(conn, wallet.publicKey, required))) {
    throw new Error(`wallet balance below required ~${required.toFixed(2)} SOL`);
  }
  const onlineSdk = new OnlinePumpSdk(conn);
  const pumpSdk = new PumpSdk();
  const global = await onlineSdk.fetchGlobal();
  const solCapLamports = BigInt(Math.ceil(cfg.devBuySol * (1 + cfg.slippageBps / 10_000) * 1e9));
  const deps: LaunchDeps = {
    global,
    uploadMetadata: (item) => uploadTokenMetadata(item),
    buildCreateAndBuy: (args) =>
      pumpSdk.createV2AndBuyInstructions({ ...args, mint: args.mint.publicKey } as any),
    connection: conn as unknown as LaunchDeps["connection"],
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
