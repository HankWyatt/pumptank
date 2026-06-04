# PUMPTANK web — Claude-design handoff: review + integration

**Date:** 2026-06-04 · **Source:** `pumptank.zip` (handoff from Claude design)

## Review verdict
- **Code quality:** strong. TS-correct, `output: export`-safe, guardrails intact
  ("no deal" never "failed", disclaimers, single 1.5% dev buy, 80/20 messaging).
- **Data contract:** verified true — `pitch.ask_amount`, `ask_equity`,
  `valuation_requested`, `air_date`, `selection.reach` are all **100/100 populated**
  across the included records. The extended `lib/products.ts` is cleanly additive.
- **Art direction:** the handoff is a **"Deep-Water Edition"** — dark navy/aqua/
  seafoam + crimson, **Anton + Archivo** fonts. (This replaced the prior light
  "No-Deal Ledger" broadsheet. Per the user, this is the intended, approved design.)
- **Bugs found in the as-shipped TSX (fixed during integration):**
  1. It patched CSS vars but **not `tailwind.config.ts`** (hard-coded light hexes),
     and mixed `bg-ink`/`text-ink`/`border-2 border-ink` (Tailwind, stayed near-black)
     with `var(--paper)` (flipped dark) → **dark-on-dark / invisible** bars, borders,
     and ticker text. The reference prototype (`styles.css`/`components.css`) correctly
     uses `var(--navy)` bars + `var(--ink)` light text + `var(--line-strong)` keylines.
  2. Hard offset shadows `shadow-[…0_0_var(--ink)]` → bright/garish on dark.
  3. Footer colophon still credited "Bodoni Moda & Newsreader" (the removed fonts).

## What was integrated (into `web/`)
- `app/globals.css` — full dark "Deep-Water" theme (palette, body wash, helper
  re-skins, `.ledger-row`/`.reach-meter`/`.hatch-20`/`.og*`/`.run-head`); the
  `.reveal` fix (opacity:1 always — no blank frame in bg tabs / print / OG capture).
- `tailwind.config.ts` — colour utilities **bound to the CSS vars** (the core fix).
- `app/layout.tsx` — fonts → **Anton / Archivo / IBM Plex Mono**.
- `lib/products.ts` — extended with `airDate`, `ask`, `askEquity`, `valuation`, `reach`.
- Pages: `token/[id]` (dossier — typographic hero, "The Ask" ledger, Fig. fee bar,
  OG plate, related strip), `onboard` (Founders' Desk).
- Components: `ProductCard`, `ProductGrid` (Plates/Index toggle + sector filter),
  `SiteFooter`, `SiteMasthead`, `RunningHead` (new), `OgPlate` (new), `page.tsx`
  (homepage re-skinned dark, ticker fixed).
- Token bars/borders/shadows converted to dark-correct tokens to match the prototype.

## Verification
- `npm run build` → **105 static pages**, types valid, `output: export` clean.
- `npm run test` → **8/8 pass**.
- Exported CSS confirmed to carry the dark `:root` (`--paper:#06121e`, `--teal:#2ad8c0`),
  no light-palette leakage; Anton/Archivo present in token pages.
- **Not yet done:** visual QA in a browser (no headless browser here). Run `npm run dev`.

## Reversibility
- The prior **light** redesign was **uncommitted** and is now overwritten. It survives
  ONLY at `/tmp/web-snapshot-light/` (ephemeral). `git checkout` restores the older
  committed teal "broadcast archive", **not** the light broadsheet.
