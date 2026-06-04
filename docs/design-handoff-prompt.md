# PUMPTANK — design upgrade handoff prompt

> Paste everything below the line into Claude (design). It is self-contained.

---

You are a senior product designer + front-end engineer. Upgrade the front-end of an existing, working site. Preserve its identity and elevate it — do not redesign from a blank page, and do not drift toward generic AI/crypto aesthetics (no neon, glassmorphism, purple gradients, glowing orbs, or dark "web3" chrome).

## What the site is
PUMPTANK is a fan-built, **parody/tribute** archive. Every notable Shark Tank (US) pitch that got **"no deal"** on air is memorialized as its own Solana token. The tone is wry, editorial, transparent — *"Rejected on air, redeemed on-chain."* It is NOT financial advice and is unaffiliated with Shark Tank or the founders; those disclaimers must stay visible site-wide. Never call a company "failed" — the fact is only ever **"no deal."**

## The established brand — "The No-Deal Ledger"
A warm financial **broadsheet newspaper** that happens to live on-chain. Keep and extend this language:
- **Palette:** newsprint paper `#f4edda`, near-black ink `#17120b`, editorial **vermilion `#c3361d` = the rejection**, deep **ink-teal `#0c5b48` = the second life on-chain**. No other hues.
- **Type:** Bodoni Moda (Didone display), Newsreader (body serif), IBM Plex Mono (datelines, tickers, ledger data).
- **Devices already in use on the homepage:** masthead nameplate + dateline, drop-cap lede, "By the Numbers" ledger box, dark "Live Tape" ticker, hard **squared** borders (`border-2 border-ink`), hard **offset** shadows (`shadow-[6px_6px_0_0_ink]`), inked rubber **"NO DEAL" stamps**, double rules, halftone dot fields, "Fig. 1" captioned diagrams, press-on-click buttons. Newsprint paper grain + tooth texture is global.

## The single most important job
The **homepage** (`web/app/page.tsx`) is fully on this broadsheet language and is the reference standard. The **token detail page** (`web/app/token/[id]/page.tsx`) and the **onboard page** (`web/app/onboard/page.tsx`) still use the *old, pre-redesign* idiom — soft `rounded-2xl/3xl` cards, `bg-gradient-to-br` fills, `glow` shadows, rounded-full pills. They inherit the new colors but not the new grammar, so they feel like a different site.
**Rebuild those two pages in the broadsheet language** so the whole site reads as one publication: squared rules instead of rounded cards, offset ink shadows instead of soft glows, stamps/datelines/Fig. captions, the fee split rendered as a ruled "Fig." bar like the homepage. Also tighten `web/components/SiteMasthead.tsx`, `SiteFooter.tsx`, and the `ProductCard`/`ProductGrid` so the archive grid feels like a true indexed newspaper classifieds section.

## Then elevate the whole thing
Make it genuinely distinctive and portfolio-grade: stronger editorial hierarchy and rhythm, considered mobile/responsive layout (the broadsheet should reflow gracefully, not just shrink), tasteful motion that respects `prefers-reduced-motion`, real focus states, and polished OG/social cards per token. Push the "newspaper of rejected ideas" concept further wherever it earns it.

## Hard constraints
- **Stack:** Next.js 14 App Router, **static export (`output: export`)**, Tailwind, TypeScript. No SSR/server actions, no router features incompatible with static export.
- Keep the data contract: pages read from `web/lib/products.ts` (sourced from `data/products.json`) — fields like `name, symbol, description, season, episode, industry, companyName, founders, formerWebsite, mint, imagePath, youtubeUrl`. Each token has a 1000×1000 PNG card at `imagePath`.
- Reuse the existing CSS tokens/utilities in `web/app/globals.css` and `web/tailwind.config.ts`; extend them rather than forking a new system. Add minimal dependencies — justify any.
- Keep all disclaimer text, the "no deal" (never "failed") framing, the 1.5%-single-dev-buy / 80-20 founder-fee messaging, and accessibility (labels, contrast, keyboard) intact.
- The build must stay green and the existing `web/` tests must pass.

## What to deliver
1. A short design rationale (what you changed and why, per page).
2. Production-ready code for the rebuilt token + onboard pages, updated shared components (masthead, footer, product card/grid), and any `globals.css`/Tailwind additions.
3. Before/after notes and any new reusable utilities, so the homepage and the rest stay one coherent system.
