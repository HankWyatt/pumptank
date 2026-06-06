// GET /api/mcaps/all -> { ready: boolean, marketCaps: { <mint>: number|null } }
//
// Whole-archive market caps so the grid can SORT by market cap (pump.fun has no batch
// endpoint -> ~1,481 per-mint fetches, ~60s at the safe conc-4 rate). The fill runs in a
// MODULE-LEVEL background loop, NOT a per-request fire-and-forget promise: Next 14 drops
// dangling promises after the response returns, which would leave the job half-done
// forever. The loop is started at module load (outside any request context) and only
// actually refreshes while there's recent demand, so it doesn't hammer pump.fun when idle.
import { getAllProducts } from "@/lib/products";
import { fetchPumpMarketCap } from "@/lib/pumpfun";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FRESH_MS = 120_000;        // cached map is "fresh" for 2 min
const DEMAND_WINDOW_MS = 300_000; // keep refreshing up to 5 min after the last request
const TICK_MS = 3_000;            // loop cadence
const CONCURRENCY = 4;            // pump.fun 429s above ~conc 4 (measured)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Two plain vars (not an object union) so there's no cross-closure narrowing headache.
let cacheMap: Record<string, number | null> | null = null;
let cacheAt = 0;
let lastRequested = 0;
let warming = false;

async function doRefresh(): Promise<void> {
  warming = true;
  try {
    const mints = getAllProducts()
      .map((p) => p.mint)
      .filter((m): m is string => !!m);
    const map: Record<string, number | null> = {};
    for (let i = 0; i < mints.length; i += CONCURRENCY) {
      const slice = mints.slice(i, i + CONCURRENCY);
      const vals = await Promise.all(slice.map((m) => fetchPumpMarketCap(m)));
      slice.forEach((m, k) => (map[m] = vals[k]));
    }
    cacheMap = map;
    cacheAt = Date.now();
  } finally {
    warming = false;
  }
}

// Module-level self-scheduling loop — survives across requests (a global timer, not a
// request-scoped promise). Refreshes only when there's been a recent /api/mcaps/all hit.
void (async () => {
  for (;;) {
    try {
      const recentDemand = Date.now() - lastRequested < DEMAND_WINDOW_MS;
      const stale = !cacheMap || Date.now() - cacheAt >= FRESH_MS;
      if (recentDemand && stale && !warming) await doRefresh();
    } catch {
      /* keep the loop alive no matter what */
    }
    await sleep(TICK_MS);
  }
})();

export async function GET() {
  lastRequested = Date.now(); // signal demand; the background loop fills within a tick
  if (cacheMap) {
    return Response.json(
      { ready: true, marketCaps: cacheMap },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }
  return Response.json(
    { ready: false, marketCaps: {} },
    { headers: { "Cache-Control": "no-store" } }
  );
}
