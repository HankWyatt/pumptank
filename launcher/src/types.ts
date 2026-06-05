export interface LaunchItem {
  id: string;
  name: string;
  symbol: string;
  description: string;
  imagePath: string; // absolute path to the card PNG
  devBuy: boolean;   // true => create_v2 + 1.5% dev-buy; false => create_v2 only
}

export type LaunchStatus = "attempting" | "success" | "failed";

export interface LedgerEntry {
  id: string;
  mint: string;          // base58 pubkey (never a secret)
  signature?: string;
  status: LaunchStatus;
  error?: string;
  attempts: number;
  ts: string;
}

export interface Config {
  rpcUrl: string;
  devBuySol: number;
  devBuyTokens: bigint;   // token base units to buy per coin (1.5% of supply)
  slippageBps: number;
  priorityFeeMicroLamports: number;
  pacingMs: number;
  maxTotalSpendSol: number;
  maxRetriesPerToken: number;
  confirm: boolean;     // false => dry-run, never broadcast
  only?: string;
  limit?: number;
}
