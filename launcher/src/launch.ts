import {
  AddressLookupTableAccount, ComputeBudgetProgram, Keypair, PublicKey,
  TransactionInstruction, TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import type { LaunchItem } from "./types.js";

export interface LaunchOpts {
  devBuyTokens: bigint;   // token base units to buy (1.5% of supply)
  solCapLamports: bigint; // max SOL cost (cap)
  priorityFeeMicroLamports: number;
}

/** Args passed to the SDK's createV2AndBuyInstructions (SOL/native: no quoteMint). */
export interface CreateAndBuyArgs {
  global: unknown;
  mint: Keypair;
  name: string;
  symbol: string;
  uri: string;
  creator: PublicKey;
  user: PublicKey;
  amount: BN;
  solAmount: BN;
  mayhemMode: boolean;
}

/** Args passed to the SDK's createV2Instruction (create-only: no buy). */
export interface CreateArgs {
  global: unknown;
  mint: Keypair;
  name: string;
  symbol: string;
  uri: string;
  creator: PublicKey;
  user: PublicKey;
}

/** Injected dependencies so launchOne is unit-testable offline. */
export interface LaunchDeps {
  global: unknown;
  uploadMetadata(item: LaunchItem): Promise<string>;
  buildCreateAndBuy(args: CreateAndBuyArgs): Promise<TransactionInstruction[]>;
  /** create_v2-only builder (no dev-buy) — wraps the SDK's createV2Instruction. */
  buildCreate(args: CreateArgs): Promise<TransactionInstruction[]>;
  connection: {
    getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
    sendRawTransaction(raw: Uint8Array): Promise<string>;
    confirmTransaction(
      strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
      commitment: string,
    ): Promise<unknown>;
  };
  /** Optional reusable ALT so the create_v2+buy tx fits the 1232-byte legacy limit. */
  lookupTable?: AddressLookupTableAccount;
}

export async function launchOne(
  deps: LaunchDeps, wallet: Keypair, mint: Keypair, item: LaunchItem, opts: LaunchOpts,
): Promise<{ mint: string; signature: string }> {
  const uri = await deps.uploadMetadata(item);

  // Build the instruction list + pick a CU limit + ALT lookup tables per branch.
  let ixs: TransactionInstruction[];
  let computeUnitLimit: number;
  let lookupTables: AddressLookupTableAccount[];
  if (item.devBuy) {
    // create_v2 + 1.5% dev-buy (top-100): ~1250B, needs the reusable ALT to fit one legacy tx.
    ixs = await deps.buildCreateAndBuy({
      global: deps.global,
      mint,
      name: item.name,
      symbol: item.symbol,
      uri,
      creator: wallet.publicKey,
      user: wallet.publicKey,
      amount: new BN(opts.devBuyTokens.toString()),
      solAmount: new BN(opts.solCapLamports.toString()),
      mayhemMode: false,
    });
    computeUnitLimit = 300_000;
    lookupTables = deps.lookupTable ? [deps.lookupTable] : [];
  } else {
    // create_v2 only (no dev-buy): ~16 accounts, fits one legacy tx WITHOUT an ALT.
    ixs = await deps.buildCreate({
      global: deps.global,
      mint,
      name: item.name,
      symbol: item.symbol,
      uri,
      creator: wallet.publicKey,
      user: wallet.publicKey,
    });
    computeUnitLimit = 120_000; // create_v2 alone needs far less than the dev-buy path
    lookupTables = []; // NO ALT for create-only
  }

  const { blockhash, lastValidBlockHeight } = await deps.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: opts.priorityFeeMicroLamports }),
      ...ixs,
    ],
  }).compileToV0Message(lookupTables);
  const tx = new VersionedTransaction(message);
  tx.sign([wallet, mint]);
  const signature = await deps.connection.sendRawTransaction(tx.serialize());
  await deps.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { mint: mint.publicKey.toBase58(), signature };
}
