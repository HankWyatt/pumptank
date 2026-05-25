import { expect, test, vi } from "vitest";
import { runBatch } from "../src/orchestrate.js";
import type { LaunchItem } from "../src/types.js";

const item = (id: string, symbol: string): LaunchItem =>
  ({ id, name: id, symbol, description: "d", imagePath: "/x.png" });

function fakeLedger() {
  const data: Record<string, any> = {};
  return {
    statusOf: (id: string) => data[id]?.status,
    get: (id: string) => data[id],
    record: (e: any) => { data[e.id] = e; },
    data,
  };
}
const mintstore = { getOrCreate: (id: string) => ({ publicKey: { toBase58: () => `MINT_${id}` } }) } as any;
const opts = { devBuySol: 1, slippageBps: 150, priorityFeeMicroLamports: 1, pacingMs: 0, maxTotalSpendSol: 10, maxRetriesPerToken: 2 };

test("launches each item once, writing attempting before success", async () => {
  const led = fakeLedger();
  const launchFn = vi.fn(async (_m: any, it: LaunchItem) => ({ mint: `MINT_${it.id}`, signature: "S" }));
  await runBatch([item("a", "A"), item("b", "B")], led as any, mintstore, launchFn, async () => false, opts);
  expect(led.statusOf("a")).toBe("success");
  expect(led.statusOf("b")).toBe("success");
  expect(launchFn).toHaveBeenCalledTimes(2);
});

test("skips already-successful items", async () => {
  const led = fakeLedger();
  led.record({ id: "a", mint: "MINT_a", status: "success", attempts: 1, ts: "t" });
  const launchFn = vi.fn(async () => ({ mint: "x", signature: "S" }));
  await runBatch([item("a", "A")], led as any, mintstore, launchFn, async () => false, opts);
  expect(launchFn).not.toHaveBeenCalled();
});

test("recovers an attempting item whose mint already exists (no relaunch)", async () => {
  const led = fakeLedger();
  led.record({ id: "a", mint: "MINT_a", status: "attempting", attempts: 1, ts: "t" });
  const launchFn = vi.fn(async () => ({ mint: "x", signature: "S" }));
  await runBatch([item("a", "A")], led as any, mintstore, launchFn, async () => true, opts);
  expect(launchFn).not.toHaveBeenCalled();
  expect(led.statusOf("a")).toBe("success");
});

test("a thrown launch records failed and continues", async () => {
  const led = fakeLedger();
  const launchFn = vi.fn()
    .mockRejectedValueOnce(new Error("boom"))
    .mockResolvedValue({ mint: "MINT_b", signature: "S" });
  await runBatch([item("a", "A"), item("b", "B")], led as any, mintstore, launchFn, async () => false,
    { ...opts, maxRetriesPerToken: 1 });
  expect(led.statusOf("a")).toBe("failed");
  expect(led.statusOf("b")).toBe("success");
});

test("aborts when cumulative spend would exceed the cap", async () => {
  const led = fakeLedger();
  const launchFn = vi.fn(async (_m: any, it: LaunchItem) => ({ mint: `MINT_${it.id}`, signature: "S" }));
  // devBuySol=1, cap=1 -> first item launches, second trips the cap and throws
  await expect(runBatch([item("a", "A"), item("b", "B")], led as any, mintstore, launchFn, async () => false,
    { ...opts, maxTotalSpendSol: 1 })).rejects.toThrow(/spend cap/i);
  expect(launchFn).toHaveBeenCalledTimes(1);
});
