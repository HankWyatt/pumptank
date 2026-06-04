const SECTIONS = [
  { label: "The Archive", href: "/#archive" },
  { label: "How It Works", href: "/#mechanics" },
  { label: "Founders", href: "/onboard/" },
  { label: "Disclaimer", href: "/#fine-print" },
];

export function SiteMasthead() {
  return (
    <header className="relative border-b border-[var(--line)] bg-[rgba(6,18,30,0.72)] backdrop-blur-md">
      {/* Dateline strip */}
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2">
        <span className="dateline hidden sm:inline">Vol. I · No. 100</span>
        <span className="dateline">Solana Edition</span>
        <span className="dateline inline-flex items-center gap-2">
          <span className="signal-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--red)]" aria-hidden />
          Live Index
        </span>
      </div>

      {/* Nameplate */}
      <div className="rule-double mx-auto max-w-6xl px-6">
        <a href="/" className="group block py-4 text-center">
          <span className="dateline block text-[0.6rem] text-muted">The No-Deal Ledger</span>
          <span className="font-display text-[clamp(2.1rem,7.5vw,4.6rem)] uppercase leading-[0.9] tracking-[0.04em] text-ink">
            Pump<span className="text-[var(--teal)]">tank</span>
          </span>
        </a>
      </div>

      {/* Section index */}
      <nav aria-label="Sections" className="mx-auto max-w-6xl px-6">
        <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 py-2.5 font-mono text-[0.66rem] uppercase tracking-[0.18em] text-muted">
          {SECTIONS.map((s, i) => (
            <li key={s.href} className="flex items-center gap-x-5">
              {i > 0 && <span className="text-[rgba(140,196,224,0.28)]" aria-hidden>◆</span>}
              <a href={s.href} className="transition-colors hover:text-[var(--teal-2)]">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
