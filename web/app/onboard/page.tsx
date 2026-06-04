/* web/app/onboard/page.tsx · the "Founders' Desk" opt-in (deep-water edition). */
import type { Metadata } from "next";
import { DISCLAIMER } from "@/lib/disclaimer";
import { RunningHead } from "@/components/RunningHead";

// TODO: replace with the real opt-in form URL
const FORM_URL = "https://tally.so/r/REPLACE_ME";

export const metadata: Metadata = {
  title: "Founder Opt-In · PUMPTANK",
  description:
    "Founders of featured Shark Tank pitches can claim 80% of their tribute token's creator fees.",
};

const STEPS = [
  { n: "01", t: "Verify it's you", d: "Submit the short form below. We confirm you're the founder of record. No cost, no token purchase, ever." },
  { n: "02", t: "We route the fees", d: "Your wallet is registered as the 80% recipient of creator trading fees for your tribute token. Set on-chain, in the open." },
  { n: "03", t: "It settles to you", d: "Fees accrue and settle to your wallet automatically. Opt out at any time. The door stays unlocked." },
];

export default function OnboardPage() {
  return (
    <main className="relative">
      <RunningHead middle="Founders' Desk" right="Form 80-20" />

      <div className="mx-auto max-w-4xl px-6 pb-12 pt-5">
        <a
          href="/#archive"
          className="group inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-muted transition-colors hover:text-[var(--teal-2)]"
        >
          <span className="transition-transform group-hover:-translate-x-0.5">←</span> Back to the Archive
        </a>

        {/* HERO */}
        <header className="reveal mt-7">
          <div className="flex items-center gap-3">
            <span className="signal-dot inline-block h-2.5 w-2.5 rounded-full bg-[var(--red)]" aria-hidden />
            <span className="kicker">Founders&apos; Desk · Form 80-20</span>
          </div>
          <h1 className="mt-5 font-display text-[clamp(2.8rem,9vw,5.4rem)] uppercase leading-[0.92] tracking-[0.01em]">
            Claim your <span className="text-[var(--teal)]">80%.</span>
          </h1>
          <p className="mt-6 max-w-2xl font-body text-lg leading-relaxed text-ink-soft">
            You pitched. You didn&apos;t get the deal. The internet remembered anyway. If you founded
            one of the companies in the PUMPTANK archive, you can claim the majority share of your
            tribute token&apos;s creator fees, openly and on-chain.
          </p>
        </header>

        <hr className="my-12 border-0 border-t border-[var(--line-strong)]" />

        {/* THE SPLIT */}
        <section aria-labelledby="split">
          <div className="kicker">How the Fee Share Works</div>
          <h2 id="split" className="mt-2 font-display text-3xl uppercase tracking-tight md:text-[2.6rem]">
            An 80 / 20 split, in your favor.
          </h2>

          <div className="mt-7 grid gap-4 sm:grid-cols-[4fr_1fr]">
            <div className="border border-[var(--line-strong)] bg-[var(--paper-2)] p-7">
              <div className="font-display text-[clamp(3rem,9vw,5rem)] leading-[0.85] text-[var(--teal)]">80%</div>
              <h3 className="mt-2 font-body text-xl font-bold">Goes to you, the founder</h3>
              <p className="mt-2 font-body leading-relaxed text-ink-soft">
                Once you opt in and verify, 80% of all creator trading fees route to you. Recognition
                for the idea that earned the spotlight, even without a handshake.
              </p>
            </div>
            <div className="border border-[var(--line-strong)] bg-[rgba(18,47,73,0.35)] p-7">
              <div className="font-display text-[clamp(3rem,9vw,5rem)] leading-[0.85] text-muted">20%</div>
              <h3 className="mt-2 font-body text-xl font-bold">Funds the index</h3>
              <p className="mt-2 font-body leading-relaxed text-ink-soft">
                The remaining fifth covers marketing and growth, keeping the archive alive so the
                rest of the no-deal class gets discovered too.
              </p>
            </div>
          </div>

          <figure className="mt-6">
            <div className="flex h-[5.5rem] w-full overflow-hidden border border-[var(--line-strong)] font-mono text-sm font-semibold uppercase tracking-[0.12em]">
              <div className="flex items-center justify-center bg-[var(--teal)] text-[var(--on-accent)]" style={{ width: "80%" }}>
                80% · You
              </div>
              <div className="hatch-20 flex items-center justify-center border-l border-[var(--line-strong)] text-ink" style={{ width: "20%" }}>
                20% · Growth
              </div>
            </div>
            <figcaption className="mt-3 font-mono text-[0.72rem] italic tracking-wide text-muted">
              Fig. 1 · Creator-fee allocation, per token, upon verified founder opt-in.
            </figcaption>
          </figure>
        </section>

        {/* HOW IT SETTLES */}
        <section className="mt-16">
          <div className="kicker">How It Settles</div>
          <h2 className="mt-2 font-display text-3xl uppercase tracking-tight md:text-[2.6rem]">
            Three steps, fully transparent.
          </h2>
          <ol className="mt-8 grid gap-x-10 gap-y-8 border-t-2 border-[var(--line-strong)] pt-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.n} className={i > 0 ? "md:col-rule md:pl-10" : ""}>
                <div className="flex items-baseline gap-3">
                  <span className="font-display text-5xl leading-none text-[var(--red)]">{s.n}</span>
                  <span className="h-px flex-1 translate-y-[-0.4em] bg-[var(--line)]" aria-hidden />
                </div>
                <h3 className="mt-4 font-body text-2xl font-bold">{s.t}</h3>
                <p className="mt-3 font-body leading-relaxed text-ink-soft">{s.d}</p>
              </li>
            ))}
          </ol>

          <div className="mt-8 grid border border-[var(--line-strong)] sm:grid-cols-3">
            {["No upfront cost, ever", "Transparent & on-chain", "Opt out any time"].map((b, i) => (
              <div
                key={b}
                className={`flex items-start gap-2.5 px-5 py-4 font-mono text-sm text-ink-soft ${
                  i < 2 ? "border-b border-[var(--line)] sm:border-b-0 sm:border-r" : ""
                }`}
              >
                <span className="font-bold text-[var(--teal)]" aria-hidden>✓</span>
                {b}
              </div>
            ))}
          </div>
        </section>

        {/* FORM */}
        <section className="mt-16" aria-labelledby="form">
          <div className="kicker">Step 1 of 1</div>
          <h2 id="form" className="mt-2 font-display text-3xl uppercase tracking-tight md:text-[2.6rem]">
            Tell us who you are.
          </h2>
          <p className="mt-3 max-w-2xl font-body text-lg leading-relaxed text-ink-soft">
            Fill out the short verification form and the desk will be in touch to set up your fee share.
          </p>

          <div className="glow mt-7 border border-[var(--line-strong)]">
            <div className="flex items-center justify-between bg-[var(--navy)] px-5 py-3 font-mono text-xs uppercase tracking-[0.2em] text-ink">
              <span>Form 80-20 · Founder Verification</span>
              <span className="text-[var(--teal-2)]">● Secure</span>
            </div>
            <iframe
              src={FORM_URL}
              title="PUMPTANK founder opt-in form"
              className="h-[760px] w-full bg-white"
              loading="lazy"
            />
          </div>
          <p className="mt-3 text-center font-mono text-xs text-muted">
            Trouble loading the form?{" "}
            <a href={FORM_URL} target="_blank" rel="noopener noreferrer" className="editorial-link text-[var(--teal-2)]">
              Open it in a new tab
            </a>
            .
          </p>
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
