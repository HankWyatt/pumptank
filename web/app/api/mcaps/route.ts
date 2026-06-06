// GET /api/mcaps?mints=<mint1>,<mint2>,...  ->  { marketCaps: { <mint>: number|null } }
//
// Server-side so there's no CORS/key exposure and we can cache. Source = pump.fun's
// own API, which reports usd_market_cap for EVERY pump token immediately — including
// brand-new ones still on the bonding curve (complete:false). DexScreener was tried
// first but doesn't index freshly-launched low-volume tokens, so most returned null.
// pump.fun's endpoint is per-mint, so we fan out with a small concurrency cap + cache.
import { NextRequest } from "next/server";
import { fetchPumpMarketCap } from "@/lib/pumpfun";

export const dynamic = "force-dynamic"; // never statically optimize this route
export const runtime = "nodejs";

const TTL_MS = 45_000; // serve cached mcaps for 45s; curve caps move but not every ms
const CONCURRENCY = 4; // pump.fun 429s above ~conc 4; retries in fetchPumpMarketCap cover stragglers
const cache = new Map<string, { mc: number | null; at: number }>();

async function fetchBatch(mints: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (let i = 0; i < mints.length; i += CONCURRENCY) {
    const slice = mints.slice(i, i + CONCURRENCY);
    const vals = await Promise.all(slice.map(fetchPumpMarketCap));
    slice.forEach((m, k) => (out[m] = vals[k]));
  }
  return out;
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("mints") ?? "";
  const mints = [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 200);
  const now = Date.now();
  const result: Record<string, number | null> = {};
  const stale: string[] = [];
  for (const m of mints) {
    const c = cache.get(m);
    if (c && now - c.at < TTL_MS) result[m] = c.mc;
    else stale.push(m);
  }
  if (stale.length) {
    const fresh = await fetchBatch(stale);
    const t = Date.now();
    for (const m of stale) {
      const mc = fresh[m] ?? null;
      cache.set(m, { mc, at: t });
      result[m] = mc;
    }
  }
  return Response.json(
    { marketCaps: result },
    { headers: { "Cache-Control": "public, max-age=30" } }
  );
}
