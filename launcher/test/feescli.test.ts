import { beforeEach, expect, test, vi } from "vitest";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";

// The pump SDK's ESM bundle re-exports a named `BN` from the CJS `@coral-xyz/anchor`,
// which Vitest's loader can't resolve. The verbs under test use injected deps (FeesDeps),
// so stub the module to keep this suite offline and load-safe (mirrors test/cli.test.ts).
vi.mock("@pump-fun/pump-sdk", () => ({ OnlinePumpSdk: class {}, PumpSdk: class {} }));

import {
  main,
  previewCollect,
  shouldCollect,
  assertCanBroadcast,
  buildShareholders,
  type FeesDeps,
} from "../src/feescli.js";
import type { FeeConfig } from "../src/feeconfig.js";

const FOUNDER = "So11111111111111111111111111111111111111112";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const MAIN_TOKEN = "4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T";
const REFERRER = "9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9D";

// ---- pure helpers ----

test("previewCollect shows both fee buckets and the total", () => {
  const line = previewCollect(2_500_000_000n, 1_500_000_000n);
  expect(line).toMatch(/4\.0000 SOL/); // total of both buckets
  expect(line).toMatch(/creator-vault 2\.5000/);
  expect(line).toMatch(/coin-creator reward coins 1\.5000/);
});

test("assertCanBroadcast gates on --confirm", () => {
  expect(() => assertCanBroadcast(false)).toThrow(/confirm/i);
  expect(() => assertCanBroadcast(true)).not.toThrow();
});

test("shouldCollect respects the min threshold", () => {
  expect(shouldCollect(5_000_000n, 0.005)).toBe(true); // == threshold
  expect(shouldCollect(4_000_000n, 0.005)).toBe(false); // below
  expect(shouldCollect(1_000_000_000n, 0.005)).toBe(true);
});

test("buildShareholders with a referrer is founder 8000 / main-token 1000 / referrer 1000 (sum 10000)", () => {
  const founder = new PublicKey(FOUNDER);
  const mainToken = new PublicKey(MAIN_TOKEN);
  const referrer = new PublicKey(REFERRER);
  const sh = buildShareholders(founder, mainToken, referrer);
  expect(sh).toHaveLength(3);
  expect(sh[0].address.equals(founder)).toBe(true);
  expect(sh[0].shareBps).toBe(8000);
  expect(sh[1].address.equals(mainToken)).toBe(true);
  expect(sh[1].shareBps).toBe(1000);
  expect(sh[2].address.equals(referrer)).toBe(true);
  expect(sh[2].shareBps).toBe(1000);
  expect(sh.reduce((a, s) => a + s.shareBps, 0)).toBe(10000);
});

test("buildShareholders without a referrer is founder 8000 / main-token 2000 (sum 10000)", () => {
  const founder = new PublicKey(FOUNDER);
  const mainToken = new PublicKey(MAIN_TOKEN);
  const sh = buildShareholders(founder, mainToken, null);
  expect(sh).toHaveLength(2);
  expect(sh[0].address.equals(founder)).toBe(true);
  expect(sh[0].shareBps).toBe(8000);
  expect(sh[1].address.equals(mainToken)).toBe(true);
  expect(sh[1].shareBps).toBe(2000);
  expect(sh[0].shareBps + sh[1].shareBps).toBe(10000);
});

test("buildShareholders throws when shareholder addresses collide (referrer == main-token)", () => {
  const founder = new PublicKey(FOUNDER);
  const mainToken = new PublicKey(MAIN_TOKEN);
  expect(() => buildShareholders(founder, mainToken, mainToken)).toThrow(/duplicate|distinct/i);
});

test("buildShareholders throws when the founder collides with the main-token", () => {
  const mainToken = new PublicKey(MAIN_TOKEN);
  expect(() => buildShareholders(mainToken, mainToken, null)).toThrow(/duplicate|distinct/i);
});

// ---- verb tests via injected deps (no RPC, no real SDK) ----

const HOUSE = Keypair.generate();
let store: FeeConfig;
let logs: string[];
let deps: FeesDeps;

function makeDeps(over: Partial<FeesDeps> = {}): FeesDeps {
  return {
    loadFeeConfig: () => store,
    saveFeeConfig: (_p, cfg) => {
      store = cfg;
    },
    loadWallet: () => HOUSE,
    makeConnection: () => ({}) as any,
    getLedgerMint: (id) => (id === "a" ? MINT : undefined),
    getPumpSdk: () => {
      throw new Error("getPumpSdk should not be called");
    },
    getOnlineSdk: () => {
      throw new Error("getOnlineSdk should not be called");
    },
    getCreatorVaultClaimable: async () => 0n,
    collectHouseFees: async () => "collect-sig",
    getCoinCreatorClaimable: async () => 0n,
    collectCoinCreatorFees: async () => "coin-sig",
    sendTx: async () => "tx-sig",
    log: (m) => logs.push(m),
    ...over,
  };
}

beforeEach(() => {
  store = {};
  logs = [];
  deps = makeDeps();
});

test("status lists tracked entries (pure; no SDK/RPC)", async () => {
  store = { a: { optedIn: true, founderWallet: FOUNDER, referrerWallet: null, mint: MINT, pool: null, split: "split_80_20", changeUsed: true, changedAt: "t" } };
  const noSdk = makeDeps({
    loadWallet: () => {
      throw new Error("status must not load wallet");
    },
  });
  await main(["status"], {}, noSdk);
  expect(logs.join("\n")).toMatch(/a: optedIn=true split=split_80_20 changeUsed=true mint=/);
});

test("optin looks up the mint from the ledger and records the founder", async () => {
  await main(["optin", "a", FOUNDER], {}, deps);
  expect(store.a.optedIn).toBe(true);
  expect(store.a.founderWallet).toBe(FOUNDER);
  expect(store.a.mint).toBe(MINT);
  expect(store.a.split).toBe("house_100");
});

test("optin errors when the coin is not in the launch ledger", async () => {
  await expect(main(["optin", "zzz", FOUNDER], {}, deps)).rejects.toThrow(/ledger|launched/i);
});

test("set-shares without a referrer builds updateFeeSharesV2 with [founder 8000, main-token 2000]", async () => {
  store = markOptinLocal();
  const createFeeSharingConfig = vi.fn().mockResolvedValue(ix());
  const updateFeeSharesV2 = vi.fn().mockResolvedValue(ix());
  const sendTx = vi.fn().mockResolvedValue("set-sig");
  const d = makeDeps({ getPumpSdk: () => ({ createFeeSharingConfig, updateFeeSharesV2 }), sendTx });

  await main(["set-shares", "a", "--confirm"], { MAIN_TOKEN_WALLET: MAIN_TOKEN }, d);

  // createFeeSharingConfig: creator=house, mint, pool=null
  const cfgArg = createFeeSharingConfig.mock.calls[0][0];
  expect(cfgArg.creator.equals(HOUSE.publicKey)).toBe(true);
  expect(cfgArg.mint.equals(new PublicKey(MINT))).toBe(true);
  expect(cfgArg.pool).toBeNull();

  // updateFeeSharesV2: share math + SOL quote
  const upArg = updateFeeSharesV2.mock.calls[0][0];
  expect(upArg.authority.equals(HOUSE.publicKey)).toBe(true);
  expect(upArg.currentShareholders).toHaveLength(1);
  expect(upArg.currentShareholders[0].equals(HOUSE.publicKey)).toBe(true);
  expect(upArg.newShareholders).toHaveLength(2);
  expect(upArg.newShareholders[0].shareBps).toBe(8000);
  expect(upArg.newShareholders[0].address.equals(new PublicKey(FOUNDER))).toBe(true);
  expect(upArg.newShareholders[1].shareBps).toBe(2000);
  expect(upArg.newShareholders[1].address.equals(new PublicKey(MAIN_TOKEN))).toBe(true);
  expect(upArg.newShareholders.reduce((a: number, s: { shareBps: number }) => a + s.shareBps, 0)).toBe(10000);
  expect(upArg.quoteMint.equals(NATIVE_MINT)).toBe(true);
  expect(upArg.quoteTokenProgram.equals(TOKEN_PROGRAM_ID)).toBe(true);

  // both instructions sent in one tx, state locked + sigs recorded
  expect(sendTx.mock.calls[0][2]).toHaveLength(2);
  expect(store.a.split).toBe("split_80_20");
  expect(store.a.changeUsed).toBe(true);
  expect(store.a.setSharesSig).toBe("set-sig");
});

test("set-shares with a referrer builds updateFeeSharesV2 with [founder 8000, main-token 1000, referrer 1000]", async () => {
  store = markOptinLocal(REFERRER);
  const updateFeeSharesV2 = vi.fn().mockResolvedValue(ix());
  const d = makeDeps({
    getPumpSdk: () => ({ createFeeSharingConfig: vi.fn().mockResolvedValue(ix()), updateFeeSharesV2 }),
    sendTx: vi.fn().mockResolvedValue("set-sig"),
  });

  await main(["set-shares", "a", "--confirm"], { MAIN_TOKEN_WALLET: MAIN_TOKEN }, d);

  const sh = updateFeeSharesV2.mock.calls[0][0].newShareholders;
  expect(sh).toHaveLength(3);
  expect(sh[0].address.equals(new PublicKey(FOUNDER))).toBe(true);
  expect(sh[0].shareBps).toBe(8000);
  expect(sh[1].address.equals(new PublicKey(MAIN_TOKEN))).toBe(true);
  expect(sh[1].shareBps).toBe(1000);
  expect(sh[2].address.equals(new PublicKey(REFERRER))).toBe(true);
  expect(sh[2].shareBps).toBe(1000);
  expect(sh.reduce((a: number, s: { shareBps: number }) => a + s.shareBps, 0)).toBe(10000);
});

test("set-shares throws when MAIN_TOKEN_WALLET env is missing", async () => {
  store = markOptinLocal();
  await expect(main(["set-shares", "a", "--confirm"], {}, deps)).rejects.toThrow(/MAIN_TOKEN_WALLET/);
});

test("set-shares dry-run builds but does not broadcast or mutate state", async () => {
  store = markOptinLocal();
  const sendTx = vi.fn();
  const d = makeDeps({
    getPumpSdk: () => ({ createFeeSharingConfig: vi.fn().mockResolvedValue(ix()), updateFeeSharesV2: vi.fn().mockResolvedValue(ix()) }),
    sendTx,
  });
  await main(["set-shares", "a"], { MAIN_TOKEN_WALLET: MAIN_TOKEN }, d);
  expect(sendTx).not.toHaveBeenCalled();
  expect(store.a.changeUsed).toBe(false);
  expect(logs.join("\n")).toMatch(/dry run/i);
});

test("set-shares refuses a coin that already changed (one-time lock)", async () => {
  store = { a: { ...markOptinLocal().a, split: "split_80_20", changeUsed: true, changedAt: "t" } };
  const d = makeDeps({
    getPumpSdk: () => {
      throw new Error("must not build instructions when locked");
    },
  });
  await expect(main(["set-shares", "a"], { MAIN_TOKEN_WALLET: MAIN_TOKEN }, d)).rejects.toThrow(/locked|used|already/i);
});

test("set-shares refuses an un-opted coin", async () => {
  await expect(main(["set-shares", "a"], { MAIN_TOKEN_WALLET: MAIN_TOKEN }, deps)).rejects.toThrow(/opt/i);
});

test("distribute wires buildDistributeCreatorFeesInstructions and records the sig", async () => {
  store = { a: { ...markOptinLocal().a, split: "split_80_20", changeUsed: true, changedAt: "t" } };
  const dist = vi.fn().mockResolvedValue({ instructions: [ix(), ix()], isGraduated: false });
  const sendTx = vi.fn().mockResolvedValue("dist-sig");
  const d = makeDeps({ getOnlineSdk: () => ({ buildDistributeCreatorFeesInstructions: dist }), sendTx });

  await main(["distribute", "a", "--confirm"], {}, d);
  expect(dist.mock.calls[0][0].equals(new PublicKey(MINT))).toBe(true);
  expect(sendTx.mock.calls[0][2]).toHaveLength(2);
  expect(store.a.distributeSig).toBe("dist-sig");
});

test("distribute refuses a coin that hasn't had shares set", async () => {
  store = markOptinLocal(); // opted-in but still house_100
  const d = makeDeps({
    getOnlineSdk: () => {
      throw new Error("must not build distribute for an unshared coin");
    },
  });
  await expect(main(["distribute", "a"], {}, d)).rejects.toThrow(/set-shares|shares/i);
});

test("collect previews only and stays a dry-run without --confirm", async () => {
  const collectHouseFees = vi.fn();
  const d = makeDeps({ getCreatorVaultClaimable: async () => 1_000_000_000n, collectHouseFees });
  await main(["collect"], { MIN_COLLECT_SOL: "0.005" }, d);
  expect(collectHouseFees).not.toHaveBeenCalled();
  expect(logs.join("\n")).toMatch(/dry run/i);
});

test("collect says nothing-to-collect below the threshold", async () => {
  const collectHouseFees = vi.fn();
  const d = makeDeps({ getCreatorVaultClaimable: async () => 1_000n, collectHouseFees });
  await main(["collect", "--confirm"], { MIN_COLLECT_SOL: "0.005" }, d);
  expect(collectHouseFees).not.toHaveBeenCalled();
  expect(logs.join("\n")).toMatch(/nothing to collect/i);
});

test("collect --confirm sweeps the coin-creator reward-coin bucket even when the vault is empty", async () => {
  const collectHouseFees = vi.fn();
  const collectCoinCreatorFees = vi.fn().mockResolvedValue("coin-sig");
  const d = makeDeps({
    getCreatorVaultClaimable: async () => 0n,             // vault below threshold
    getCoinCreatorClaimable: async () => 17_000_000_000n, // 17 SOL in reward coins
    collectHouseFees, collectCoinCreatorFees,
  });
  await main(["collect", "--confirm"], { MIN_COLLECT_SOL: "0.005" }, d);
  expect(collectHouseFees).not.toHaveBeenCalled();
  expect(collectCoinCreatorFees).toHaveBeenCalledOnce();
});

test("collect --confirm claims BOTH buckets when both are above threshold", async () => {
  const collectHouseFees = vi.fn().mockResolvedValue("v");
  const collectCoinCreatorFees = vi.fn().mockResolvedValue("c");
  const d = makeDeps({
    getCreatorVaultClaimable: async () => 1_000_000_000n,
    getCoinCreatorClaimable: async () => 17_000_000_000n,
    collectHouseFees, collectCoinCreatorFees,
  });
  await main(["collect", "--confirm"], { MIN_COLLECT_SOL: "0.005" }, d);
  expect(collectHouseFees).toHaveBeenCalledOnce();
  expect(collectCoinCreatorFees).toHaveBeenCalledOnce();
});

test("collect --confirm above threshold sweeps the house vault", async () => {
  const collectHouseFees = vi.fn().mockResolvedValue("collected-sig");
  const d = makeDeps({ getCreatorVaultClaimable: async () => 1_000_000_000n, collectHouseFees });
  await main(["collect", "--confirm"], { MIN_COLLECT_SOL: "0.005" }, d);
  expect(collectHouseFees).toHaveBeenCalledOnce();
  expect(logs.join("\n")).toMatch(/collected-sig/);
});

// ---- helpers ----
function ix(): TransactionInstruction {
  return new TransactionInstruction({ keys: [], programId: new PublicKey(MINT), data: Buffer.from([1]) });
}
function markOptinLocal(referrerWallet: string | null = null): FeeConfig {
  return {
    a: {
      optedIn: true,
      founderWallet: FOUNDER,
      referrerWallet,
      mint: MINT,
      pool: null,
      split: "house_100",
      changeUsed: false,
      changedAt: null,
    },
  };
}
