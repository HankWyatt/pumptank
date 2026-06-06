"use client";
import { useEffect, useState } from "react";

// Fetches live market caps for the visible page's mints from /api/mcaps. Module-level
// cache (60s) persists across pagination so flipping pages doesn't refetch. Returns a
// { mint: number|null } map; null = no data yet (not launched/traded -> grid shows "—").
const mem = new Map<string, { v: number | null; at: number }>();
const TTL_MS = 60_000;

export function useMarketCaps(mints: string[]): Record<string, number | null> {
  const want = mints.filter(Boolean);
  const key = [...want].sort().join(",");
  const [, force] = useState(0);

  useEffect(() => {
    if (!want.length) return;
    const now = Date.now();
    const missing = want.filter((m) => {
      const c = mem.get(m);
      return !c || now - c.at > TTL_MS;
    });
    if (!missing.length) return;
    let cancelled = false;
    // trailing slash: matches next.config trailingSlash:true, avoids a 308 per call
    fetch(`/api/mcaps/?mints=${encodeURIComponent(missing.join(","))}`)
      .then((r) => (r.ok ? r.json() : { marketCaps: {} }))
      .then((j: { marketCaps?: Record<string, number | null> }) => {
        if (cancelled) return;
        const t = Date.now();
        for (const m of missing) mem.set(m, { v: j.marketCaps?.[m] ?? null, at: t });
        force((n) => n + 1);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const out: Record<string, number | null> = {};
  for (const m of want) out[m] = mem.get(m)?.v ?? null;
  return out;
}
