import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAllProducts, getProduct } from "@/lib/products";
import { DISCLAIMER } from "@/lib/disclaimer";
import { MintLink } from "@/components/MintLink";
import { EpisodeEmbed } from "@/components/EpisodeEmbed";

export function generateStaticParams() {
  return getAllProducts().map((p) => ({ id: p.id }));
}

export function generateMetadata({ params }: { params: { id: string } }): Metadata {
  const p = getProduct(params.id);
  if (!p) return { title: "Not found — PUMPTANK" };
  return {
    title: `${p.name} ($${p.symbol}) — PUMPTANK`,
    description: p.description,
    openGraph: {
      title: `${p.name} ($${p.symbol}) — PUMPTANK`,
      description: p.description,
      images: [p.imagePath],
    },
  };
}

export default function TokenPage({ params }: { params: { id: string } }) {
  const p = getProduct(params.id);
  if (!p) notFound();

  return (
    <main className="relative">
      <div className="ledger-grid absolute inset-x-0 top-0 h-96 opacity-25" aria-hidden />

      <div className="relative mx-auto max-w-5xl px-6 pt-10">
        {/* Breadcrumb */}
        <a
          href="/"
          className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-accent"
        >
          <span className="transition-transform group-hover:-translate-x-0.5">←</span>
          The Archive
        </a>

        {/* Header: image + identity */}
        <div className="reveal mt-8 grid gap-8 md:grid-cols-[minmax(0,360px)_1fr] md:gap-12">
          <div className="relative">
            <div
              className="absolute -inset-3 rounded-3xl bg-accent/10 blur-2xl"
              aria-hidden
            />
            <img
              src={p.imagePath}
              alt={`${p.name} tribute token artwork`}
              className="relative w-full rounded-2xl border border-[var(--line-strong)] shadow-2xl"
            />
            <div className="stamp absolute -bottom-3 -right-3 rotate-[-6deg] px-3 py-1.5 font-mono text-xs font-bold">
              No Deal
            </div>
          </div>

          <div className="flex flex-col justify-center">
            <div className="flex flex-wrap items-center gap-3">
              <span className="kicker">{p.industry}</span>
              <span className="font-mono text-xs text-muted">
                Pitch #{p.id.split("-")[0].toUpperCase()}
              </span>
            </div>

            <h1 className="mt-3 font-display text-[clamp(2.2rem,6vw,4rem)] font-black leading-[0.95] tracking-[-0.02em]">
              {p.name}
            </h1>
            <div className="mt-2 font-mono text-2xl font-bold text-accent">${p.symbol}</div>

            <p className="mt-6 max-w-md font-display text-xl italic leading-snug text-ink/85">
              Pitched on Shark Tank S{p.season}E{p.episode} — no deal.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line-strong)] bg-fin px-4 py-2 font-mono text-sm">
                <span className="signal-dot inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                <MintLink mint={p.mint} />
              </span>
            </div>
          </div>
        </div>

        {/* Description + facts */}
        <div className="reveal mt-14 grid gap-10 md:grid-cols-[1fr_minmax(0,300px)]" style={{ animationDelay: "120ms" }}>
          <div>
            <div className="kicker mb-3">The pitch</div>
            <p className="font-body text-lg leading-relaxed text-ink/85">{p.description}</p>

            <EpisodeWrap url={p.youtubeUrl} />
          </div>

          {/* Fact sheet */}
          <aside className="h-fit rounded-2xl border border-[var(--line)] bg-fin/50 p-6">
            <div className="kicker mb-4">Fact sheet</div>
            <dl className="space-y-4 font-mono text-sm">
              <Fact label="Episode" value={`S${p.season} · E${p.episode}`} />
              <Fact label="Industry" value={p.industry} />
              <Fact label="Company" value={p.companyName} />
              {p.founders.length > 0 && (
                <Fact label={p.founders.length > 1 ? "Founders" : "Founder"} value={p.founders.join(", ")} />
              )}
              <div className="border-t border-[var(--line)] pt-4">
                <dt className="text-[0.7rem] uppercase tracking-[0.18em] text-muted">Outcome</dt>
                <dd className="mt-1 font-bold text-[var(--reject)]">No deal on air</dd>
              </div>
              {p.formerWebsite && (
                <div className="border-t border-[var(--line)] pt-4">
                  <dt className="text-[0.7rem] uppercase tracking-[0.18em] text-muted">Former site</dt>
                  <dd className="mt-1">
                    <a
                      className="break-all text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
                      href={p.formerWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {p.formerWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </aside>
        </div>

        {/* Opt-in CTA */}
        <div
          className="reveal glow mt-16 overflow-hidden rounded-3xl border border-[var(--line-strong)] bg-gradient-to-br from-fin to-fin-2 p-8 md:p-10"
          style={{ animationDelay: "200ms" }}
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <div className="kicker mb-2">Founder of {p.companyName}?</div>
              <h2 className="font-display text-2xl font-bold leading-tight md:text-3xl">
                Claim 80% of <span className="text-accent">${p.symbol}</span> creator fees.
              </h2>
              <p className="mt-3 font-body text-ink/75">
                This tribute was built for you. Opt in and the lion's share of trading fees is
                yours — transparent and on-chain.
              </p>
            </div>
            <a
              href="/onboard"
              className="group inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-accent px-7 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-[#04181d] transition-transform hover:-translate-y-0.5"
            >
              Opt in
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </a>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mb-4 mt-12 rounded-xl border border-[var(--line)] bg-fin/40 p-5">
          <div className="kicker mb-2">Disclaimer</div>
          <p className="font-mono text-[0.78rem] leading-relaxed text-muted">{DISCLAIMER}</p>
        </div>
      </div>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-[0.18em] text-muted">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}

/* Only render the episode block (with heading) when a URL exists. */
function EpisodeWrap({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="mt-10">
      <div className="kicker mb-3">Watch the pitch</div>
      <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
        <EpisodeEmbed url={url} />
      </div>
    </div>
  );
}
