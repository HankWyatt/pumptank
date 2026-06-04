import {
  ComputeBudgetProgram, Connection, Keypair, PublicKey,
  TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createRequire } from "node:module";

export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

/** Bonding-curve creator vault PDA: seeds [b"creator-vault", creator]. */
export function creatorVaultPda(creator: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), creator.toBuffer()], PUMP_PROGRAM_ID,
  )[0];
}

/**
 * Lamports sitting in the creator's bonding-curve vault. For the SOL/wSOL path the
 * accrued creator fees ARE lamports held at the vault PDA, so the raw balance is the
 * claimable amount (the program leaves the vault rent-exempt on sweep).
 */
export async function getCreatorVaultClaimable(conn: Connection, creator: PublicKey): Promise<bigint> {
  return BigInt(await conn.getBalance(creatorVaultPda(creator), "confirmed"));
}

/** The slice of the pump anchor program we use to build collect_creator_fee_v2. */
interface PumpCollectProgram {
  methods: {
    collectCreatorFeeV2(): {
      accountsPartial(accounts: Record<string, PublicKey>): { instruction(): Promise<TransactionInstruction> };
    };
  };
}

/** Injected SDK dependency so the builder is unit-testable offline (no real RPC/SDK load). */
export interface CollectDeps {
  /** Returns the pump anchor program bound to `conn`. Defaults to the real SDK via createRequire. */
  getProgram(conn: Connection): PumpCollectProgram;
}

// The official SDK's ESM build does a named `import { BN } from "@coral-xyz/anchor"`, which
// Node ESM cannot resolve from the CJS anchor package. Load the working CJS build via
// createRequire (mirrors src/cli.ts). Lazy: only loaded when a caller actually builds a tx.
function defaultDeps(): CollectDeps {
  return {
    getProgram: (conn) => {
      const { getPumpProgram } = createRequire(import.meta.url)("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");
      return getPumpProgram(conn) as unknown as PumpCollectProgram;
    },
  };
}

/**
 * Build the bonding-curve `collect_creator_fee_v2` instruction(s) that sweep the shared
 * house creator vault `["creator-vault", house]` back to `house`. Permissionless (anyone
 * can call it for a given creator); the payer/signer is the house wallet.
 *
 * SOL path: quoteMint = NATIVE_MINT (wrapped SOL), quoteTokenProgram = TOKEN_PROGRAM_ID.
 * For wrapped SOL the program does a lamport transfer and the ATAs are unused, but the
 * IDL still requires them as (derivable) accounts, so we pass the canonical ATAs.
 *
 * No convenience method exists on PumpSdk/OnlinePumpSdk for the bonding-curve v2 collect
 * (only the AMM `collectCoinCreatorFee*Instructions`), so we build it via the exported
 * anchor program `getPumpProgram(conn).methods.collectCreatorFeeV2()`.
 */
export async function buildCollectHouseFeesInstructions(
  conn: Connection, house: PublicKey, deps: CollectDeps = defaultDeps(),
): Promise<TransactionInstruction[]> {
  const program = deps.getProgram(conn);
  const vault = creatorVaultPda(house);
  const ix = await program.methods.collectCreatorFeeV2().accountsPartial({
    creator: house,
    creatorTokenAccount: getAssociatedTokenAddressSync(NATIVE_MINT, house, true, TOKEN_PROGRAM_ID),
    creatorVault: vault,
    creatorVaultTokenAccount: getAssociatedTokenAddressSync(NATIVE_MINT, vault, true, TOKEN_PROGRAM_ID),
    quoteMint: NATIVE_MINT,
    quoteTokenProgram: TOKEN_PROGRAM_ID,
  }).instruction();
  return [ix];
}

/**
 * Build, sign (house only), and send a single VersionedTransaction that sweeps the shared
 * house creator vault to the house wallet. Returns the transaction signature.
 */
export async function collectHouseFees(
  conn: Connection, wallet: Keypair, deps: CollectDeps = defaultDeps(),
): Promise<string> {
  const ixs = await buildCollectHouseFeesInstructions(conn, wallet.publicKey, deps);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 120_000 }),
      ...ixs,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([wallet]);
  const signature = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return signature;
}
