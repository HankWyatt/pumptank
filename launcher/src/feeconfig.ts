import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";

export type Split = "house_100" | "split_80_20";
export interface FeeEntry {
  optedIn: boolean;
  payoutWallet: string | null;
  split: Split;
  changeUsed: boolean;
  changedAt: string | null;
}
export type FeeConfig = Record<string, FeeEntry>;

function entry(cfg: FeeConfig, id: string): FeeEntry {
  return cfg[id] ?? { optedIn: false, payoutWallet: null, split: "house_100", changeUsed: false, changedAt: null };
}

export function markOptin(cfg: FeeConfig, id: string, payoutWallet: string): FeeConfig {
  try { new PublicKey(payoutWallet); } catch { throw new Error(`invalid payout wallet: ${payoutWallet}`); }
  return { ...cfg, [id]: { ...entry(cfg, id), optedIn: true, payoutWallet } };
}

export function markRedirected(cfg: FeeConfig, id: string): FeeConfig {
  const e = entry(cfg, id);
  if (!e.optedIn || !e.payoutWallet) throw new Error(`cannot redirect ${id}: not opted in / no payout wallet`);
  if (e.changeUsed) throw new Error(`cannot redirect ${id}: one-time change already used (locked)`);
  return { ...cfg, [id]: { ...e, split: "split_80_20", changeUsed: true, changedAt: new Date().toISOString() } };
}

export function loadFeeConfig(path: string): FeeConfig {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as FeeConfig) : {};
}

export function saveFeeConfig(path: string, cfg: FeeConfig): void {
  const fd = openSync(path, "w");
  try { writeSync(fd, JSON.stringify(cfg, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
}
