import { expect, test, vi } from "vitest";
import { Keypair, SystemProgram, TransactionInstruction } from "@solana/web3.js";
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
    connection: {
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 }),
      sendRawTransaction: vi.fn(async (b: Uint8Array) => { sent.push(b); return "SIG"; }),
      confirmTransaction: vi.fn().mockResolvedValue({}),
    },
    ...over,
  };
  return { deps, sent };
}

const item = { id: "a", name: "Acme", symbol: "ACME", description: "d", imagePath: __filename };
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
  expect(sent.length).toBe(1);
});

test("propagates a build error", async () => {
  const { deps } = mockDeps({ buildCreateAndBuy: vi.fn().mockRejectedValue(new Error("boom")) });
  await expect(launchOne(deps, Keypair.generate(), Keypair.generate(), item, opts)).rejects.toThrow(/boom/);
});
