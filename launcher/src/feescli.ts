import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadWallet } from "./wallet.js";
import { loadFeeConfig, saveFeeConfig, markOptin, markRedirected } from "./feeconfig.js";
import { getVaultClaimable, collectCreatorFee } from "./collect.js";

const DATA_DIR = join(process.cwd(), "..", "data");
const CONFIG_PATH = join(DATA_DIR, "fee-config.json");

export function previewCollect(claimableLamports: bigint): string {
  return `Claimable creator-fee vault: ${(Number(claimableLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL (pump distributes per each token's configured split)`;
}

export function assertCanBroadcast(confirm: boolean): void {
  if (!confirm) throw new Error("refusing to broadcast: pass --confirm to collect (default is dry-run)");
}

export async function main(argv: string[], env: Record<string, string | undefined>): Promise<void> {
  const [cmd, ...rest] = argv;
  const confirm = argv.includes("--confirm");

  if (cmd === "mark-optin") {
    const [id, wallet] = rest;
    saveFeeConfig(CONFIG_PATH, markOptin(loadFeeConfig(CONFIG_PATH), id, wallet));
    console.log(`opted in: ${id} -> ${wallet}`);
    return;
  }
  if (cmd === "mark-redirected") {
    const [id] = rest;
    saveFeeConfig(CONFIG_PATH, markRedirected(loadFeeConfig(CONFIG_PATH), id));
    console.log(`redirected (80/20) + locked: ${id}`);
    return;
  }
  if (cmd === "status") {
    const cfg = loadFeeConfig(CONFIG_PATH);
    const all = Object.entries(cfg);
    const redirected = all.filter(([, e]) => e.split === "split_80_20").length;
    console.log(`fee-config: ${all.length} tracked, ${redirected} redirected (80/20), ${all.length - redirected} at 100% house`);
    for (const [id, e] of all) console.log(`  ${id}: optedIn=${e.optedIn} split=${e.split} changeUsed=${e.changeUsed}`);
    return;
  }

  // collect / verify need the wallet + RPC
  const wallet = loadWallet(env);
  const conn = new Connection(env.RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
  const claimable = await getVaultClaimable(conn, wallet.publicKey);

  if (cmd === "verify") {
    console.log(`creator (deployer): ${wallet.publicKey.toBase58()}`);
    console.log(previewCollect(claimable));
    return;
  }
  if (cmd === "collect") {
    console.log(previewCollect(claimable));
    if (!confirm) { console.log("DRY RUN -- not collecting. Re-run with --confirm."); return; }
    assertCanBroadcast(confirm);
    const sig = await collectCreatorFee(conn, wallet, { pumpportalUrl: env.PUMPPORTAL_URL ?? "https://pumpportal.fun" });
    console.log(`collected: https://solscan.io/tx/${sig}`);
    return;
  }
  console.log("usage: fees <mark-optin|mark-redirected|status|verify|collect> [...]");
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2), process.env).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
