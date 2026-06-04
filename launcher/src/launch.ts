import {
  ComputeBudgetProgram, Keypair, PublicKey, TransactionInstruction,
  TransactionMessage, VersionedTransaction,
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

/** Injected dependencies so launchOne is unit-testable offline. */
export interface LaunchDeps {
  global: unknown;
  uploadMetadata(item: LaunchItem): Promise<string>;
  buildCreateAndBuy(args: CreateAndBuyArgs): Promise<TransactionInstruction[]>;
  connection: {
    getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
    sendRawTransaction(raw: Uint8Array): Promise<string>;
    confirmTransaction(
      strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
      commitment: string,
    ): Promise<unknown>;
  };
}

export async function launchOne(
  deps: LaunchDeps, wallet: Keypair, mint: Keypair, item: LaunchItem, opts: LaunchOpts,
): Promise<{ mint: string; signature: string }> {
  const uri = await deps.uploadMetadata(item);
  const ixs = await deps.buildCreateAndBuy({
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
  const { blockhash, lastValidBlockHeight } = await deps.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: opts.priorityFeeMicroLamports }),
      ...ixs,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([wallet, mint]);
  const signature = await deps.connection.sendRawTransaction(tx.serialize());
  await deps.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { mint: mint.publicKey.toBase58(), signature };
}
