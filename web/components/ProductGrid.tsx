/* web/components/ProductGrid.tsx · classifieds index: search + sector filter
   + Tiles (gallery) / List (ruled list) views, paginated. */
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/products";
import { ProductCard } from "./ProductCard";
import { useMarketCaps, useAllMarketCaps } from "@/lib/useMarketCaps";
import { formatMarketCap } from "@/lib/format";

// Page size fills whole rows at every breakpoint (2 / 3 / 4 columns).
const PAGE_SIZE = 48;

export function ProductGrid({ products }: { products: Product[] }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("All");
  const [view, setView] = useState<"plates" | "index">("plates");
  const [outcome, setOutcome] = useState<"all" | "nodeal" | "deal">("all");
  const [sort, setSort] = useState<"default" | "mcap">("default");
  const [page, setPage] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const sectors = useMemo(
    () => ["All", ...Array.from(new Set(products.map((p) => p.industry))).sort()],
    [products]
  );

  const needle = q.trim().toLowerCase();
  const shown = products.filter((p) => {
    if (sector !== "All" && p.industry !== sector) return false;
    if (outcome === "deal" && !p.gotDeal) return false;
    if (outcome === "nodeal" && p.gotDeal) return false;
    if (!needle) return true;
    return [p.name, p.symbol, p.industry, p.companyName].some((f) =>
      (f || "").toLowerCase().includes(needle)
    );
  });

  // Jakob's Law: a familiar "/" shortcut jumps to search from anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Whenever the filtered set or sort changes, jump back to the first page.
  useEffect(() => { setPage(1); }, [needle, sector, outcome, sort]);

  const filtering = needle !== "" || sector !== "All" || outcome !== "all";

  // Market-cap sort ranks the WHOLE archive, so it needs the bulk caps map (only
  // fetched when this sort is active). Until it's warm, fall back to default order.
  const { map: allCaps, ready: capsReady } = useAllMarketCaps(sort === "mcap");
  const sortingByCap = sort === "mcap" && capsReady;
  const ordered = sortingByCap
    ? [...shown].sort((a, b) => capOf(b, allCaps) - capOf(a, allCaps))
    : shown;

  // Pagination: slice the (ordered) filtered set into pages and clamp the active page.
  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = ordered.slice(start, start + PAGE_SIZE);
  // Caps for display: reuse the bulk map when sorting by cap; else fetch the visible page.
  const pageCaps = useMarketCaps(pageItems.map((p) => p.mint).filter(Boolean) as string[]);
  const mcaps = sortingByCap ? allCaps : pageCaps;
  function goTo(p: number) {
    setPage(Math.min(totalPages, Math.max(1, p)));
    topRef.current?.scrollIntoView({ block: "start" });
  }

  return (
    <div ref={topRef} className="scroll-mt-24">
      {/* toolbar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted" aria-hidden>
            ⌕
          </span>
          <input
            ref={inputRef}
            type="search"
            aria-label="Search the archive"
            placeholder="Search name, ticker, or sector"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full border border-[var(--line-strong)] bg-[var(--paper-2)] pl-9 pr-16 font-mono text-sm text-ink placeholder:text-muted focus:border-[var(--teal)] focus:outline-none focus-visible:shadow-[0_0_0_1px_var(--teal)]"
          />
          {q ? (
            <button
              type="button"
              onClick={() => { setQ(""); inputRef.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center font-mono text-sm text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 border border-[var(--line-strong)] px-1.5 py-0.5 font-mono text-[0.62rem] text-muted sm:block">
              /
            </kbd>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex border border-[var(--line-strong)]" role="group" aria-label="Filter by outcome">
            {([["all", "All"], ["nodeal", "No Deal"], ["deal", "Deal"]] as const).map(([v, label], i) => (
              <button
                key={v}
                aria-pressed={outcome === v}
                onClick={() => setOutcome(v)}
                className={`h-11 px-4 font-mono text-[0.66rem] uppercase tracking-[0.14em] transition-colors ${
                  i > 0 ? "border-l border-[var(--line-strong)]" : ""
                } ${outcome === v ? "bg-[var(--teal)] text-[var(--on-accent)]" : "bg-[var(--paper-2)] text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex border border-[var(--line-strong)]" role="group" aria-label="View mode">
            {([["plates", "Tiles"], ["index", "List"]] as const).map(([v, label], i) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`h-11 px-4 font-mono text-[0.66rem] uppercase tracking-[0.14em] transition-colors ${
                  i > 0 ? "border-l border-[var(--line-strong)]" : ""
                } ${view === v ? "bg-[var(--blue)] text-[var(--on-accent)]" : "bg-[var(--paper-2)] text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="inline-flex border border-[var(--line-strong)]" role="group" aria-label="Sort by">
            {([["default", "Default"], ["mcap", "Mkt Cap"]] as const).map(([v, label], i) => (
              <button
                key={v}
                aria-pressed={sort === v}
                onClick={() => setSort(v)}
                className={`h-11 px-4 font-mono text-[0.66rem] uppercase tracking-[0.14em] transition-colors ${
                  i > 0 ? "border-l border-[var(--line-strong)]" : ""
                } ${sort === v ? "bg-[var(--blue)] text-[var(--on-accent)]" : "bg-[var(--paper-2)] text-muted hover:text-ink"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* sector chips */}
      <div className="mb-4 flex flex-wrap border border-b-0 border-[var(--line-strong)]" role="group" aria-label="Filter by sector">
        {sectors.map((s) => (
          <button
            key={s}
            aria-pressed={sector === s}
            onClick={() => setSector(s)}
            className={`inline-flex min-h-[38px] items-center border-b border-r border-b-[var(--line-strong)] border-r-[var(--line)] px-3 py-2 font-mono text-[0.62rem] uppercase tracking-[0.08em] transition-colors ${
              sector === s ? "bg-[var(--teal)] text-[var(--on-accent)]" : "bg-[var(--paper-2)] text-muted hover:text-ink"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* result count: instant feedback (Doherty), announced for screen readers */}
      <p className="mb-5 font-mono text-[0.66rem] uppercase tracking-[0.18em] text-muted" aria-live="polite">
        {shown.length > 0 && (
          <>
            {start + 1}&ndash;{start + pageItems.length} of{" "}
          </>
        )}
        {shown.length} {shown.length === 1 ? "entry" : "entries"}
        {filtering && <> · <button type="button" onClick={() => { setQ(""); setSector("All"); setOutcome("all"); }} className="editorial-link text-[var(--teal-2)]">clear filters</button></>}
        {sort === "mcap" && (capsReady ? <> · by market cap</> : <> · <span className="text-[var(--teal-2)]">ranking by market cap…</span></>)}
      </p>

      {shown.length === 0 ? (
        <div className="border border-[var(--line)] bg-[var(--paper-2)] px-4 py-12 text-center">
          <p className="font-mono text-sm text-muted">No entries match your search.</p>
          <button
            type="button"
            onClick={() => { setQ(""); setSector("All"); setOutcome("all"); inputRef.current?.focus(); }}
            className="btn-stamp mt-5 inline-flex h-11 items-center px-5 font-mono text-xs font-semibold uppercase tracking-[0.14em]"
          >
            Reset the index
          </button>
        </div>
      ) : view === "plates" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {pageItems.map((p) => (
            <ProductCard key={p.id} p={p} marketCap={p.mint ? mcaps[p.mint] : undefined} />
          ))}
        </div>
      ) : (
        <IndexList rows={pageItems} mcaps={mcaps} />
      )}

      {shown.length > 0 && totalPages > 1 && (
        <nav
          className="mt-8 flex flex-wrap items-center justify-center gap-1.5 font-mono text-[0.66rem] uppercase tracking-[0.14em]"
          aria-label="Archive pagination"
        >
          <button
            type="button"
            onClick={() => goTo(safePage - 1)}
            disabled={safePage === 1}
            className="h-10 px-3 border border-[var(--line-strong)] bg-[var(--paper-2)] text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
          >
            ← Prev
          </button>
          {pageWindow(safePage, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1.5 text-muted" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => goTo(p)}
                aria-current={p === safePage ? "page" : undefined}
                className={`h-10 min-w-[2.5rem] px-2 border tabular transition-colors ${
                  p === safePage
                    ? "border-[var(--blue)] bg-[var(--blue)] text-[var(--on-accent)]"
                    : "border-[var(--line-strong)] bg-[var(--paper-2)] text-muted hover:text-ink"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => goTo(safePage + 1)}
            disabled={safePage === totalPages}
            className="h-10 px-3 border border-[var(--line-strong)] bg-[var(--paper-2)] text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted"
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}

// Market cap for sorting: the number when known, -1 for no-mint/no-data (sorts last desc).
function capOf(p: Product, caps: Record<string, number | null>): number {
  const c = p.mint ? caps[p.mint] : null;
  return typeof c === "number" ? c : -1;
}

// Compact page list with ellipses: 1 … p-1 p p+1 … last.
function pageWindow(current: number, total: number): (number | "…")[] {
  const out: (number | "…")[] = [];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  out.push(1);
  if (left > 2) out.push("…");
  for (let i = left; i <= right; i++) out.push(i);
  if (right < total - 1) out.push("…");
  if (total > 1) out.push(total);
  return out;
}

function IndexList({ rows, mcaps }: { rows: Product[]; mcaps: Record<string, number | null> }) {
  return (
    <div className="border border-[var(--line-strong)]">
      <div className="grid grid-cols-[3.4rem_1fr_8.5rem_7rem_8rem_4.2rem] gap-3 bg-[var(--navy)] px-4 py-2.5 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-ink max-[720px]:grid-cols-[2.6rem_1fr_5.5rem]">
        <span>No.</span>
        <span>Company / Filing</span>
        <span>Ticker</span>
        <span className="max-[720px]:hidden">Mkt Cap</span>
        <span className="max-[720px]:hidden">Sector</span>
        <span className="max-[720px]:hidden">Reach</span>
      </div>
      {rows.map((p) => {
        const no = p.rank != null ? p.rank.toString().padStart(3, "0") : "·";
        const reach = p.reach != null ? Math.max(8, Math.round(p.reach * 100)) : null;
        return (
          <a
            key={p.id}
            href={`/token/${p.id}/`}
            className="grid grid-cols-[3.4rem_1fr_8.5rem_7rem_8rem_4.2rem] items-center gap-3 border-b border-[var(--line)] bg-[var(--paper-2)] px-4 py-3 text-ink transition-colors last:border-b-0 hover:bg-[var(--navy-2)] focus-visible:bg-[var(--navy-2)] max-[720px]:grid-cols-[2.6rem_1fr_5.5rem]"
          >
            <span className="font-mono text-sm text-muted tabular">{no}</span>
            <span className="font-body text-base font-bold leading-tight">
              {p.name}
              <span className="block font-mono text-[0.64rem] uppercase tracking-wide text-muted">
                {p.companyName} · S{p.season}E{p.episode}
              </span>
            </span>
            <span className="font-mono text-sm font-semibold text-[var(--teal)]">${p.symbol}</span>
            <span
              className="font-mono text-[0.78rem] text-ink tabular max-[720px]:hidden"
              title={p.mint ? "Market cap" : "Not launched yet"}
            >
              {p.mint ? formatMarketCap(mcaps[p.mint]) : "—"}
            </span>
            <span className="font-mono text-[0.64rem] uppercase tracking-wide text-muted max-[720px]:hidden">
              {p.industry}
            </span>
            {reach != null ? (
              <span className="reach-meter max-[720px]:hidden" title={`Reach ${reach}%`}>
                <i style={{ width: `${reach}%` }} />
              </span>
            ) : (
              <span className="max-[720px]:hidden" />
            )}
          </a>
        );
      })}
    </div>
  );
}
