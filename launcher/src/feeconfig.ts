import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";

export type Split = "house_100" | "split_80_20";

export interface FeeEntry {
  optedIn: boolean;
  founderWallet: string | null;
  referrerWallet: string | null;
  mint: string | null;
  pool: string | null;
  split: Split;
  changeUsed: boolean;
  changedAt: string | null;
  sharingConfigSig?: string;
  setSharesSig?: string;
  distributeSig?: string;
}
export type FeeConfig = Record<string, FeeEntry>;

/** The on-chain proof signatures recorded when a coin is moved to the 80/20 split. */
export interface ShareSigs {
  sharingConfigSig: string;
  setSharesSig: string;
}

function entry(cfg: FeeConfig, id: string): FeeEntry {
  return (
    cfg[id] ?? {
      optedIn: false,
      founderWallet: null,
      referrerWallet: null,
      mint: null,
      pool: null,
      split: "house_100",
      changeUsed: false,
      changedAt: null,
    }
  );
}

/**
 * Record a founder opt-in: validate the founder wallet (and referrer wallet, if given),
 * store them + the coin's mint. Referrer is null when omitted. Still 100% house.
 */
export function markOptin(
  cfg: FeeConfig,
  id: string,
  founderWallet: string,
  mint: string,
  referrerWallet?: string,
): FeeConfig {
  try {
    new PublicKey(founderWallet);
  } catch {
    throw new Error(`invalid founder wallet: ${founderWallet}`);
  }
  if (referrerWallet != null) {
    try {
      new PublicKey(referrerWallet);
    } catch {
      throw new Error(`invalid referrer wallet: ${referrerWallet}`);
    }
  }
  return {
    ...cfg,
    [id]: { ...entry(cfg, id), optedIn: true, founderWallet, referrerWallet: referrerWallet ?? null, mint },
  };
}

/**
 * Mark a coin moved to the on-chain 80/20 split and lock it (one-time guard).
 * Records the proof sigs from `createFeeSharingConfig` + `updateFeeSharesV2`.
 * Throws if the coin is not opted-in (no founder wallet) or already changed (locked).
 */
export function markShared(cfg: FeeConfig, id: string, sigs: ShareSigs): FeeConfig {
  const e = entry(cfg, id);
  if (!e.optedIn || !e.founderWallet) throw new Error(`cannot set shares for ${id}: not opted in / no founder wallet`);
  if (e.changeUsed) throw new Error(`cannot set shares for ${id}: one-time change already used (locked)`);
  return {
    ...cfg,
    [id]: {
      ...e,
      split: "split_80_20",
      changeUsed: true,
      changedAt: new Date().toISOString(),
      sharingConfigSig: sigs.sharingConfigSig,
      setSharesSig: sigs.setSharesSig,
    },
  };
}

/** Record a successful distribute payout for a coin. */
export function markDistributed(cfg: FeeConfig, id: string, distributeSig: string): FeeConfig {
  return { ...cfg, [id]: { ...entry(cfg, id), distributeSig } };
}

export function loadFeeConfig(path: string): FeeConfig {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as FeeConfig) : {};
}

export function saveFeeConfig(path: string, cfg: FeeConfig): void {
  const fd = openSync(path, "w");
  try {
    writeSync(fd, JSON.stringify(cfg, null, 2));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
