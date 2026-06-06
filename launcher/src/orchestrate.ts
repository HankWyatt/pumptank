import type { LaunchItem, LedgerEntry } from "./types.js";

export interface BatchOpts {
  devBuySol: number; slippageBps: number; priorityFeeMicroLamports: number;
  pacingMs: number; maxTotalSpendSol: number; maxRetriesPerToken: number;
  /** Create-only tributes launch in concurrent waves of this size; dev-buys stay
   *  sequential (cap-safe). Per pump.fun, keep ≤15/sec. Default 1 (fully sequential). */
  batchSize?: number;
  /** Per-coin progress sink (✓/✗ lines). Default no-op so tests stay quiet; the CLIs
   *  pass console.log. */
  log?: (line: string) => void;
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
): Promise<{ succeeded: number; failed: number; skipped: number; failedIds: string[] }> {
  let spent = 0, succeeded = 0, failed = 0, skipped = 0, done = 0;
  const failedIds: string[] = [];
  const total = items.length;
  const batchSize = Math.max(1, Math.trunc(opts.batchSize ?? 1));
  const log = opts.log ?? (() => {});

  // Launch ONE coin with write-ahead ledger + retry. Returns true on success, never
  // throws. Safe to run concurrently: Ledger.record is fully synchronous, so the
  // read-modify-write of the ledger file never interleaves across promises.
  const launchWithRetry = async (item: LaunchItem, mint: any, mintB58: string): Promise<boolean> => {
    let lastErr = "";
    for (let attempt = 1; attempt <= opts.maxRetriesPerToken; attempt++) {
      // write-ahead: record the intent + mint pubkey BEFORE broadcasting
      ledger.record({ id: item.id, mint: mintB58, status: "attempting", attempts: attempt, ts: now() });
      try {
        const { signature } = await launchFn(mint, item);
        ledger.record({ id: item.id, mint: mintB58, signature, status: "success", attempts: attempt, ts: now() });
        log(`[${++done}/${total}] ✓ $${item.symbol} (${item.id}) -> ${mintB58}`);
        return true;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        ledger.record({ id: item.id, mint: mintB58, status: "failed", error: lastErr, attempts: attempt, ts: now() });
        if (attempt < opts.maxRetriesPerToken) {
          log(`    ↻ retry $${item.symbol} (${item.id}) ${attempt + 1}/${opts.maxRetriesPerToken}: ${lastErr}`);
          await sleep(opts.pacingMs);
        }
      }
    }
    failedIds.push(item.id);
    log(`[${++done}/${total}] ✗ $${item.symbol} (${item.id}) FAILED: ${lastErr}`);
    return false;
  };

  // Create-only tributes accumulate here and launch concurrently in waves of batchSize.
  let wave: Array<{ item: LaunchItem; mint: any; mintB58: string }> = [];
  const flushWave = async (): Promise<void> => {
    if (wave.length === 0) return;
    const batch = wave; wave = [];
    const results = await Promise.all(batch.map((w) => launchWithRetry(w.item, w.mint, w.mintB58)));
    for (const ok of results) ok ? succeeded++ : failed++;
    await sleep(opts.pacingMs);
  };

  for (const item of items) {
    if (ledger.statusOf(item.id) === "success") { skipped++; continue; }

    // crash recovery: an attempting entry whose mint already landed -> recover
    if (ledger.statusOf(item.id) === "attempting") {
      const prev = ledger.get(item.id)!;
      if (await mintExists(prev.mint)) {
        ledger.record({ ...prev, status: "success", ts: now() });
        succeeded++; continue;
      }
    }
    const mint = mintstore.getOrCreate(item.id);
    const mintB58 = mint.publicKey.toBase58();

    if (item.devBuy) {
      // Dev-buys (only the index token) launch SEQUENTIALLY so the SOL spend cap stays
      // deterministic. Flush any pending create-only wave first to preserve ordering.
      await flushWave();
      if (spent + opts.devBuySol > opts.maxTotalSpendSol) {
        throw new Error(`spend cap reached: ${spent}+${opts.devBuySol} > ${opts.maxTotalSpendSol} SOL`);
      }
      if (await launchWithRetry(item, mint, mintB58)) { spent += opts.devBuySol; succeeded++; }
      else failed++;
      await sleep(opts.pacingMs);
    } else {
      // Create-only tributes cost ~rent only (no spend-cap interaction) -> launch in
      // concurrent waves of batchSize (pump.fun: up to ~15/sec).
      wave.push({ item, mint, mintB58 });
      if (wave.length >= batchSize) await flushWave();
    }
  }
  await flushWave();
  return { succeeded, failed, skipped, failedIds };
}
