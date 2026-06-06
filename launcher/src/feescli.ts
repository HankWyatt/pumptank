import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createRequire } from "node:module";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { loadWallet } from "./wallet.js";
import {
  loadFeeConfig,
  saveFeeConfig,
  markOptin,
  markShared,
  markDistributed,
  type FeeConfig,
} from "./feeconfig.js";
import {
  getCreatorVaultClaimable, collectHouseFees,
  getCoinCreatorFeeClaimable, collectCoinCreatorFees,
} from "./collect.js";
import { Ledger } from "./ledger.js";

const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), "..", "data");
const CONFIG_PATH = process.env.CONFIG_PATH ?? join(DATA_DIR, "fee-config.json");
const LEDGER_PATH = join(DATA_DIR, "launch-ledger.json");

/**
 * Referral fee split, in basis points. The founder (creator) is ALWAYS 80%.
 * - WITH a referrer: founder 8000 / main-token ($PUMPTANK) 1000 / referrer 1000.
 * - WITHOUT a referrer: founder 8000 / main-token 2000.
 */
export const FOUNDER_SHARE_BPS = 8000;
export const MAIN_TOKEN_SHARE_WITH_REFERRER_BPS = 1000;
export const REFERRER_SHARE_BPS = 1000;
export const MAIN_TOKEN_SHARE_NO_REFERRER_BPS = 2000;

export function previewCollect(vaultLamports: bigint, coinCreatorLamports: bigint = 0n): string {
  const v = Number(vaultLamports) / LAMPORTS_PER_SOL;
  const c = Number(coinCreatorLamports) / LAMPORTS_PER_SOL;
  return `Claimable house fees: ${(v + c).toFixed(4)} SOL `
    + `(creator-vault ${v.toFixed(4)} + coin-creator reward coins ${c.toFixed(4)})`;
}

export function shouldCollect(claimableLamports: bigint, minSol: number): boolean {
  return Number(claimableLamports) >= minSol * LAMPORTS_PER_SOL;
}

export function assertCanBroadcast(confirm: boolean): void {
  if (!confirm) throw new Error("refusing to broadcast: pass --confirm (default is dry-run)");
}

/**
 * The one-time referral split. Founder is ALWAYS 80%.
 * - referrer present: founder 8000 / main-token 1000 / referrer 1000.
 * - referrer null:    founder 8000 / main-token 2000.
 *
 * Validates that all shareholder addresses are distinct (Pump Fees V2 rejects duplicate
 * shareholders) and that the shareBps sum to exactly 10000. Pure so it's unit-testable.
 */
export function buildShareholders(
  founder: PublicKey,
  mainToken: PublicKey,
  referrer: PublicKey | null,
): { address: PublicKey; shareBps: number }[] {
  const shareholders = referrer
    ? [
        { address: founder, shareBps: FOUNDER_SHARE_BPS },
        { address: mainToken, shareBps: MAIN_TOKEN_SHARE_WITH_REFERRER_BPS },
        { address: referrer, shareBps: REFERRER_SHARE_BPS },
      ]
    : [
        { address: founder, shareBps: FOUNDER_SHARE_BPS },
        { address: mainToken, shareBps: MAIN_TOKEN_SHARE_NO_REFERRER_BPS },
      ];

  // Pump Fees V2 rejects duplicate shareholders -- all addresses must be distinct.
  const seen = new Set<string>();
  for (const { address } of shareholders) {
    const key = address.toBase58();
    if (seen.has(key)) {
      throw new Error(`duplicate shareholder address: ${key} (founder, main-token, and referrer must all be distinct)`);
    }
    seen.add(key);
  }

  const sum = shareholders.reduce((acc, s) => acc + s.shareBps, 0);
  if (sum !== 10000) throw new Error(`shareholder bps must sum to 10000, got ${sum}`);

  return shareholders;
}

/** The Pump SDK surface this CLI uses. Injected so verbs are unit-testable without the real (CJS) SDK. */
export interface FeesSdk {
  createFeeSharingConfig(args: { creator: PublicKey; mint: PublicKey; pool: PublicKey | null }): Promise<TransactionInstruction>;
  updateFeeSharesV2(args: {
    authority: PublicKey;
    mint: PublicKey;
    currentShareholders: PublicKey[];
    newShareholders: { address: PublicKey; shareBps: number }[];
    quoteMint: PublicKey;
    quoteTokenProgram: PublicKey;
  }): Promise<TransactionInstruction>;
}
export interface OnlineFeesSdk {
  buildDistributeCreatorFeesInstructions(mint: PublicKey): Promise<{ instructions: TransactionInstruction[]; isGraduated: boolean }>;
}

export interface FeesDeps {
  loadFeeConfig: (path: string) => FeeConfig;
  saveFeeConfig: (path: string, cfg: FeeConfig) => void;
  loadWallet: (env: Record<string, string | undefined>) => Keypair;
  makeConnection: (env: Record<string, string | undefined>) => Connection;
  getLedgerMint: (id: string) => string | undefined;
  getPumpSdk: () => FeesSdk;
  getOnlineSdk: (conn: Connection) => OnlineFeesSdk;
  getCreatorVaultClaimable: (conn: Connection, creator: PublicKey) => Promise<bigint>;
  collectHouseFees: (conn: Connection, wallet: Keypair) => Promise<string>;
  /** Coin-creator-fee bucket (the "reward coins" pump.fun claims in bulk). */
  getCoinCreatorClaimable: (conn: Connection, creator: PublicKey) => Promise<bigint>;
  collectCoinCreatorFees: (conn: Connection, wallet: Keypair) => Promise<string>;
  /** Sign + send + confirm a single tx of `ixs` paid/signed by `wallet`. Returns the signature. */
  sendTx: (conn: Connection, wallet: Keypair, ixs: TransactionInstruction[]) => Promise<string>;
  log: (msg: string) => void;
}

// The official SDK's ESM build does a named `import { BN } from "@coral-xyz/anchor"`, which
// Node ESM cannot resolve from the CJS anchor package. Load the working CJS build via
// createRequire (mirrors src/cli.ts). Lazy: only loaded by verbs that actually need it.
function requireSdk(): typeof import("@pump-fun/pump-sdk") {
  return createRequire(import.meta.url)("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");
}

async function defaultSendTx(conn: Connection, wallet: Keypair, ixs: TransactionInstruction[]): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }), ...ixs],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([wallet]);
  const signature = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}

export function defaultDeps(): FeesDeps {
  return {
    loadFeeConfig,
    saveFeeConfig,
    loadWallet,
    makeConnection: (env) => new Connection(env.RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed"),
    getLedgerMint: (id) => new Ledger(LEDGER_PATH).get(id)?.mint,
    getPumpSdk: () => new (requireSdk().PumpSdk)() as unknown as FeesSdk,
    getOnlineSdk: (conn) => new (requireSdk().OnlinePumpSdk)(conn) as unknown as OnlineFeesSdk,
    getCreatorVaultClaimable,
    collectHouseFees,
    getCoinCreatorClaimable: getCoinCreatorFeeClaimable,
    collectCoinCreatorFees,
    sendTx: defaultSendTx,
    log: (msg) => console.log(msg),
  };
}

const USAGE = "usage: fees <status|verify|collect|optin|set-shares|distribute> [...] [--confirm]";

export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  deps: FeesDeps = defaultDeps(),
): Promise<void> {
  const [cmd, ...rest] = argv;
  const confirm = argv.includes("--confirm");
  const positional = rest.filter((a) => !a.startsWith("--"));
  const log = deps.log;

  // --- pure verbs (no SDK/RPC) ---
  if (cmd === "status") {
    const cfg = deps.loadFeeConfig(CONFIG_PATH);
    const all = Object.entries(cfg);
    const shared = all.filter(([, e]) => e.split === "split_80_20").length;
    log(`fee-config: ${all.length} tracked, ${shared} at 80/20, ${all.length - shared} at 100% house`);
    for (const [id, e] of all) {
      const ref = e.referrerWallet ? ` referrer=${e.referrerWallet}` : "";
      log(`  ${id}: optedIn=${e.optedIn} split=${e.split} changeUsed=${e.changeUsed} mint=${e.mint ?? "-"}${ref}`);
    }
    return;
  }

  if (cmd === "optin") {
    const [id, founderWallet, referrerWallet] = positional;
    if (!id || !founderWallet) throw new Error("usage: fees optin <id> <founderWallet> [referrerWallet]");
    const mint = deps.getLedgerMint(id);
    if (!mint) throw new Error(`no launched mint for ${id} (not in the launch ledger)`);
    deps.saveFeeConfig(CONFIG_PATH, markOptin(deps.loadFeeConfig(CONFIG_PATH), id, founderWallet, mint, referrerWallet));
    log(
      `opted in: ${id} -> founder ${founderWallet}${referrerWallet ? ` referrer ${referrerWallet}` : ""} (mint ${mint}); still 100% house until set-shares`,
    );
    return;
  }

  // --- verbs that need wallet + RPC ---
  const wallet = deps.loadWallet(env);
  const conn = deps.makeConnection(env);
  const house = wallet.publicKey;

  if (cmd === "verify") {
    const vault = await deps.getCreatorVaultClaimable(conn, house);
    const coin = await deps.getCoinCreatorClaimable(conn, house);
    log(`house (deployer): ${house.toBase58()}`);
    log(previewCollect(vault, coin));
    return;
  }

  if (cmd === "collect") {
    const minSol = Number(env.MIN_COLLECT_SOL ?? "0.005");
    const vault = await deps.getCreatorVaultClaimable(conn, house);
    const coin = await deps.getCoinCreatorClaimable(conn, house);
    log(previewCollect(vault, coin));
    const doVault = shouldCollect(vault, minSol);
    const doCoin = shouldCollect(coin, minSol);
    if (!doVault && !doCoin) {
      log(`below MIN_COLLECT_SOL (${minSol}) -- nothing to collect.`);
      return;
    }
    if (!confirm) {
      log("DRY RUN -- not collecting. Re-run with --confirm.");
      return;
    }
    if (doVault) {
      const sig = await deps.collectHouseFees(conn, wallet);
      log(`collected creator-vault: https://solscan.io/tx/${sig}`);
    }
    if (doCoin) {
      const sig = await deps.collectCoinCreatorFees(conn, wallet);
      log(`collected coin-creator reward coins: https://solscan.io/tx/${sig}`);
    }
    return;
  }

  if (cmd === "set-shares") {
    const [id] = positional;
    if (!id) throw new Error("usage: fees set-shares <id> [--confirm]");
    if (!env.MAIN_TOKEN_WALLET) throw new Error("MAIN_TOKEN_WALLET env required for set-shares");
    const cfg = deps.loadFeeConfig(CONFIG_PATH);
    const e = cfg[id];
    if (!e || !e.optedIn || !e.founderWallet) throw new Error(`cannot set shares for ${id}: not opted in`);
    if (e.changeUsed) throw new Error(`cannot set shares for ${id}: one-time change already used (locked)`);
    if (!e.mint) throw new Error(`cannot set shares for ${id}: no mint recorded`);
    const mintPk = new PublicKey(e.mint);
    const founderPk = new PublicKey(e.founderWallet);
    const mainTokenPk = new PublicKey(env.MAIN_TOKEN_WALLET);
    const referrerPk = e.referrerWallet ? new PublicKey(e.referrerWallet) : null;
    const newShareholders = buildShareholders(founderPk, mainTokenPk, referrerPk);

    const sdk = deps.getPumpSdk();
    const sharingIx = await sdk.createFeeSharingConfig({ creator: house, mint: mintPk, pool: null });
    const sharesIx = await sdk.updateFeeSharesV2({
      authority: house,
      mint: mintPk,
      currentShareholders: [house],
      newShareholders,
      quoteMint: NATIVE_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
    });

    log(
      `set-shares ${id}: ${newShareholders.map((s) => `${s.address.toBase58()} ${s.shareBps}bps`).join(" / ")} (one-time, locks)`,
    );
    if (!confirm) {
      log("DRY RUN -- not broadcasting. Re-run with --confirm.");
      return;
    }
    // Both instructions fit in one VersionedTransaction (createFeeSharingConfig + updateFeeSharesV2).
    const sig = await deps.sendTx(conn, wallet, [sharingIx, sharesIx]);
    deps.saveFeeConfig(CONFIG_PATH, markShared(cfg, id, { sharingConfigSig: sig, setSharesSig: sig }));
    log(`set shares + locked: ${id} -> https://solscan.io/tx/${sig}`);
    return;
  }

  if (cmd === "distribute") {
    const [id] = positional;
    if (!id) throw new Error("usage: fees distribute <id> [--confirm]");
    const cfg = deps.loadFeeConfig(CONFIG_PATH);
    const e = cfg[id];
    if (!e || !e.optedIn || !e.mint) throw new Error(`cannot distribute ${id}: not opted in / no mint`);
    if (e.split !== "split_80_20") throw new Error(`cannot distribute ${id}: shares not set (run set-shares first)`);
    const mintPk = new PublicKey(e.mint);
    const onlineSdk = deps.getOnlineSdk(conn);
    const r = await onlineSdk.buildDistributeCreatorFeesInstructions(mintPk);
    log(`distribute ${id}: ${r.instructions.length} instruction(s)${r.isGraduated ? " (graduated)" : ""}`);
    if (!confirm) {
      log("DRY RUN -- not broadcasting. Re-run with --confirm.");
      return;
    }
    const sig = await deps.sendTx(conn, wallet, r.instructions);
    deps.saveFeeConfig(CONFIG_PATH, markDistributed(cfg, id, sig));
    log(`distributed: ${id} -> https://solscan.io/tx/${sig}`);
    return;
  }

  log(USAGE);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2), process.env).catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
