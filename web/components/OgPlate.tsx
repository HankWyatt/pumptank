/* web/components/OgPlate.tsx - editorial 1200×630 share card.
   Rendered on the token page as a live preview; also suitable for
   build-time screenshot generation (it scales via container queries). */
import type { Product } from "@/lib/products";

export function OgPlate({ p, folio }: { p: Product; folio: string }) {
  return (
    <div className="glow max-w-[600px] overflow-hidden border border-[var(--line-strong)]">
      <div className="og">
        <div className="og-rule" aria-hidden />
        <div className="og-left">
          <div className="og-over">The Tribute Ledger · Pitch No. {folio}</div>
          <div className="og-name">{p.name}</div>
          <div className="og-sym">${p.symbol}</div>
          <div className="og-foot">
            Shark Tank S{p.season}E{p.episode} · {p.industry}
          </div>
        </div>
        <div className="og-right">
          {!p.gotDeal && <span className="og-stamp">No Deal</span>}
          <span className="og-tk">
            Pump<i>tank</i>
          </span>
        </div>
      </div>
    </div>
  );
}
