import { expect, test, vi } from "vitest";
import { runBatch } from "../src/orchestrate.js";
import type { LaunchItem } from "../src/types.js";

const item = (id: string, symbol: string, devBuy = true): LaunchItem =>
  ({ id, name: id, symbol, description: "d", imagePath: "/x.png", devBuy });

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

test("spend cap only counts dev-buy items; create-only items don't consume it", async () => {
  const led = fakeLedger();
  const launchFn = vi.fn(async (_m: any, it: LaunchItem) => ({ mint: `MINT_${it.id}`, signature: "S" }));
  // cap=1, devBuySol=1: two create-only coins surround one dev-buy -> all three launch
  // (only the single dev-buy counts toward the cap, exactly hitting it).
  await runBatch(
    [item("a", "A", false), item("b", "B", true), item("c", "C", false)],
    led as any, mintstore, launchFn, async () => false,
    { ...opts, maxTotalSpendSol: 1 },
  );
  expect(led.statusOf("a")).toBe("success");
  expect(led.statusOf("b")).toBe("success");
  expect(led.statusOf("c")).toBe("success");
  expect(launchFn).toHaveBeenCalledTimes(3);
});

test("trips the cap on the second dev-buy, create-only items between are free", async () => {
  const led = fakeLedger();
  const launchFn = vi.fn(async (_m: any, it: LaunchItem) => ({ mint: `MINT_${it.id}`, signature: "S" }));
  // cap=1: first dev-buy launches (spent=1), create-only is free, second dev-buy trips the cap.
  await expect(runBatch(
    [item("a", "A", true), item("b", "B", false), item("c", "C", true)],
    led as any, mintstore, launchFn, async () => false,
    { ...opts, maxTotalSpendSol: 1 },
  )).rejects.toThrow(/spend cap/i);
  expect(led.statusOf("a")).toBe("success");
  expect(led.statusOf("b")).toBe("success");
  expect(launchFn).toHaveBeenCalledTimes(2);
});

// A launchFn that tracks peak concurrency, so we can assert wave behavior.
function trackingLaunchFn() {
  let inFlight = 0, peak = 0;
  const fn = vi.fn(async (_m: any, it: LaunchItem) => {
    inFlight++; peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return { mint: `MINT_${it.id}`, signature: "S" };
  });
  return { fn, peak: () => peak };
}

test("create-only tributes launch concurrently in waves of batchSize", async () => {
  const led = fakeLedger();
  const { fn, peak } = trackingLaunchFn();
  const items = ["a", "b", "c", "d", "e"].map((id) => item(id, id.toUpperCase(), false));
  await runBatch(items, led as any, mintstore, fn, async () => false, { ...opts, batchSize: 2 });
  expect(fn).toHaveBeenCalledTimes(5);
  expect(peak()).toBe(2); // never more than batchSize in flight at once
  expect(items.every((it) => led.statusOf(it.id) === "success")).toBe(true);
});

test("dev-buys stay sequential even when batchSize > 1", async () => {
  const led = fakeLedger();
  const { fn, peak } = trackingLaunchFn();
  await runBatch(
    [item("a", "A", true), item("b", "B", true), item("c", "C", true)],
    led as any, mintstore, fn, async () => false, { ...opts, batchSize: 5 },
  );
  expect(peak()).toBe(1); // dev-buys never overlap (cap-safe), regardless of batchSize
  expect(["a", "b", "c"].every((id) => led.statusOf(id) === "success")).toBe(true);
});

test("a failed coin inside a concurrent wave doesn't sink its siblings", async () => {
  const led = fakeLedger();
  const launchFn = vi.fn(async (_m: any, it: LaunchItem) => {
    if (it.id === "b") throw new Error("boom");
    return { mint: `MINT_${it.id}`, signature: "S" };
  });
  const res = await runBatch(
    [item("a", "A", false), item("b", "B", false), item("c", "C", false)],
    led as any, mintstore, launchFn, async () => false, { ...opts, batchSize: 3, maxRetriesPerToken: 1 },
  );
  expect(led.statusOf("a")).toBe("success");
  expect(led.statusOf("b")).toBe("failed");
  expect(led.statusOf("c")).toBe("success");
  expect(res).toMatchObject({ succeeded: 2, failed: 1 });
});

test("logs a per-coin line and returns failedIds for retry", async () => {
  const led = fakeLedger();
  const lines: string[] = [];
  const launchFn = vi.fn(async (_m: any, it: LaunchItem) => {
    if (it.id === "b") throw new Error("boom");
    return { mint: `MINT_${it.id}`, signature: "S" };
  });
  const res = await runBatch(
    [item("a", "A", false), item("b", "B", false)],
    led as any, mintstore, launchFn, async () => false,
    { ...opts, batchSize: 2, maxRetriesPerToken: 1, log: (s) => lines.push(s) },
  );
  expect(res.failedIds).toEqual(["b"]);
  expect(lines.some((l) => l.includes("✓ $A"))).toBe(true);
  expect(lines.some((l) => l.includes("✗ $B") && l.includes("boom"))).toBe(true);
});
