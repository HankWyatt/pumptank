/* Click-to-copy contract address, styled for the Deep-Water mono aesthetic.
   Always copies the full mint; `truncate` shows a middle-elided form for tight spots. */
"use client";
import { useState } from "react";

export function CopyableCA({ mint, label, truncate = false }: { mint: string; label?: string; truncate?: boolean }) {
  const [copied, setCopied] = useState(false);
  const shown = truncate ? `${mint.slice(0, 6)}…${mint.slice(-4)}` : mint;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(mint);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked (e.g. insecure context) — no-op */
    }
  };

  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs">
      {label && <span className="uppercase tracking-[0.14em] text-muted">{label}</span>}
      <button
        type="button"
        onClick={copy}
        title="Copy contract address"
        aria-label={`Copy contract address ${mint}`}
        className="group inline-flex items-center gap-2 border border-[var(--line)] bg-[rgba(8,22,34,0.5)] px-2.5 py-1 text-ink-soft transition-colors hover:border-[var(--teal-2)] hover:text-[var(--teal-2)]"
      >
        <span className={truncate ? "" : "break-all"}>{shown}</span>
        <span aria-hidden className="shrink-0 text-muted group-hover:text-[var(--teal-2)]">
          {copied ? "copied ✓" : "⧉"}
        </span>
      </button>
    </span>
  );
}
