# PUMPTANK Website — All-Products + Fee-Copy Update — Design Spec

_Date: 2026-06-05. Updates the `web/` site for three things: (1) remove the stale "1.5% dev-buy" copy (products are create-only now), (2) surface the 10% onboarding commission **low-key** (copy only), (3) make the site accurate for all ~1,481 products (deal + no-deal), not just "100 no-deal pitches." Status: design, pending approval._

## Context / coordination

`web/` is the user's active "Deep-Water Edition" WIP — files are changing under us (e.g. `lib/products.ts` became null-safe for `selection` mid-session). **Implementation must re-read each file against its live state before editing, change copy/logic only, and preserve the existing styling/structure.** This spec is design-level (what + where), not frozen line edits.

## Decisions (locked with the user)

- **10% commission = copy only.** No referral links / wallet capture / tracking. Attribution stays operator-side via `feescli optin <id> <founder> [referrer]` (already built). Mention it **low-key** — *not* in founders' faces (creators on the opt-in/token pages shouldn't be sold the commission); just visible "somewhere in general" so people who onboard founders know they can reach out.
- **All-products accuracy = fix it, mirroring the card precedent.** The token-image pipeline already does: no-deal → vermilion "NO DEAL" badge; deal → neutral (no badge). The site mirrors this per product: no-deal keeps the full "No Deal" treatment; deal products render **neutral** (no "No Deal" stamp/outcome). The global count/framing stops claiming "100 no-deal."
- **Founder still gets 80%.** The model is 80/10/10 (founder / index / onboarder) with a referrer, or 80/20 (founder / index) without. Founder-facing surfaces emphasize the 80%; the 10/10 breakdown is a general-page detail.

## Brand: broadened to "The Tribute Ledger" (resolved)

The user chose **(B) broaden the brand**. The PUMPTANK wordmark stays; the sub-brand line **"The No-Deal Ledger" → "The Tribute Ledger"** everywhere (own-brand, no trademark in the masthead, covers deal + no-deal). Full sweep:
- `app/layout.tsx`: `<title>` "PUMPTANK · The No-Deal Ledger" → "… · The Tribute Ledger"; meta description "…pitches that got no deal." → broaden ("…Shark Tank pitches — deal or no deal.").
- `components/RunningHead.tsx`, `components/SiteMasthead.tsx`, `components/SiteFooter.tsx`: "The No-Deal Ledger" → "The Tribute Ledger". Masthead "Vol. I · No. 100" → real count / neutral. Footer tagline "No deal. Still iconic." → broadened tribute line.
- `components/OgPlate.tsx`: "The No-Deal Ledger · Pitch No." → "The Tribute Ledger · …"; its "No Deal" stamp → conditional on `gotDeal`.
- `app/globals.css` header comment (cosmetic) → update the "No-Deal Ledger / rejected pitches" description.
- `app/opengraph-image.alt.txt` + `app/twitter-image.alt.txt`: "…got no deal." → broadened copy.

## Data layer — `lib/products.ts`

- Add `gotDeal: boolean` to `Product` (map from raw `got_deal`; raw already carries it). Add `got_deal` to `RawRecord`.
- Keep the null-safe `selection?.rank/reach` access (already present).
- **Sort:** no-deal products by `rank` first (preserves the "ranked by reach" tribute lead), then deal products after (by `reach`/name; their `rank` is null). Document that deals trail the ranked no-deal core. (If the user prefers chronological or interleaved, adjust.)

## Per-product treatment (mirror the cards)

Gate every "No Deal" element on `!p.gotDeal`; deal products render neutral.
- `components/ProductCard.tsx`: the `stamp … "No Deal"` (line ~21) → only when `!p.gotDeal`. (The `No. {rank}` plate: rank is null for deals → show e.g. company index or hide; decide in impl.)
- `components/ProductGrid.tsx`: same "No Deal" / rank / reach-meter handling for deal rows (reach is null → hide the meter for deals).
- `app/token/[id]/page.tsx`: the "No Deal" stamp (line ~100), the `No deal` Fact (~137), `Outcome: "No deal on air"` (~156), and the "walked away with…" narrative (~78) → conditional. Deal product shows its real outcome (neutral, e.g. "Made a deal on air" / omit the verdict stamp) and **no** "No Deal" stamp.

## Global framing — homepage `app/page.tsx`

- **Remove the 1.5% dev-buy copy:** stat chip `{ v: "1.5%", l: "Dev buy · capped" }` (line ~13) → an accurate chip (e.g. `{ v: "0", l: "Insider buys" }` / "create-only"). Mechanics **card 01** "A single 1.5% dev buy" (line ~124) → a "Create-only — zero insider buys" card (every product launches create-only; the builders take none of the supply).
- **Hero lede** (line ~43): "one hundred Shark Tank pitches that walked away empty-handed" → all-products framing (every Shark Tank pitch, deal or no deal, gets a tribute token), keeping the no-deal-tribute soul.
- **Ticker** (line ~103): `▼ no deal` → per item: no-deal shows `▼ no deal`, deal shows a neutral marker (e.g. `✓ deal`).
- **Archive heading** (line ~205) "100 rejected pitches, indexed." → the real count/framing (`{products.length}` pitches, indexed). "Ranked by reach" caption stays (the no-deal core is still rank-led).

## Fee model + commission

- **Homepage mechanics (general audience):** cards 02/03 + Fig. 1 communicate 80/10/10. Card 02 "80% → founders." Card 03 reframed: the remaining 20% fuels the index **and** includes a **10% thank-you to whoever onboards a founder** — phrased modestly, with a soft "onboarded someone? get in touch." Fig. 1 → 80 / 10 / 10 (founder / index / onboarder), caption updated.
- **Founder-facing pages** (`app/onboard/page.tsx`, token-page opt-in band): keep the **80% prominent**; relabel the remaining "20% funds the index" → "the index & ecosystem" (generic; does *not* push the commission). Broaden the onboard hero "You didn't get the deal" (line ~44) to include deal-getters too ("If you founded one of these companies…"). Keep "Form 80-20"/"80/20" framing here (true from the founder's POV: 80% theirs). **Do not** add the commission to these surfaces.

## Out of scope

- Regenerating the static OG/Twitter **images** (`opengraph-image.jpg`/`twitter-image.jpg` have "No-Deal Ledger" + "no deal" baked into the artwork) — follow-up image task. (Their `.alt.txt` text IS updated here, per the brand sweep.)
- A full visual rebrand beyond copy/labels.
- The index-token launch (its own spec: `2026-06-05-pumptank-index-token-launch-design.md`).
- Functional referral tracking (explicitly declined — copy only).

## Testing

- `cd web && npm run build` (Next build + typecheck) passes.
- Spot-check: a **deal** product page/card shows **no** "No Deal" stamp + a neutral outcome; a **no-deal** one keeps the full treatment. Homepage shows no "1.5%", the 80/10/10 fee fig, and the low-key commission line. Founder pages still lead with 80% and don't push the commission.
