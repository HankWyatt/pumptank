// GET /api/mcaps?mints=<mint1>,<mint2>,...  ->  { marketCaps: { <mint>: number|null } }
//
// Server-side so there's no CORS/key exposure and we can cache. Source = DexScreener
// (free, batches up to 30 addresses, returns marketCap/fdv). pump.fun's own API would
// give exact bonding-curve parity — swap fetchBatch() to it later without touching the
// grid. Tokens that haven't traded yet return null (grid shows "—").
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic"; // never statically optimize this route
export const runtime = "nodejs";

const TTL_MS = 45_000; // serve cached mcaps for 45s; pump caps move but not every ms
const cache = new Map<string, { mc: number | null; at: number }>();

async function fetchBatch(mints: string[]): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    try {
      const r = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`,
        { headers: { accept: "application/json" }, cache: "no-store" }
      );
      if (!r.ok) continue;
      const j: any = await r.json();
      // Keep the highest-liquidity pair per base mint, read its marketCap (fallback fdv).
      const best: Record<string, any> = {};
      for (const p of j.pairs ?? []) {
        const m = p?.baseToken?.address;
        if (!m) continue;
        const liq = p.liquidity?.usd ?? 0;
        if (!best[m] || liq > (best[m].liquidity?.usd ?? 0)) best[m] = p;
      }
      for (const m of chunk) {
        const p = best[m];
        const mc = p ? (p.marketCap ?? p.fdv ?? null) : null;
        out[m] = typeof mc === "number" && isFinite(mc) ? mc : null;
      }
    } catch {
      /* leave this chunk's mints unset -> null below */
    }
  }
  for (const m of mints) if (!(m in out)) out[m] = null;
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
