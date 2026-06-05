/* web/components/SiteFooter.tsx · broadsheet colophon (deep-water). */
import { DISCLAIMER } from "@/lib/disclaimer";

const NAV = [
  { href: "/#archive", label: "The Archive" },
  { href: "/#mechanics", label: "How It Works" },
  { href: "/onboard/", label: "Founder Opt-In" },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 border-t border-[var(--blue)] bg-[#050f1a]">
      <div className="mx-auto max-w-6xl px-6 py-14 md:py-16">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <div className="flex items-center gap-2.5">
              <span className="signal-dot inline-block h-2 w-2 rounded-full bg-[var(--red)]" aria-hidden />
              <span className="font-display text-2xl uppercase tracking-wide">
                Pump<span className="text-[var(--teal)]">tank</span>
              </span>
            </div>
            <p className="mt-2 dateline">The Tribute Ledger · A Tribute Archive</p>
            <p className="mt-5 font-mono text-[0.76rem] leading-relaxed text-muted">{DISCLAIMER}</p>
          </div>

          <nav aria-label="Footer" className="shrink-0">
            <div className="kicker mb-4">Navigate</div>
            <ul className="flex flex-col gap-2.5 font-mono text-sm">
              {NAV.map((l) => (
                <li key={l.href}>
                  <a href={l.href} className="editorial-link text-ink">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-[var(--line)] pt-6 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>© MMXXVI PUMPTANK · A Tribute Index</span>
          <span>Set in Anton &amp; Archivo</span>
          <span className="text-[var(--red)]">Pitched. Tributed. On-chain.</span>
        </div>
      </div>
    </footer>
  );
}
