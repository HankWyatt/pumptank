import type { Metadata } from "next";
import { DISCLAIMER } from "@/lib/disclaimer";

// TODO: replace with the real opt-in form URL
const FORM_URL = "https://tally.so/r/REPLACE_ME";

export const metadata: Metadata = {
  title: "Founder Opt-In — PUMPTANK",
  description: "Founders of featured Shark Tank pitches can claim 80% of their tribute token's creator fees.",
};

export default function OnboardPage() {
  return (
    <main className="relative">
      <div className="ledger-grid absolute inset-x-0 top-0 h-80 opacity-25" aria-hidden />

      <div className="relative mx-auto max-w-4xl px-6 pt-12">
        <a
          href="/"
          className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-accent"
        >
          <span className="transition-transform group-hover:-translate-x-0.5">←</span>
          The Archive
        </a>

        {/* Header */}
        <div className="reveal mt-8">
          <div className="flex items-center gap-3">
            <span className="signal-dot inline-block h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
            <span className="kicker">Founder Opt-In</span>
          </div>
          <h1 className="mt-5 font-display text-[clamp(2.4rem,7vw,4.5rem)] font-black leading-[0.95] tracking-[-0.02em]">
            Claim your <span className="italic text-accent">80%.</span>
          </h1>
          <p className="mt-6 max-w-2xl font-body text-lg leading-relaxed text-ink/80">
            You pitched. You didn&apos;t get the deal. The internet remembered anyway. If you
            founded one of the companies in the PUMPTANK archive, you can claim the majority share
            of your tribute token&apos;s creator fees — openly and on-chain.
          </p>
        </div>

        {/* The split, explained */}
        <section className="reveal mt-14" style={{ animationDelay: "100ms" }} aria-labelledby="split">
          <div className="kicker mb-3">How the fee share works</div>
          <h2 id="split" className="font-display text-3xl font-bold tracking-tight">
            An 80 / 20 split, in your favor.
          </h2>

          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="relative overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-fin/60 p-7">
              <div className="font-display text-6xl font-black text-accent">80%</div>
              <h3 className="mt-3 font-display text-xl font-semibold">Goes to you, the founder</h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-ink/70">
                Once you opt in and verify, 80% of all creator trading fees from your token route
                to you. It&apos;s recognition for the idea that earned the spotlight, even without
                a handshake.
              </p>
            </div>
            <div className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-fin/40 p-7">
              <div className="font-display text-6xl font-black text-muted">20%</div>
              <h3 className="mt-3 font-display text-xl font-semibold">Funds the index</h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-ink/70">
                The remaining 20% covers marketing and growth — keeping the archive alive so the
                rest of the no-deal class gets discovered too.
              </p>
            </div>
          </div>

          {/* Visual bar */}
          <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)]">
            <div className="flex h-11 w-full font-mono text-xs font-bold">
              <div className="flex items-center justify-center bg-accent text-[#04181d]" style={{ width: "80%" }}>
                80% · YOU
              </div>
              <div className="flex items-center justify-center bg-accent-dim/40 text-ink" style={{ width: "20%" }}>
                20% · GROWTH
              </div>
            </div>
          </div>

          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              "No upfront cost, ever",
              "Transparent & on-chain",
              "Opt out any time",
            ].map((point) => (
              <li
                key={point}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-fin/30 px-4 py-3 font-mono text-sm text-ink/80"
              >
                <span className="text-accent" aria-hidden>
                  ✓
                </span>
                {point}
              </li>
            ))}
          </ul>
        </section>

        {/* Form embed */}
        <section className="reveal mt-16" style={{ animationDelay: "180ms" }} aria-labelledby="form">
          <div className="kicker mb-3">Step 1 of 1</div>
          <h2 id="form" className="font-display text-3xl font-bold tracking-tight">
            Tell us who you are.
          </h2>
          <p className="mt-3 max-w-2xl font-body text-ink/70">
            Fill out the short verification form below and the team will be in touch to set up your
            fee share.
          </p>

          <div className="glow mt-7 overflow-hidden rounded-3xl border border-[var(--line-strong)] bg-fin/40 p-2">
            <iframe
              src={FORM_URL}
              title="PUMPTANK founder opt-in form"
              className="h-[760px] w-full rounded-2xl bg-white"
              loading="lazy"
            />
          </div>
          <p className="mt-3 text-center font-mono text-xs text-muted">
            Trouble loading the form?{" "}
            <a
              href={FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2"
            >
              Open it in a new tab
            </a>
            .
          </p>
        </section>

        {/* Disclaimer */}
        <div className="mb-4 mt-16 rounded-xl border border-[var(--line)] bg-fin/40 p-5">
          <div className="kicker mb-2">Disclaimer</div>
          <p className="font-mono text-[0.78rem] leading-relaxed text-muted">{DISCLAIMER}</p>
        </div>
      </div>
    </main>
  );
}
