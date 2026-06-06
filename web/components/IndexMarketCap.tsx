"use client";
import { useEffect, useState } from "react";
import { INDEX_TOKEN } from "@/lib/index-token";
import { formatMarketCap } from "@/lib/format";

// Small live market-cap stat for the flagship $PUMPTANK token, shown under its CA.
// Pulls from the same /api/mcaps route; hides itself until a value is in so the hero
// never flashes a "—". Refreshes once a minute for a live feel.
export function IndexMarketCap() {
  const [mc, setMc] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/mcaps/?mints=${INDEX_TOKEN.mint}`)
        .then((r) => (r.ok ? r.json() : { marketCaps: {} }))
        .then((j) => {
          if (!cancelled) setMc(j.marketCaps?.[INDEX_TOKEN.mint] ?? null);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (mc == null) return null;
  return (
    <div className="mt-1 flex items-baseline gap-2.5">
      <span className="kicker text-muted">Market cap</span>
      <span className="font-mono text-2xl font-bold tabular text-[var(--teal)]">
        {formatMarketCap(mc)}
      </span>
    </div>
  );
}
