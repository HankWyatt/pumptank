/* web/components/IndexTokenCard.tsx · flagship $PUMPTANK index-token card (hero right rail).
   Visually rhymes with the "By the Numbers" box: same border/paper + corner stamp. */
import { CopyableCA } from "@/components/CopyableCA";
import { IndexMarketCap } from "@/components/IndexMarketCap";
import { INDEX_TOKEN } from "@/lib/index-token";

export function IndexTokenCard() {
  return (
    <div className="relative border border-[var(--line-strong)] bg-[var(--paper-2)] p-6">
      <span className="stamp absolute -right-3 -top-3 rotate-[7deg] bg-[#07141f] px-2.5 py-1 text-[0.62rem]">
        Index
      </span>

      <div className="kicker text-muted">The Index Token</div>
      <div className="mt-2 font-display text-4xl uppercase leading-[0.95] text-ink">
        Pump<span className="text-[var(--teal)]">tank</span>
      </div>

      {/* Live market cap — hides itself until loaded, so no empty row before data. */}
      <IndexMarketCap />

      <div className="mt-5 flex flex-col gap-2 border-t border-[var(--line)] pt-4">
        <span className="kicker text-muted">Contract address</span>
        <CopyableCA mint={INDEX_TOKEN.mint} truncate />
      </div>

      <a
        href={`https://pump.fun/${INDEX_TOKEN.mint}`}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-stamp mt-6 flex items-center justify-center gap-2 px-5 py-3 font-mono text-sm font-semibold uppercase tracking-[0.14em]"
      >
        Trade $PUMPTANK <span aria-hidden>↗</span>
      </a>
    </div>
  );
}
