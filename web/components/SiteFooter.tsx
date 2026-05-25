import { DISCLAIMER } from "@/lib/disclaimer";

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-[var(--line)]">
      <div className="ledger-grid absolute inset-0 opacity-[0.35]" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-6 py-12 md:py-16">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <div className="flex items-center gap-2.5">
              <span className="signal-dot inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />
              <span className="font-display text-2xl font-semibold tracking-tight">
                PUMP<span className="text-accent">TANK</span>
              </span>
            </div>
            <p className="mt-4 font-mono text-[0.78rem] leading-relaxed text-muted">
              {DISCLAIMER}
            </p>
          </div>

          <nav aria-label="Footer" className="shrink-0">
            <div className="kicker mb-4">Navigate</div>
            <ul className="space-y-2.5 font-mono text-sm">
              <li>
                <a
                  href="/"
                  className="group inline-flex items-center gap-2 text-ink/80 transition-colors hover:text-accent"
                >
                  <span className="text-accent/60 transition-transform group-hover:translate-x-0.5">→</span>
                  The Archive
                </a>
              </li>
              <li>
                <a
                  href="/onboard"
                  className="group inline-flex items-center gap-2 text-ink/80 transition-colors hover:text-accent"
                >
                  <span className="text-accent/60 transition-transform group-hover:translate-x-0.5">→</span>
                  Founder Opt-In
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--line)] pt-6 font-mono text-[0.7rem] uppercase tracking-[0.2em] text-muted/70 sm:flex-row sm:items-center sm:justify-between">
          <span>© PUMPTANK — A Tribute Index</span>
          <span className="text-muted/60">No deal. Still iconic.</span>
        </div>
      </div>
    </footer>
  );
}
