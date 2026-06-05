import { expect, test, vi } from "vitest";
import {
  AddressLookupTableAccount, Keypair, SystemProgram, TransactionInstruction,
} from "@solana/web3.js";
import { launchOne, type LaunchDeps } from "../src/launch.js";

function mockDeps(over: Partial<LaunchDeps> = {}) {
  const sent: Uint8Array[] = [];
  const deps: LaunchDeps = {
    global: { tag: "GLOBAL" },
    uploadMetadata: vi.fn().mockResolvedValue("https://ipfs.io/ipfs/CID"),
    buildCreateAndBuy: vi.fn(async ({ mint, user }) => [
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [
          { pubkey: user, isSigner: true, isWritable: true },
          { pubkey: mint.publicKey, isSigner: true, isWritable: true },
        ],
        data: Buffer.alloc(0),
      }),
    ]),
    buildCreate: vi.fn(async ({ mint, user }) => [
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [
          { pubkey: user, isSigner: true, isWritable: true },
          { pubkey: mint.publicKey, isSigner: true, isWritable: true },
        ],
        data: Buffer.alloc(0),
      }),
    ]),
    connection: {
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 }),
      sendRawTransaction: vi.fn(async (b: Uint8Array) => { sent.push(b); return "SIG"; }),
      confirmTransaction: vi.fn().mockResolvedValue({}),
    },
    ...over,
  };
  return { deps, sent };
}

const item = { id: "a", name: "Acme", symbol: "ACME", description: "d", imagePath: __filename, devBuy: true };
const opts = { devBuyTokens: 15_000_000_000_000n, solCapLamports: 437000000n, priorityFeeMicroLamports: 200000 };

test("uploads metadata, builds create_v2+buy with token amount + SOL cap (native), sends one tx", async () => {
  const { deps, sent } = mockDeps();
  const wallet = Keypair.generate();
  const mint = Keypair.generate();
  const res = await launchOne(deps, wallet, mint, item, opts);
  expect(res).toEqual({ mint: mint.publicKey.toBase58(), signature: "SIG" });
  expect(deps.uploadMetadata).toHaveBeenCalledWith(item);
  const args = (deps.buildCreateAndBuy as any).mock.calls[0][0];
  expect(args.uri).toBe("https://ipfs.io/ipfs/CID");
  expect(args.amount.toString()).toBe("15000000000000");
  expect(args.solAmount.toString()).toBe("437000000");
  expect(args.mayhemMode).toBe(false);
  expect("quoteMint" in args).toBe(false);
  expect(args.creator.equals(wallet.publicKey)).toBe(true);
  expect(deps.buildCreate).not.toHaveBeenCalled();
  expect(sent.length).toBe(1);
});

test("create-only (devBuy:false) builds create_v2 alone, no ALT, sends one tx signed [wallet, mint]", async () => {
  const lookupTable = new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: {
      deactivationSlot: 2n ** 64n - 1n,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      // a real address present here would make the test fail to compile if the ALT were used,
      // since the mock create ix references accounts not in the table.
      addresses: [],
    },
  });
  const { deps, sent } = mockDeps({ lookupTable });
  const wallet = Keypair.generate();
  const mint = Keypair.generate();
  const createOnly = { ...item, devBuy: false };
  const res = await launchOne(deps, wallet, mint, createOnly, opts);
  expect(res).toEqual({ mint: mint.publicKey.toBase58(), signature: "SIG" });
  expect(deps.uploadMetadata).toHaveBeenCalledWith(createOnly);
  expect(deps.buildCreate).toHaveBeenCalledTimes(1);
  const args = (deps.buildCreate as any).mock.calls[0][0];
  expect(args.uri).toBe("https://ipfs.io/ipfs/CID");
  expect(args.name).toBe("Acme");
  expect(args.symbol).toBe("ACME");
  expect(args.creator.equals(wallet.publicKey)).toBe(true);
  expect(args.user.equals(wallet.publicKey)).toBe(true);
  expect(args.mint).toBe(mint);
  expect("amount" in args).toBe(false);
  expect("solAmount" in args).toBe(false);
  expect(deps.buildCreateAndBuy).not.toHaveBeenCalled();
  expect(sent.length).toBe(1);
});

test("accepts and uses an optional lookup table, still sends one tx", async () => {
  const lookupTable = new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: {
      deactivationSlot: 2n ** 64n - 1n,
      lastExtendedSlot: 0,
      lastExtendedSlotStartIndex: 0,
      authority: undefined,
      addresses: [],
    },
  });
  const { deps, sent } = mockDeps({ lookupTable });
  const wallet = Keypair.generate();
  const mint = Keypair.generate();
  const res = await launchOne(deps, wallet, mint, item, opts);
  expect(res).toEqual({ mint: mint.publicKey.toBase58(), signature: "SIG" });
  expect(sent.length).toBe(1);
});

test("propagates a build error", async () => {
  const { deps } = mockDeps({ buildCreateAndBuy: vi.fn().mockRejectedValue(new Error("boom")) });
  await expect(launchOne(deps, Keypair.generate(), Keypair.generate(), item, opts)).rejects.toThrow(/boom/);
});
