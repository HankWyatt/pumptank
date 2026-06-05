/* web/components/RunningHead.tsx - interior-page folio strip. */
export function RunningHead({ middle, right }: { middle: string; right: string }) {
  return (
    <div className="border-b border-[var(--line)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <span className="run-head hidden sm:inline">The Tribute Ledger</span>
        <span className="run-head" style={{ letterSpacing: "0.3em", color: "var(--ink-soft)" }}>
          {middle}
        </span>
        <span className="run-head">{right}</span>
      </div>
    </div>
  );
}
