# PUMPTANK Website — All-Products + Fee-Copy Update — Design Spec

_Date: 2026-06-05. **Rev 2 (post agent-review).** Updates `web/` for: (1) remove stale "1.5% dev-buy" copy (products are create-only), (2) surface the 10% onboarding commission **low-key, copy-only**, (3) make the site accurate for all 1,481 products, (4) broaden the brand to "The Tribute Ledger." Status: design rev 2, pending approval._

## Data reality (verified — drives everything)

`data/products.json` = 1,481 records, all `include:true`. **`got_deal=true`: 915 (62%); no-deal: 566 (38%).** Deals are the **majority**, not a tail. Exact correlation: **`selection == null` iff `got_deal == true`** → all 915 deals have `rank` AND `reach` null. Additionally **108 no-deal records also have null `rank`** (S17 / unfindable / EXCLUDE_IDS — out of the ranked pool). So: null-rank ≠ deal, and "ranked by reach" only describes the 458 ranked no-deals. The top-level human field is just `got_deal` (bool) + `outcome:{got_deal}` (also bool) — **any human outcome string must be synthesized from `gotDeal`, not read.**

Framing consequence: the site is a tribute to **every** Shark Tank pitch; most made a deal, a notable minority didn't. The no-deal subset keeps the "No Deal" badge treatment (mirroring the token cards); deals are neutral. The brand broadens accordingly (below).

## Context / coordination

`web/` is the user's active "Deep-Water" WIP — files change under us (`lib/products.ts` already became `selection`-null-safe mid-session). **Implementation must re-read each file live before editing, change copy/logic only, preserve styling.** Design-level spec, not frozen line edits.

## Decisions (locked)

- **10% commission = copy only, low-key.** No referral links/tracking; attribution stays operator-side (`feescli optin … [referrer]`). Keep it OFF founder-facing surfaces (onboard page, token opt-in band) — founders see "80% to you." Mention it modestly on general surfaces (homepage card 03 **prose**, not a chart segment).
- **All-products accuracy mirrors the card precedent:** no-deal → "No Deal" treatment; deal → neutral (no stamp/verdict).
- **Founder always gets 80%.** Model: 80/10/10 (founder/index/onboarder) with a referrer, else 80/20.
- **Brand broadened to "The Tribute Ledger"** (option B).

## Data layer — `lib/products.ts`

- Add `gotDeal: boolean` to `Product`, read from raw `got_deal`. Add **`got_deal?: boolean` (OPTIONAL)** to `RawRecord` and default in `toProducts` (`gotDeal: r.got_deal ?? false`). **Optional is required** — `test/products.test.ts:4-18` has three `RawRecord` fixtures with no `got_deal`; a required field breaks the typecheck/build.
- Keep null-safe `selection?.rank/reach` (already present).
- **Explicit sort comparator** (replaces the broken "rank then reach"): no-deal first (the rank-led tribute core), then deals. Within a group: by `rank` ascending with nulls last, then `name`. Concretely:
  `byGotDeal (false<true) → (rank ?? Infinity) → name`. This keeps ranked no-deals leading, the 108 null-rank no-deals after them, then all deals by name. (Adjustable to chronological if preferred.)

## Per-product treatment (gate on `gotDeal`; specify the deal case fully)

Deals are 62% — the deal branch is the dominant case, not an afterthought.
- `components/ProductCard.tsx`: "No Deal" stamp only when `!gotDeal`. The `No. {rank}` plate → render only when `rank != null` (deals have none → omit the plate, don't show `000`).
- `components/ProductGrid.tsx`: same — index `No.` only when `rank != null`; **reach-meter only when `reach != null`** (the current `Math.max(8, …)` floor would draw a phantom 8% bar for every deal). "No Deal" stamp (if any) gated on `!gotDeal`.
- `app/token/[id]/page.tsx`: gate on `gotDeal` — the "No Deal" stamp (~:100), the `No deal` verdict Fact (~:137), `Outcome: "No deal on air"` (~:156), and the "walked away with…" narrative (~:78). Deal product: synthesize a neutral outcome (e.g. "Made a deal on air"), **omit** the "No Deal" stamp/verdict. Folio fallback (`idx+1`) already handles null rank — keep.

## Global framing — homepage `app/page.tsx`

- **Remove 1.5% dev-buy:** stat chip `1.5% · Dev buy` (:13) → accurate (e.g. `0 · Insider buys`). Re-check the adjacent `ONE · Wallet · disclosed` (:14) — it referenced the single dev-buy wallet; with create-only it's misleading → replace (e.g. a got-deal/no-deal count, or `100% · On-chain`). Mechanics **card 01** "A single 1.5% dev buy" (:124) → "Create-only — zero insider buys."
- **No-deal-only framing → all-products** (these are MISSED refs the rev-1 spec didn't list): hero kicker "Rejected on air, redeemed on-chain" (:28); hero lede "one hundred … walked away empty-handed" (:43-45); the "By the Numbers" aside's hardcoded **`No Deal` stamp (:73)** → remove/neutralize (it's a global, not per-product); ticker `▼ no deal` (:103) → per item (`▼ no deal` vs neutral `✓ deal`); card 03 body "rejected pitches… denied on air" (:136) → broaden; archive heading "100 rejected pitches, indexed." (:205) → real count/all-products; "Ranked by reach · N entries" (:209) → accurate (e.g. "No-deal pitches ranked by reach · {N} entries" or drop "ranked by reach").

## Fee model + commission

- **Homepage mechanics:** card 02 "80% → founders" stays. Card 03 reframed to: the remaining 20% fuels the index, **and** (prose) a 10% thank-you to whoever onboards a founder — "onboarded someone? get in touch." **Fig. 1 stays 80 / 20** (founder / rest) — do NOT add a labeled "10% Onboarder" chart segment (the review flagged it as too prominent vs the user's "low-key" rule). The 10/10 detail lives in card-03 prose only.
- **Founder-facing pages** (`app/onboard/page.tsx`, token opt-in band): keep **80% prominent**; relabel "20% funds the index" → "the index & ecosystem" (incl. `onboard:73` "the rest of the no-deal class" → broaden to "the rest of the archive"); broaden the onboard hero "You didn't get the deal" (:44) to include deal-getters. Keep "Form 80-20"/"80/20" here (true from the founder's POV). **No commission copy on these surfaces.**

## Brand sweep → "The Tribute Ledger"

PUMPTANK wordmark stays; sub-brand line "The No-Deal Ledger" → "The Tribute Ledger":
- `app/layout.tsx`: `<title>` + meta description ("…got no deal." → "…deal or no deal.").
- `components/RunningHead.tsx:6`, `SiteMasthead.tsx:24` (+ "Vol. I · No. 100" :13 → real count/neutral), `SiteFooter.tsx:22` (+ tagline "No deal. Still iconic." :43 → broadened tribute line).
- `components/OgPlate.tsx:12` text + its "No Deal" stamp (:20) gated on `gotDeal`.
- `app/opengraph-image.alt.txt` + `app/twitter-image.alt.txt` ("…got no deal." → broadened).
- `app/globals.css` header comment (:6-7) + the `:34`/`:171` "no deal" comments (cosmetic).

## Out of scope

- The static OG/Twitter **images** (`opengraph-image.jpg`/`twitter-image.jpg` — byte-identical files, both with "No-Deal Ledger"/"no deal" baked into the art) → follow-up image regen. Their `.alt.txt` text IS updated here.
- Full visual rebrand beyond copy/labels; the index-token launch (own spec); functional referral tracking (declined).

## Testing

- `cd web && npm run build` (Next build + typecheck) passes — incl. the `RawRecord.got_deal?` optionality so `test/products.test.ts` fixtures still typecheck.
- Spot-check: a **deal** card/page → no "No Deal" stamp, no `No. 000` plate, no phantom reach bar, neutral outcome; a **no-deal** one → full treatment. Homepage → no "1.5%", Fig.1 still 80/20, the 10% commission only as card-03 prose. Brand reads "The Tribute Ledger" throughout.
