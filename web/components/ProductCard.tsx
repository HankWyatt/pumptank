/* web/components/ProductCard.tsx · classifieds "plate" card. */
import type { Product } from "@/lib/products";

export function ProductCard({ p }: { p: Product }) {
  return (
    <a
      href={`/token/${p.id}/`}
      className="group block border border-[var(--line)] bg-[var(--paper-2)] text-ink transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-[var(--line-strong)] hover:shadow-[0_16px_32px_-18px_rgba(0,0,0,0.85)] focus-visible:-translate-y-1 focus-visible:border-[var(--line-strong)] focus-visible:shadow-[0_16px_32px_-18px_rgba(0,0,0,0.85)]"
    >
      <div className="relative bg-[var(--navy-2)]">
        <img
          src={p.imagePath}
          alt={`${p.name} tribute-token plate`}
          loading="lazy"
          className="aspect-square w-full object-cover"
        />
        {p.rank != null && (
          <span className="absolute left-0 top-0 bg-[var(--navy)] px-2 py-0.5 font-mono text-[0.6rem] tracking-wider text-ink">
            No. {p.rank.toString().padStart(3, "0")}
          </span>
        )}
        {!p.gotDeal && (
          <span className="stamp absolute right-1.5 top-1.5 px-2 py-1 text-[0.55rem]">No Deal</span>
        )}
      </div>
      <div className="border-t border-[var(--line)] p-3">
        <div className="truncate font-body text-base font-bold leading-tight" title={p.name}>
          {p.name}
        </div>
        <div className="font-mono text-sm font-medium text-[var(--teal)]">${p.symbol}</div>
        <div className="mt-1.5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted">
          S{p.season}E{p.episode} · {p.industry}
        </div>
      </div>
    </a>
  );
}
