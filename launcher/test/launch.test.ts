import { expect, test, vi } from "vitest";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { launchOne, devBuyLamports } from "../src/launch.js";

test("devBuyLamports returns a bigint", () => {
  const v = devBuyLamports(0.4306);
  expect(typeof v).toBe("bigint");
  expect(v).toBe(BigInt(Math.round(0.4306 * LAMPORTS_PER_SOL)));
});

test("launchOne calls createAndBuy with bigint amount + pinned slippage and returns mint+sig", async () => {
  const createAndBuy = vi.fn().mockResolvedValue({ success: true, signature: "SIG" });
  const sdk = { trade: { createAndBuy } } as any;
  const wallet = Keypair.generate();
  const mint = Keypair.generate();
  const item = { id: "a", name: "Acme", symbol: "ACME", description: "d", imagePath: __filename };
  const res = await launchOne(sdk, wallet, mint, item, { devBuySol: 0.4306, slippageBps: 150, priorityFeeMicroLamports: 200000 });
  expect(res).toEqual({ mint: mint.publicKey.toBase58(), signature: "SIG" });
  const args = createAndBuy.mock.calls[0];
  expect(typeof args[3]).toBe("bigint");          // buyAmountSol
  expect(args[4]).toBe(150n);                       // slippageBps as bigint
});

test("launchOne throws when the SDK reports failure", async () => {
  const sdk = { trade: { createAndBuy: vi.fn().mockResolvedValue({ success: false, error: "boom" }) } } as any;
  await expect(launchOne(sdk, Keypair.generate(), Keypair.generate(),
    { id: "a", name: "A", symbol: "A", description: "d", imagePath: __filename },
    { devBuySol: 0.4306, slippageBps: 150, priorityFeeMicroLamports: 200000 },
  )).rejects.toThrow(/boom/);
});
