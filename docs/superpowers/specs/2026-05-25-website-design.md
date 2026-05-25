# Website (static Next.js site) — Design Spec

**Date:** 2026-05-25
**Status:** Draft for review
**Sub-project:** 5 of 5 (the public site — the last one)

---

## Project context (PUMPTANK)

The pipeline produced 100 ranked no-deal tributes (`data/products.json` + `data/token_images/`),
the launcher (#3) mints them, and #4 routes creator fees. **#5 is the public face:** a static
site presenting the hub ($PUMPTANK) and one tribute page per token, carrying the project's
disclaimers, and giving founders an entry point to opt in (which feeds #4's registry). It
builds **now** (pre-launch) and the per-token pump.fun links light up post-launch once
`token.mint` is populated.

Scope decisions (brainstorm): **static site** (no custom backend — opt-in is an embedded
third-party form, hand-vetted into #4's registry); stack **Next.js App Router with
`output: "export"`** (static HTML for all pages).

## Goal

A static, deployable site — hub + 100 product pages + an onboard page — generated from
`data/products.json`, on the PUMPTANK brand, with disclaimers on every page and graceful
handling of the two data gaps (no episode URLs yet; no mints until launch).

**Done means:** `next build` produces a static `out/` containing the hub, `/onboard`, and a
page per selected token; each product page renders its card, the no-deal fact, the
description/disclaimer, and a pump.fun link (or "launching soon"); the hub grid is
searchable/filterable; disclaimers appear site-wide.

## Non-goals

- **Custom backend / auth / DB** — opt-in is an embedded third-party form (Tally/Formspree).
- **Deployment/hosting** itself (static host chosen at deploy time; the build target is `out/`).
- **Sourcing episode YouTube URLs** — embeds render only if `youtube_url` is present (none now).
- On-chain actions (#3/#4); editing `products.json` (read-only consumer).

## Inputs

`data/products.json` (the `include == true` records: `token.{name, symbol, description, mint}`,
`season`, `episode`, `industry`, `company_name`, `founders`, `pitch.*`, `media.{image_url,
former_website, youtube_url}`, `selection.rank`) and `data/token_images/*.png`. All read-only at build.

## Architecture

A new **`web/`** Next.js project (App Router, TypeScript, `output: "export"`, Tailwind for styling):
- **`web/lib/products.ts`** — build-time loader: read `../data/products.json`, filter
  `include`, map to a typed `Product` view model; `getAllProducts()`, `getProduct(id)`.
  Pure + unit-testable on a fixture.
- **Prebuild step** (`web/scripts/copy-assets.mjs`, run before `next build`): copy
  `../data/token_images/` → `web/public/token_images/` so the static export serves them at
  `/token_images/<id>.png`.
- **Pages (App Router):**
  - `app/page.tsx` — **Hub `/`**: concept + how-it-works + disclaimer + `<ProductGrid>`.
  - `app/token/[id]/page.tsx` — **Product pages**: `generateStaticParams()` returns all 100
    ids; each renders `<ProductDetail>`. `generateMetadata()` per page (title/OG = token name + card image).
  - `app/onboard/page.tsx` — **Opt-in**: the 80/20 explainer + the embedded form.
- **Components:**
  - `ProductGrid` (client component/island) — the searchable/filterable grid of cards
    (filter by name/ticker/industry; the only interactive piece).
  - `ProductCard` — card image + name + `$TICKER` + S/E + industry, links to the product page.
  - `ProductDetail` — image, name + `$TICKER`, the no-deal fact, description, industry,
    founders + former-website (when present), `<MintLink>`, `<EpisodeEmbed>`, opt-in CTA.
  - `MintLink` — `https://pump.fun/<mint>` when `token.mint` present, else a "launching soon" pill.
  - `EpisodeEmbed` — a YouTube iframe when `youtube_url` present, else renders nothing.
  - `SiteFooter` — the disclaimer (site-wide) + nav.
  - `Disclaimer` — the shared legal text constant.
- **Brand/look:** the PUMPTANK palette (`#0B2027` bg, `#33D6B1` accent, matching the token
  cards); distinctive, polished, responsive, accessible. **The plan invokes the
  `frontend-design` skill at implementation** for the visual quality (not a generic template).

## Data handling & the two gaps

- **Mints (`token.mint` all null pre-launch):** `MintLink` shows "Launching soon" until a mint
  is present; a post-launch `products.json` re-build lights up the real `pump.fun/<mint>` links.
- **Episode embeds (`youtube_url` all null):** `EpisodeEmbed` renders nothing when absent —
  the section is simply omitted. If URLs are sourced later, the embeds appear on re-build.
- **founders / former_website (86%):** rendered only when present; absent → omitted.

## Disclaimers (legal posture)

A single `Disclaimer` constant, shown in the site footer on **every** page and expanded on the
hub + each product page: *unaffiliated fan tribute & parody; not affiliated with or endorsed by
the companies, their founders, or Shark Tank / ABC / Sony; not financial advice; no promise of
value.* (Same family as the on-card/description disclaimer; the owner has signed off on the
legal posture.)

## Testing plan

**Unit (`vitest` + `@testing-library/react`, jsdom):**
- `lib/products`: parses + filters `include`; `getProduct` returns the right record / undefined.
- `MintLink`: `token.mint` present → an `https://pump.fun/<mint>` anchor; absent → "launching soon", no link.
- `EpisodeEmbed`: `youtube_url` present → an iframe; absent → renders nothing.
- `ProductGrid`: typing a query filters cards by name/ticker/industry.
**Build smoke (in the plan's final task):** `next build` exits 0 and `out/` contains
`index.html`, `onboard.html` (or `onboard/index.html`), and a page for each of the 100 ids;
spot-check one product page's HTML contains the token name + "no deal" + the disclaimer.

## Open questions

- Opt-in form provider (Tally vs Formspree) — chosen at build; the embed URL is a config constant.
- Hosting target + whether a `basePath` is needed (deploy-time; affects asset URLs).
- Sourcing per-episode YouTube URLs (future enrichment; the site already handles them gracefully).

## Risks

- **Re-build needed post-launch** to populate mint links — a documented one-step refresh.
- **Third-party opt-in form** (availability/privacy) — acceptable for a low-volume, hand-vetted
  flow; no PII stored by us beyond what we vet into the registry.
- **Image volume** (100 PNGs ~4.4 MB) — fine for static hosting; copied into `public/` at prebuild.
- **Asset paths under a subpath host** — mitigated by configuring `basePath`/relative paths at deploy.
