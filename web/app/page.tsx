import { getAllProducts } from "@/lib/products";
import { DISCLAIMER } from "@/lib/disclaimer";
import { ProductGrid } from "@/components/ProductGrid";

export default function HubPage() {
  const products = getAllProducts();
  const industries = new Set(products.map((p) => p.industry)).size;
  const ticker = products.slice(0, 28);

  return (
    <main className="relative">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden">
        <div className="ledger-grid absolute inset-0 opacity-30" aria-hidden />
        <div
          className="absolute -right-24 -top-24 h-[460px] w-[460px] rounded-full bg-accent/10 blur-[120px]"
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-16 md:pt-24">
          <div className="reveal flex items-center gap-3" style={{ animationDelay: "0ms" }}>
            <span className="signal-dot inline-block h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
            <span className="kicker">Live Tribute Index · Solana</span>
          </div>

          <h1
            className="reveal mt-6 font-display text-[clamp(2.8rem,9vw,6.5rem)] font-black leading-[0.92] tracking-[-0.02em]"
            style={{ animationDelay: "80ms" }}
          >
            They got
            <br />
            <span className="relative inline-block">
              <span className="italic text-accent">no deal.</span>
              <span
                className="absolute -right-3 top-1 h-[3px] w-full -rotate-1 bg-[var(--reject)]/80 sm:-right-6"
                aria-hidden
              />
            </span>
            <br />
            <span className="text-muted">We minted the legend.</span>
          </h1>

          <p
            className="reveal mt-8 max-w-2xl font-body text-lg leading-relaxed text-ink/80 md:text-xl"
            style={{ animationDelay: "160ms" }}
          >
            <span className="font-mono font-bold text-accent">$PUMPTANK</span> is a fan-built
            archive of{" "}
            <span className="font-semibold text-ink">100 Shark Tank pitches that walked away empty-handed</span>
            {" "}— each immortalized as its own tribute token. No suits. No handshakes. Just the
            ideas that deserved a second look.
          </p>

          <div
            className="reveal mt-10 flex flex-col gap-4 sm:flex-row sm:items-center"
            style={{ animationDelay: "240ms" }}
          >
            <a
              href="#archive"
              className="glow group inline-flex items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-[#04181d] transition-transform hover:-translate-y-0.5"
            >
              Browse the Archive
              <span className="transition-transform group-hover:translate-x-1">↓</span>
            </a>
            <a
              href="/onboard"
              className="group inline-flex items-center justify-center gap-2 rounded-full border border-[var(--line-strong)] px-7 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-ink transition-colors hover:bg-fin"
            >
              Founders: claim your fees
              <span className="text-accent transition-transform group-hover:translate-x-1">→</span>
            </a>
          </div>

          {/* Stats strip */}
          <dl
            className="reveal mt-14 grid max-w-2xl grid-cols-3 divide-x divide-[var(--line)] border-y border-[var(--line)]"
            style={{ animationDelay: "320ms" }}
          >
            {[
              { v: products.length.toString().padStart(3, "0"), l: "Tribute tokens" },
              { v: industries.toString(), l: "Industries" },
              { v: "1.5%", l: "Dev buy · capped" },
            ].map((s) => (
              <div key={s.l} className="px-5 py-5 first:pl-0">
                <dt className="font-display text-3xl font-bold text-accent md:text-4xl">{s.v}</dt>
                <dd className="mt-1 font-mono text-[0.7rem] uppercase tracking-[0.18em] text-muted">
                  {s.l}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Ticker tape */}
        <div className="ticker-mask relative border-y border-[var(--line)] bg-fin-2/60 py-3">
          <div className="ticker-track gap-8 font-mono text-sm">
            {[...ticker, ...ticker].map((p, i) => (
              <span key={`${p.id}-${i}`} className="inline-flex items-center gap-2 text-muted">
                <span className="font-bold text-accent">${p.symbol}</span>
                <span className="text-ink/70">{p.name}</span>
                <span className="text-[var(--reject)]/70">· no deal</span>
                <span className="px-2 text-muted/40">/</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="mx-auto max-w-6xl px-6 py-20" aria-labelledby="how">
        <div className="kicker mb-3">The mechanics</div>
        <h2 id="how" className="font-display text-4xl font-bold tracking-tight md:text-5xl">
          Transparent by design.
        </h2>
        <p className="mt-4 max-w-2xl font-body text-lg text-ink/75">
          No hidden allocations, no team bags, no rug. Here is exactly how every $PUMPTANK token works.
        </p>

        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "A 1.5% dev buy",
              d: "Each token launches with a single, transparent 1.5% dev buy — fully disclosed, capped, and on-chain. That's the only insider position, ever.",
            },
            {
              n: "02",
              t: "80% of fees → founders",
              d: "Creator trading fees are split 80 / 20. The lion's share — 80% — is reserved for the original founders the moment they opt in. It's their story; it's their upside.",
            },
            {
              n: "03",
              t: "20% keeps the lights on",
              d: "The remaining 20% funds marketing and growth for the index, so more rejected pitches get the spotlight they were denied on air.",
            },
          ].map((step) => (
            <li
              key={step.n}
              className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-fin/50 p-6 transition-colors hover:border-[var(--line-strong)]"
            >
              <div
                className="absolute -right-6 -top-8 font-display text-[6rem] font-black leading-none text-accent/5 transition-colors group-hover:text-accent/10"
                aria-hidden
              >
                {step.n}
              </div>
              <div className="relative">
                <div className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
                  Step {step.n}
                </div>
                <h3 className="mt-3 font-display text-2xl font-semibold">{step.t}</h3>
                <p className="mt-3 font-body text-sm leading-relaxed text-ink/70">{step.d}</p>
              </div>
            </li>
          ))}
        </ol>

        {/* Fee-split bar */}
        <div className="mt-10 overflow-hidden rounded-xl border border-[var(--line)]">
          <div className="flex h-12 w-full font-mono text-xs font-bold">
            <div className="flex items-center justify-center bg-accent text-[#04181d]" style={{ width: "80%" }}>
              80% · FOUNDERS
            </div>
            <div className="flex items-center justify-center bg-accent-dim/40 text-ink" style={{ width: "20%" }}>
              20% · GROWTH
            </div>
          </div>
        </div>
      </section>

      {/* ============ FOUNDER CTA ============ */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="glow relative overflow-hidden rounded-3xl border border-[var(--line-strong)] bg-gradient-to-br from-fin to-fin-2 p-8 md:p-14">
          <div
            className="absolute -left-20 -top-20 h-72 w-72 rounded-full bg-accent/15 blur-[100px]"
            aria-hidden
          />
          <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <div className="kicker mb-3">Were you on the show?</div>
              <h2 className="font-display text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                Your pitch. Your token. <span className="text-accent">80% of the fees.</span>
              </h2>
              <p className="mt-4 font-body text-ink/75">
                If you founded one of these companies, the door is open. Opt in and the 80%
                creator-fee share is yours — no strings, fully transparent.
              </p>
            </div>
            <a
              href="/onboard"
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-8 py-4 font-mono text-sm font-bold uppercase tracking-wider text-[#04181d] transition-transform hover:-translate-y-0.5"
            >
              Opt in now
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ============ ARCHIVE GRID ============ */}
      <section id="archive" className="mx-auto max-w-6xl scroll-mt-8 px-6 pb-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-5">
          <div>
            <div className="kicker mb-2">The full ledger</div>
            <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
              100 rejected pitches.
            </h2>
          </div>
          <span className="font-mono text-sm text-muted">
            Ranked by reach · {products.length} entries
          </span>
        </div>
        <ProductGrid products={products} />
      </section>

      {/* ============ DISCLAIMER ============ */}
      <section className="mx-auto max-w-6xl px-6 pb-8">
        <div className="rounded-xl border border-[var(--line)] bg-fin/40 p-5">
          <div className="kicker mb-2">Disclaimer</div>
          <p className="font-mono text-[0.78rem] leading-relaxed text-muted">{DISCLAIMER}</p>
        </div>
      </section>
    </main>
  );
}
