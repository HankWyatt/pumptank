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

// Whole-archive market caps for SORTING (from /api/mcaps/all). Only fetches when
// `enabled` (i.e. the user picked the market-cap sort). Polls until the server's bulk
// map is warm, then client-caches it 2min so toggling sort doesn't refetch.
let allCache: { map: Record<string, number | null>; at: number } | null = null;
const ALL_TTL_MS = 120_000;

export function useAllMarketCaps(enabled: boolean): {
  map: Record<string, number | null>;
  ready: boolean;
} {
  const fresh = () => allCache && Date.now() - allCache.at < ALL_TTL_MS;
  const [state, setState] = useState<{ map: Record<string, number | null>; ready: boolean }>(
    () => (fresh() ? { map: allCache!.map, ready: true } : { map: {}, ready: false })
  );

  useEffect(() => {
    if (!enabled) return;
    if (fresh()) {
      setState({ map: allCache!.map, ready: true });
      return;
    }
    let cancelled = false;
    let tries = 0;
    const poll = () => {
      fetch("/api/mcaps/all/")
        .then((r) => (r.ok ? r.json() : { ready: false, marketCaps: {} }))
        .then((j: { ready?: boolean; marketCaps?: Record<string, number | null> }) => {
          if (cancelled) return;
          if (j.ready && j.marketCaps) {
            allCache = { map: j.marketCaps, at: Date.now() };
            setState({ map: j.marketCaps, ready: true });
          } else if (tries++ < 45) {
            setTimeout(poll, 3000); // warming up (~135s max) until the first fill lands
          }
        })
        .catch(() => {
          if (!cancelled && tries++ < 45) setTimeout(poll, 3000);
        });
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
