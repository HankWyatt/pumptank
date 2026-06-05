/* web/app/token/[id]/page.tsx · token dossier (deep-water edition). */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProducts, getProduct } from "@/lib/products";
import { DISCLAIMER } from "@/lib/disclaimer";
import { MintLink } from "@/components/MintLink";
import { EpisodeEmbed } from "@/components/EpisodeEmbed";
import { RunningHead } from "@/components/RunningHead";
import { OgPlate } from "@/components/OgPlate";
import { ProductCard } from "@/components/ProductCard";

export function generateStaticParams() {
  return getAllProducts().map((p) => ({ id: p.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const p = getProduct(params.id);
  if (!p) return { title: "Not found · PUMPTANK" };
  const title = `${p.name} ($${p.symbol}) · PUMPTANK`;
  return {
    title,
    description: p.description,
    openGraph: { title, description: p.description, images: [p.imagePath] },
    twitter: { card: "summary_large_image", title, description: p.description, images: [p.imagePath] },
  };
}

const money = (n: number | null | undefined) =>
  n == null ? null : "$" + Math.round(n).toLocaleString("en-US");

function fmtDate(s: string | null | undefined) {
  if (!s) return null;
  const m = String(s).split("-");
  if (m.length !== 3) return s;
  const yr = m[2].length === 2 ? (Number(m[2]) > 50 ? "19" : "20") + m[2] : m[2];
  return `${m[0]} ${m[1].toUpperCase()} ${yr}`;
}

export default function TokenPage({ params }: { params: { id: string } }) {
  const p = getProduct(params.id);
  if (!p) notFound();

  const all = getAllProducts();
  const idx = all.findIndex((x) => x.id === p.id);
  const folio = (p.rank != null ? String(p.rank) : String(idx + 1)).padStart(3, "0");
  const aired = fmtDate(p.airDate);

  const related = [
    ...all.filter((x) => x.id !== p.id && x.industry === p.industry),
    ...all.filter((x) => x.id !== p.id && x.industry !== p.industry),
  ].slice(0, 4);

  return (
    <main className="relative">
      <RunningHead middle="Token Dossier" right={`Folio No. ${folio}`} />

      <div className="mx-auto max-w-5xl px-6 pb-10 pt-5">
        <a
          href="/#archive"
          className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-[var(--teal-2)]"
        >
          <span className="transition-transform group-hover:-translate-x-0.5">←</span> Back to the Archive
        </a>

        {/* HERO */}
        <div className="reveal mt-7 grid gap-8 md:grid-cols-[1fr_minmax(0,380px)] md:gap-12">
          <div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="kicker">{p.industry}</span>
              <span className="font-mono text-xs text-muted">Pitch No. {folio}</span>
              {aired && <span className="font-mono text-xs text-muted">Aired {aired}</span>}
            </div>
            <h1 className="mt-3 font-display text-[clamp(2.6rem,8vw,5.2rem)] uppercase leading-[0.92] tracking-[0.01em] [text-wrap:balance]">
              {p.name}
            </h1>
            <div className="mt-3 font-mono text-2xl font-semibold text-[var(--teal)]">${p.symbol}</div>
            <p className="mt-6 max-w-md font-body text-xl leading-snug text-ink-soft">
              {p.gotDeal ? (
                <>
                  Pitched on Shark Tank S{p.season}E{p.episode}, and{" "}
                  <span className="font-bold">closed a deal on air.</span>
                </>
              ) : (
                <>
                  Pitched on Shark Tank S{p.season}E{p.episode}, and walked away with{" "}
                  <span className="relative inline-block font-bold">
                    no&nbsp;deal.
                    <span className="absolute left-0 top-[0.56em] h-[0.08em] w-full -rotate-[1.4deg] bg-[var(--red)]" aria-hidden />
                  </span>
                </>
              )}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4 font-mono text-sm">
              <MintLink mint={p.mint} />
              <span className="inline-flex items-center gap-2 text-xs text-muted">
                <span className="signal-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--red)]" aria-hidden />
                Filed on Solana
              </span>
            </div>
          </div>

          {/* Exhibit plate */}
          <figure className="relative m-0">
            <img
              src={p.imagePath}
              alt={`${p.name} tribute-token plate`}
              className="glow w-full border border-[var(--line-strong)]"
            />
            {!p.gotDeal && (
              <span className="stamp stamp-lg absolute -bottom-3 -right-3 -rotate-6 bg-[#07141f]">No Deal</span>
            )}
            <figcaption className="mt-4 font-mono text-[0.66rem] italic tracking-wide text-muted">
              Fig. 1 · The minted plate. 1000 × 1000, filed on-chain as ${p.symbol}.
            </figcaption>
          </figure>
        </div>

        <hr className="my-12 border-0 border-t border-[var(--line-strong)]" />

        {/* PITCH + LEDGER */}
        <div className="grid gap-10 md:grid-cols-[1fr_minmax(0,330px)]">
          <div>
            <div className="kicker mb-3">The Pitch</div>
            <p className="dropcap max-w-[44ch] font-body text-lg leading-relaxed text-ink-soft">{p.description}</p>
            {p.youtubeUrl && (
              <div className="mt-10">
                <div className="kicker mb-3">Watch the pitch</div>
                <div className="glow border border-[var(--line-strong)]">
                  <EpisodeEmbed url={p.youtubeUrl} />
                </div>
              </div>
            )}
          </div>

          <aside>
            {/* The Ask */}
            <div className="border border-[var(--line-strong)] bg-[var(--paper-2)]">
              <div className="flex items-center justify-between bg-[var(--navy)] px-4 py-2.5 font-mono text-[0.64rem] uppercase tracking-[0.2em] text-ink">
                <span>The Ask</span>
                <span>Tank Terms</span>
              </div>
              <dl className="m-0">
                {money(p.ask) && <Row k="The ask" v={money(p.ask)!} />}
                {p.askEquity != null && <Row k="For equity" v={`${p.askEquity}%`} />}
                {money(p.valuation) && <Row k="Implied valuation" v={money(p.valuation)!} teal />}
                <div className="ledger-row">
                  <dt className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">On-air verdict</dt>
                  <dd
                    className="m-0 font-mono text-[0.92rem] font-bold tracking-[0.08em]"
                    style={{ color: p.gotDeal ? "var(--teal)" : "#ff6a5e" }}
                  >
                    {p.gotDeal ? "Deal" : "No deal"}
                  </dd>
                </div>
              </dl>
              <p className="bg-[rgba(18,47,73,0.4)] px-4 py-3 font-mono text-[0.62rem] leading-relaxed text-muted">
                {p.gotDeal
                  ? "As presented on air. They shook hands on the show. Terms shown for the record, not a valuation of any token."
                  : "As presented on air. The sharks passed; the internet did not. Terms shown for the record, not a valuation of any token."}
              </p>
            </div>

            {/* Fact sheet */}
            <div className="mt-6">
              <div className="kicker mb-3">Fact Sheet</div>
              <dl className="border-t-2 border-[var(--line-strong)]">
                <Fact k="Episode" v={`S${p.season} · E${p.episode}${aired ? ` · ${aired}` : ""}`} />
                <Fact k="Sector" v={p.industry} />
                <Fact k="Company" v={p.companyName} />
                {p.founders.length > 0 && (
                  <Fact k={p.founders.length > 1 ? "Founders" : "Founder"} v={p.founders.join(", ")} />
                )}
                <Fact k="Outcome" v={p.gotDeal ? "Made a deal on air" : "No deal on air"} verdict={!p.gotDeal} />
                {p.formerWebsite && (
                  <div className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 border-b border-[var(--line)] py-3">
                    <dt className="font-mono text-[0.64rem] uppercase tracking-[0.14em] text-muted">Former site</dt>
                    <dd className="m-0">
                      <a
                        className="editorial-link break-all text-[var(--teal-2)]"
                        href={/^https?:/.test(p.formerWebsite) ? p.formerWebsite : `https://${p.formerWebsite}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {p.formerWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          </aside>
        </div>

        {/* FEE FIG */}
        <section className="mt-16">
          <div className="kicker">Founder Economics</div>
          <h2 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">
            If the founder opts in, the split is 80 / 20.
          </h2>
          <figure className="mt-6">
            <div className="flex h-14 w-full overflow-hidden border border-[var(--line-strong)] font-mono text-xs font-semibold uppercase tracking-[0.16em]">
              <div className="flex items-center justify-center bg-[var(--teal)] text-[var(--on-accent)]" style={{ width: "80%" }}>
                80% · Founder
              </div>
              <div className="hatch-20 flex items-center justify-center border-l border-[var(--line-strong)] text-ink" style={{ width: "20%" }}>
                20%
              </div>
            </div>
            <figcaption className="mt-3 font-mono text-[0.72rem] italic tracking-wide text-muted">
              Fig. 2 · Creator-fee allocation for ${p.symbol} upon verified founder opt-in. The 20% funds the index &amp; ecosystem.
            </figcaption>
          </figure>
        </section>

        {/* OPT-IN BAND */}
        <section className="mt-12">
          <div className="glow relative overflow-hidden border border-[var(--line-strong)] bg-[var(--paper-2)] p-8 md:p-12">
            <div className="halftone pointer-events-none absolute inset-y-0 right-0 w-36 opacity-[0.12]" aria-hidden />
            <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <div className="kicker">Founder of {p.companyName}?</div>
                <h2 className="mt-2 font-display text-2xl uppercase leading-tight md:text-[2.2rem]">
                  Claim 80% of <span className="text-[var(--teal)]">${p.symbol}</span> creator fees.
                </h2>
                <p className="mt-3 font-body text-lg leading-relaxed text-ink-soft">
                  This tribute was built for you. Opt in and the lion&apos;s share of trading fees is
                  yours: transparent and on-chain.
                </p>
              </div>
              <a
                href={`/onboard/?company=${encodeURIComponent(p.companyName)}&ticker=${encodeURIComponent(p.symbol)}&token_id=${p.id}`}
                className="btn-stamp inline-flex shrink-0 items-center gap-2.5 px-8 py-4 font-mono text-sm font-semibold uppercase tracking-[0.14em]"
              >
                Opt in <span aria-hidden>→</span>
              </a>
            </div>
          </div>
        </section>

        {/* OG PLATE */}
        <section className="mt-16">
          <div className="kicker">The Social Plate</div>
          <h2 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-4xl">Built to be shared.</h2>
          <p className="mt-3 max-w-2xl font-body text-lg leading-relaxed text-ink-soft">
            Every dossier ships with its own front-page clipping: the card that unfurls when $
            {p.symbol} hits the timeline.
          </p>
          <div className="mt-6">
            <OgPlate p={p} folio={folio} />
          </div>
          <p className="mt-3 font-mono text-[0.72rem] italic tracking-wide text-muted">
            Fig. 3 · Open-graph share card, 1200 × 630, generated per token at build time.
          </p>
        </section>

        {/* RELATED */}
        <section className="mt-16">
          <div className="flex items-end justify-between border-b-2 border-[var(--line-strong)] pb-2">
            <div className="kicker">More from the Index</div>
            <a href="/#archive" className="font-mono text-xs uppercase tracking-[0.2em] text-muted hover:text-[var(--teal-2)]">
              Full archive →
            </a>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.map((r) => (
              <ProductCard key={r.id} p={r} />
            ))}
          </div>
        </section>

        {/* DISCLAIMER */}
        <div className="mt-14 border-t border-[var(--line)] pt-5">
          <div className="kicker mb-2">Disclaimer</div>
          <p className="max-w-3xl font-mono text-[0.76rem] leading-relaxed text-muted">{DISCLAIMER}</p>
        </div>
      </div>
    </main>
  );
}

function Row({ k, v, teal }: { k: string; v: string; teal?: boolean }) {
  return (
    <div className="ledger-row">
      <dt className="font-mono text-[0.66rem] uppercase tracking-[0.14em] text-muted">{k}</dt>
      <dd className={`m-0 font-display text-2xl leading-none ${teal ? "text-[var(--teal)]" : "text-ink"}`}>{v}</dd>
    </div>
  );
}

function Fact({ k, v, verdict }: { k: string; v: string; verdict?: boolean }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 border-b border-[var(--line)] py-3">
      <dt className="font-mono text-[0.64rem] uppercase tracking-[0.14em] text-muted">{k}</dt>
      <dd className={`m-0 font-body text-base ${verdict ? "font-mono font-bold tracking-[0.04em] text-[#ff6a5e]" : "text-ink"}`}>{v}</dd>
    </div>
  );
}
