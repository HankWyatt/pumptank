import { getAllProducts } from "@/lib/products";
import { DISCLAIMER } from "@/lib/disclaimer";
import { ProductGrid } from "@/components/ProductGrid";
import { IndexTokenCard } from "@/components/IndexTokenCard";

export default function HubPage() {
  const products = getAllProducts();
  const industries = new Set(products.map((p) => p.industry)).size;
  const ticker = products.slice(0, 30);

  const stats = [
    { v: products.length.toString().padStart(3, "0"), l: "Tribute tokens" },
    { v: industries.toString(), l: "Sectors covered" },
    { v: "0", l: "Insider buys" },
    { v: products.filter((p) => !p.gotDeal).length.toString(), l: "No-deal pitches" },
  ];

  return (
    <main className="relative">
      {/* ============ FRONT PAGE / LEDE ============ */}
      <section className="relative mx-auto max-w-6xl px-6 pt-12 md:pt-16">
        <div
          className="halftone pointer-events-none absolute right-6 top-6 hidden h-24 w-40 opacity-[0.16] md:block"
          aria-hidden
        />
        <div className="reveal kicker flex items-center gap-3">
          <span>Front Page</span>
          <span className="h-px w-10 bg-[var(--line-strong)]" aria-hidden />
          <span className="text-muted">Pitched on air, tributed on-chain</span>
        </div>

        <div className="mt-6 grid gap-x-10 gap-y-10 md:grid-cols-12">
          {/* Headline + lede */}
          <div className="md:col-span-8">
            <h1 className="reveal font-display text-[clamp(2.9rem,8.5vw,6.25rem)] uppercase leading-[0.9] tracking-[0.01em]">
              We mint the{" "}
              <span className="text-[var(--teal)]">legends.</span>
            </h1>

            <p className="reveal dropcap mt-7 max-w-2xl font-body text-xl leading-[1.6] text-ink-soft">
              <span className="font-mono text-base font-semibold tracking-tight text-[var(--teal-2)]">
                $PUMPTANK
              </span>{" "}
              is a fan-built archive of <strong>every</strong> Shark&nbsp;Tank pitch, deal or no
              deal. Each one reborn as its own tribute token. No suits. No handshakes required. Just
              the ideas, filed for the record.
            </p>

            <p className="reveal mt-5 dateline">
              By the PUMPTANK Desk · Filed from Solana · Est. MMXXVI
            </p>

            <div className="reveal mt-8 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <a
                href="#archive"
                className="btn-stamp inline-flex items-center gap-2.5 px-7 py-3.5 font-mono text-sm font-semibold uppercase tracking-[0.14em]"
              >
                Browse the Archive
                <span aria-hidden>↓</span>
              </a>
              <a
                href="/onboard/"
                className="editorial-link font-mono text-sm font-medium uppercase tracking-[0.14em] text-ink"
              >
                Founders: claim your fees →
              </a>
            </div>
          </div>

          {/* "By the numbers" ledger box */}
          <aside className="reveal md:col-span-4 md:col-rule md:pl-8">
            <div className="relative border border-[var(--line-strong)] bg-[var(--paper-2)] p-6">
              <span className="stamp absolute -right-3 -top-3 rotate-[7deg] bg-[#07141f] px-2.5 py-1 text-[0.62rem]">
                Tribute
              </span>
              <div className="kicker">By the Numbers</div>
              <dl className="mt-4 divide-y divide-[var(--line)]">
                {stats.map((s) => (
                  <div key={s.l} className="flex items-baseline justify-between gap-3 py-3">
                    <dt className="font-mono text-[0.7rem] uppercase tracking-[0.16em] text-muted">
                      {s.l}
                    </dt>
                    <dd className="tabular font-display text-3xl leading-none text-[var(--teal)]">
                      {s.v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Flagship index token — moved here, in its own container */}
            <div className="mt-6">
              <IndexTokenCard />
            </div>
          </aside>
        </div>
      </section>

      {/* ============ LIVE TAPE ============ */}
      <div className="ticker-mask relative mt-12 flex items-center overflow-hidden border-y border-[rgba(140,196,224,0.18)] bg-[#050f1a] py-2.5">
        <span className="z-10 shrink-0 self-stretch bg-[var(--red)] px-4 py-1 font-mono text-[0.66rem] font-semibold uppercase tracking-[0.2em] text-white">
          Live Tape
        </span>
        <div className="ticker-track gap-7 pl-7 font-mono text-sm">
          {[...ticker, ...ticker].map((p, i) => (
            <span key={`${p.id}-${i}`} className="inline-flex items-center gap-2.5">
              <span className="font-semibold text-[var(--teal)]">${p.symbol}</span>
              <span className="text-[var(--ink)]/60">{p.name}</span>
              {p.gotDeal ? (
                <span className="text-[var(--teal)]">✓ deal</span>
              ) : (
                <span className="text-[#ff7064]">▼ no deal</span>
              )}
              <span className="text-[var(--ink)]/25" aria-hidden>◆</span>
            </span>
          ))}
        </div>
      </div>

      {/* ============ THE MECHANICS ============ */}
      <section id="mechanics" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-20" aria-labelledby="how">
        <div className="kicker">The Mechanics</div>
        <h2 id="how" className="mt-3 font-display text-4xl uppercase tracking-tight md:text-5xl">
          Transparent by design.
        </h2>
        <p className="mt-4 max-w-2xl font-body text-lg leading-relaxed text-ink-soft">
          No BS. Here is exactly how every $PUMPTANK token is
          struck. It's all printed in full, for anyone who cares to read the fine print.
        </p>

        <ol className="mt-12 grid gap-x-10 gap-y-8 border-t-2 border-[var(--line-strong)] pt-8 md:grid-cols-3">
          {[
            {
              n: "01",
              t: "Create-only. Zero insider buys.",
              d: "Every product launches create-only: no dev buy, no insider allocation, no supply held back by the builders. The coins are free to belong to the founders and the communities that grow around them. The goal is real exposure, a following, and for some of these ideas a genuine second chance, even a comeback.",
            },
            {
              n: "02",
              t: "80% of fees → founders",
              d: "Creator trading fees route 80% to the original founder the moment they opt in. The lion's share is reserved for them. It is their story; it is their upside.",
            },
            {
              n: "03",
              t: "20% fuels the index",
              d: "The remaining 20% funds marketing and growth for the index. If someone helped onboard a founder, 10% of it is theirs as a thank-you. Onboarded a founder? Get in touch.",
            },
          ].map((step, i) => (
            <li key={step.n} className={i > 0 ? "md:col-rule md:pl-10" : ""}>
              <div className="flex items-baseline gap-3">
                <span className="font-display text-5xl leading-none text-[var(--red)]">
                  {step.n}
                </span>
                <span className="h-px flex-1 translate-y-[-0.4em] bg-[var(--line)]" aria-hidden />
              </div>
              <h3 className="mt-4 font-body text-2xl font-bold">{step.t}</h3>
              <p className="mt-3 font-body leading-relaxed text-ink-soft">{step.d}</p>
            </li>
          ))}
        </ol>

        {/* Fee allocation, Fig. 1 */}
        <figure className="mt-12">
          <div className="flex h-14 w-full overflow-hidden border border-[var(--line-strong)] font-mono text-xs font-semibold uppercase tracking-[0.16em]">
            <div
              className="flex items-center justify-center bg-[var(--teal)] text-[var(--on-accent)]"
              style={{ width: "80%" }}
            >
              80% · Founders
            </div>
            <div
              className="hatch-20 flex items-center justify-center border-l border-[var(--line-strong)] text-ink"
              style={{ width: "20%" }}
            >
              20%
            </div>
          </div>
          <figcaption className="mt-3 font-mono text-[0.72rem] italic tracking-wide text-muted">
            Fig. 1 · Creator-fee allocation per token, upon founder opt-in (80% founder · 20% index &amp; ecosystem).
          </figcaption>
        </figure>
      </section>

      {/* ============ NOTICE TO FOUNDERS ============ */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="glow relative border border-[var(--line-strong)] bg-[var(--paper-2)] p-8 md:p-12">
          <div className="halftone pointer-events-none absolute inset-y-0 right-0 w-40 opacity-[0.14]" aria-hidden />
          <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <div className="kicker">Notice to Founders</div>
              <h2 className="mt-3 font-display text-3xl uppercase leading-tight tracking-tight md:text-[2.6rem]">
                Your pitch. Your token. <span className="text-[var(--teal)]">Fund your product with the fees.</span>
              </h2>
              <p className="mt-4 font-body text-lg leading-relaxed text-ink-soft">
                If you founded one of these companies, the door is open. Opt in and the majority of the
                creator-fee share is yours. No strings, fully transparent, settled on-chain. FREE crowdfunding, no VC pitch required. It's your story, your upside.
              </p>
            </div>
            <a
              href="/onboard/"
              className="btn-stamp inline-flex shrink-0 items-center gap-2.5 px-8 py-4 font-mono text-sm font-semibold uppercase tracking-[0.14em]"
            >
              Opt in now <span aria-hidden>→</span>
            </a>
          </div>
        </div>
      </section>

      {/* ============ THE ARCHIVE ============ */}
      <section id="archive" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-20">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4 rule-double pb-1">
          <div className="pb-4">
            <div className="kicker">Section B · The Archive</div>
            <h2 className="mt-2 font-display text-4xl uppercase tracking-tight md:text-5xl">
              {products.length} Shark Tank pitches, indexed.
            </h2>
          </div>
          <span className="pb-4 font-mono text-xs uppercase tracking-[0.18em] text-muted">
            No-deal pitches ranked first · {products.length} entries
          </span>
        </div>
        <ProductGrid products={products} />
      </section>

      {/* ============ THE FINE PRINT ============ */}
      <section id="fine-print" className="mx-auto max-w-6xl scroll-mt-24 px-6 pb-10">
        <div className="border-t border-[var(--line)] pt-5">
          <div className="kicker mb-2">The Fine Print</div>
          <p className="max-w-3xl font-mono text-[0.76rem] leading-relaxed text-muted">{DISCLAIMER}</p>
        </div>
      </section>
    </main>
  );
}
