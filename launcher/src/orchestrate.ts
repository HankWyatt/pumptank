import type { LaunchItem, LedgerEntry } from "./types.js";

export interface BatchOpts {
  devBuySol: number; slippageBps: number; priorityFeeMicroLamports: number;
  pacingMs: number; maxTotalSpendSol: number; maxRetriesPerToken: number;
}
interface LedgerLike {
  statusOf(id: string): string | undefined;
  get(id: string): LedgerEntry | undefined;
  record(e: LedgerEntry): void;
}
type LaunchFn = (mint: any, item: LaunchItem) => Promise<{ mint: string; signature: string }>;
type MintExistsFn = (mintBase58: string) => Promise<boolean>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

export async function runBatch(
  items: LaunchItem[], ledger: LedgerLike, mintstore: { getOrCreate(id: string): any },
  launchFn: LaunchFn, mintExists: MintExistsFn, opts: BatchOpts,
): Promise<{ succeeded: number; failed: number; skipped: number }> {
  let spent = 0, succeeded = 0, failed = 0, skipped = 0;
  for (const item of items) {
    if (ledger.statusOf(item.id) === "success") { skipped++; continue; }
    const mint = mintstore.getOrCreate(item.id);
    const mintB58 = mint.publicKey.toBase58();

    // crash recovery: an attempting entry whose mint already landed -> recover
    if (ledger.statusOf(item.id) === "attempting") {
      const prev = ledger.get(item.id)!;
      if (await mintExists(prev.mint)) {
        ledger.record({ ...prev, status: "success", ts: now() });
        succeeded++; continue;
      }
    }
    // Only dev-buy coins draw down the SOL spend cap. Create-only coins cost ~rent
    // (covered by the funding buffer), so they don't count against it.
    if (item.devBuy && spent + opts.devBuySol > opts.maxTotalSpendSol) {
      throw new Error(`spend cap reached: ${spent}+${opts.devBuySol} > ${opts.maxTotalSpendSol} SOL`);
    }

    let launched = false, lastErr = "";
    for (let attempt = 1; attempt <= opts.maxRetriesPerToken; attempt++) {
      // write-ahead: record the intent + mint pubkey BEFORE broadcasting
      ledger.record({ id: item.id, mint: mintB58, status: "attempting", attempts: attempt, ts: now() });
      try {
        const { signature } = await launchFn(mint, item);
        ledger.record({ id: item.id, mint: mintB58, signature, status: "success", attempts: attempt, ts: now() });
        if (item.devBuy) spent += opts.devBuySol; // only dev-buys consume the cap
        succeeded++; launched = true;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        ledger.record({ id: item.id, mint: mintB58, status: "failed", error: lastErr, attempts: attempt, ts: now() });
        if (attempt < opts.maxRetriesPerToken) await sleep(opts.pacingMs);
      }
    }
    if (!launched) failed++;
    await sleep(opts.pacingMs);
  }
  return { succeeded, failed, skipped };
}
