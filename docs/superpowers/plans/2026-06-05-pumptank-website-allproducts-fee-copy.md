# Website All-Products + Fee-Copy + Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the `web/` site accurate for all 1,481 products (deal + no-deal), remove the stale "1.5% dev-buy" copy, surface the 10% onboarding commission low-key (copy only), and rebrand "The No-Deal Ledger" → "The Tribute Ledger."

**Architecture:** Next.js (app router) static site. One data-layer change (`lib/products.ts`: add `gotDeal` + a deal-aware sort) flows a `gotDeal` flag into per-product conditional rendering; the rest is scoped copy/JSX edits across the homepage, token page, onboard page, and brand components.

**Tech Stack:** Next.js, React, TypeScript, Tailwind, Vitest. Spec: `docs/superpowers/specs/2026-06-05-pumptank-website-allproducts-fee-copy-design.md` (rev 2).

---

## CRITICAL constraints (every task)

- **`web/` is the user's ACTIVELY-EDITED WIP.** Before editing any file, **re-read its current on-disk state** — the anchor strings below reflect a recent read but may have moved. Match the *intent* (the target copy/logic), apply against the live file, and preserve all existing Tailwind classes/structure (change copy + the specific conditionals only).
- **Scoped commits only:** `git add <exact files>` per task. NEVER `git add -A`/`.`/`-u`/`-am`. Do not stage `data/`, `launcher/`, or files outside the task.
- Stay on branch `master`.
- Deal-product outcome strings are **synthesized from `gotDeal`** (the data has only a boolean). No-deal keeps the full "No Deal" treatment; deal renders neutral.
- After every task that touches `.tsx`/`.ts`: `cd web && npm run build` must pass (Next build + typecheck).

## File structure

- **Modify** `lib/products.ts` (+ `test/products.test.ts`) — data layer.
- **Modify** `components/ProductCard.tsx`, `components/ProductGrid.tsx` — per-product deal/no-deal.
- **Modify** `app/token/[id]/page.tsx` — per-product deal/no-deal + fee-fig relabel.
- **Modify** `app/page.tsx` — remove 1.5%, all-products framing, fee cards.
- **Modify** `app/onboard/page.tsx` — relabel 20%, broaden hero (no commission).
- **Modify** `app/layout.tsx`, `components/RunningHead.tsx`, `components/SiteMasthead.tsx`, `components/SiteFooter.tsx`, `components/OgPlate.tsx`, `app/opengraph-image.alt.txt`, `app/twitter-image.alt.txt`, `app/globals.css` (header comment) — brand → "The Tribute Ledger".

---

### Task 1: Data layer — `gotDeal` + deal-aware sort

**Files:** Modify `web/lib/products.ts`; Test `web/test/products.test.ts`.

- [ ] **Step 1: Write the failing tests** — append to `web/test/products.test.ts`:

```ts
import { byTributeOrder } from "@/lib/products";

test("toProducts maps gotDeal from raw got_deal (default false)", () => {
  const withDeal: RawRecord[] = [
    { ...raw[0], got_deal: true },
    { ...raw[2] }, // no got_deal field -> false
  ];
  const ps = toProducts(withDeal);
  expect(ps.find((p) => p.id === "s5e9p1-a")!.gotDeal).toBe(true);
  expect(ps.find((p) => p.id === "s10e10p840-gotdeal")!.gotDeal).toBe(false);
});

test("byTributeOrder: no-deal (by rank, nulls last) before deals (by name)", () => {
  const mk = (id: string, gotDeal: boolean, rank: number | null, name = id) =>
    ({ id, gotDeal, rank, name } as any);
  const sorted = [
    mk("deal-z", true, null, "Zeta"),
    mk("nd-null", false, null, "Beta"),
    mk("nd-2", false, 2, "Delta"),
    mk("deal-a", true, null, "Alpha"),
    mk("nd-1", false, 1, "Gamma"),
  ].sort(byTributeOrder).map((p) => p.id);
  expect(sorted).toEqual(["nd-1", "nd-2", "nd-null", "deal-a", "deal-z"]);
});
```

Also add `got_deal?: boolean` to the existing fixtures is NOT required (optional field) — but update the first existing test's expectation is unchanged.

- [ ] **Step 2: Run to verify failure** — `cd web && npx vitest run test/products.test.ts` → FAIL (`byTributeOrder` not exported; `gotDeal` missing).

- [ ] **Step 3: Implement in `web/lib/products.ts`**

Add `got_deal?: boolean;` to the `RawRecord` interface (OPTIONAL — the existing fixtures + any record without it default to false; a required field would break `test/products.test.ts`).

Add `gotDeal: boolean;` to the `Product` interface.

In `toProducts`, add to the returned object: `gotDeal: r.got_deal ?? false,`.

Replace `getAllProducts` and add the exported comparator:
```ts
export function byTributeOrder(a: Product, b: Product): number {
  if (a.gotDeal !== b.gotDeal) return a.gotDeal ? 1 : -1; // no-deal (tribute core) first
  const ra = a.rank ?? Infinity, rb = b.rank ?? Infinity; // then by rank, nulls last
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);                     // then by name
}

export function getAllProducts(): Product[] {
  return toProducts(data as unknown as RawRecord[]).sort(byTributeOrder);
}
```

- [ ] **Step 4: Run to verify pass** — `cd web && npx vitest run test/products.test.ts` → PASS (4 tests). Then `cd web && npm run build` → passes.

- [ ] **Step 5: Commit**
```bash
git -C /home/hank/Documents/git/st add web/lib/products.ts web/test/products.test.ts
git -C /home/hank/Documents/git/st commit -m "feat(web): add gotDeal + deal-aware sort (no-deal tribute core first)"
```

---

### Task 2: Per-product deal/no-deal — cards + index list

**Files:** Modify `web/components/ProductCard.tsx`, `web/components/ProductGrid.tsx`.

- [ ] **Step 1: `ProductCard.tsx`** — gate the no-deal-only elements on `!p.gotDeal`.
  - The `No. {no}` plate (top-left span): wrap so it renders ONLY when `p.rank != null` (deals have null rank — omit, don't show `No. 000`).
  - The `<span className="stamp …">No Deal</span>` (top-right): render ONLY when `!p.gotDeal`.
  (Keep everything else identical.)

- [ ] **Step 2: `ProductGrid.tsx`** — in `IndexList`, the `rows.map`:
  - Replace `const no = p.rank != null ? p.rank.toString().padStart(3, "0") : "000";` with `const no = p.rank != null ? p.rank.toString().padStart(3, "0") : "—";` (no fake `000` for deals).
  - The reach meter `<span className="reach-meter …"><i style={{ width: \`${reach}%\` }} /></span>`: render ONLY when `p.reach != null` (else render an empty `<span className="max-[720px]:hidden" />` to hold the grid column) — no phantom 8% bar. Adjust the `reach` const so it isn't computed for null (`const reach = p.reach != null ? Math.max(8, Math.round(p.reach * 100)) : null;`).

- [ ] **Step 3: Verify** — `cd web && npm run build` passes. Spot-check: pick a deal id (`grep -m1 '"got_deal": true' data/products.json` → the enclosing record's `id`) and a no-deal id; confirm (reading the built component logic) the deal card has no "No Deal" stamp / no "No." plate, the no-deal card keeps both.

- [ ] **Step 4: Commit**
```bash
git -C /home/hank/Documents/git/st add web/components/ProductCard.tsx web/components/ProductGrid.tsx
git -C /home/hank/Documents/git/st commit -m "feat(web): deal products render neutral in cards + index (no No-Deal stamp/000/phantom reach)"
```

---

### Task 3: Token page — per-product outcome + fee-fig relabel

**Files:** Modify `web/app/token/[id]/page.tsx`.

- [ ] **Step 1: Hero narrative** (currently "Pitched on Shark Tank S{}E{}, and walked away with **no deal.**" with a red strike): make it conditional —
  - no-deal: keep the existing "walked away with no deal." + the red strike span.
  - deal: "Pitched on Shark Tank S{p.season}E{p.episode}, and **closed a deal on air.**" (bold, NO strike span).

- [ ] **Step 2: Exhibit-plate stamp** (`<span className="stamp stamp-lg …">No Deal</span>`): render ONLY when `!p.gotDeal`.

- [ ] **Step 3: The Ask aside** — the "On-air verdict" row value (`No deal`, red `#ff6a5e`): `{p.gotDeal ? "Deal" : "No deal"}` and color teal (`var(--teal)`) when deal, red when no-deal. The blurb under it ("As presented on air. The sharks passed; the internet did not. …"): deal variant → "As presented on air. They shook hands on the show. Terms shown for the record, not a valuation of any token."

- [ ] **Step 4: Fact-sheet Outcome** (`<Fact k="Outcome" v="No deal on air" verdict />`): `<Fact k="Outcome" v={p.gotDeal ? "Made a deal on air" : "No deal on air"} verdict={!p.gotDeal} />` (the red `verdict` styling only for no-deal).

- [ ] **Step 5: Fee fig + opt-in (keep 80/20 — founder-facing, NO commission copy)** — relabel only:
  - Figcaption "Fig. 2 · … upon verified founder opt-in. **The 20% funds the index.**" → "… upon verified founder opt-in. **The 20% funds the index & ecosystem.**"
  - Leave the "If the founder opts in, the split is 80 / 20." heading, the 80/20 bar, and the opt-in band (Claim 80%) AS-IS.

- [ ] **Step 6: Verify** — `cd web && npm run build` passes. Spot-check the deal id from Task 2: token page shows "closed a deal on air", no "No Deal" stamp, "Deal" verdict, "Made a deal on air" outcome; a no-deal id is unchanged.

- [ ] **Step 7: Commit**
```bash
git -C /home/hank/Documents/git/st add web/app/token/[id]/page.tsx
git -C /home/hank/Documents/git/st commit -m "feat(web): token page reflects real deal/no-deal outcome; fee caption -> index & ecosystem"
```

---

### Task 4: Homepage — remove 1.5%, all-products framing, fee cards

**Files:** Modify `web/app/page.tsx`.

- [ ] **Step 1: Stats (the `stats` array)** — replace the two stale chips:
  - `{ v: "1.5%", l: "Dev buy · capped" }` → `{ v: "0", l: "Insider buys" }`.
  - `{ v: "ONE", l: "Wallet · disclosed" }` → `{ v: products.filter((p) => !p.gotDeal).length.toString(), l: "No-deal pitches" }` (needs `gotDeal` from Task 1; tells the all-products story: most made deals, this many didn't).

- [ ] **Step 2: Hero copy**
  - Kicker (currently "Rejected on air, redeemed on-chain") → "Pitched on air, tributed on-chain".
  - Lede "is a fan-built archive of one hundred Shark Tank pitches that walked away empty-handed. Each one now lives on as its own tribute token. …" → "is a fan-built archive of **every** Shark Tank pitch — deal or no deal — each one reborn as its own tribute token. No suits. No handshakes required. Just the ideas, filed for the record."

- [ ] **Step 3: "By the Numbers" aside stamp** — the `<span className="stamp …">No Deal</span>` (decorative, on the stats box) → change text to `Tribute` (it's a global element; "No Deal" is now wrong for an all-products index).

- [ ] **Step 4: Live-tape ticker** — the `▼ no deal` span per item: make it conditional — `{p.gotDeal ? <span className="text-[var(--teal)]">✓ deal</span> : <span className="text-[#ff7064]">▼ no deal</span>}` (keep the surrounding `$symbol` / name spans).

- [ ] **Step 5: Mechanics cards (the array of 3)**
  - Card 01 `{ n: "01", t: "A single 1.5% dev buy", d: "…" }` → `{ n: "01", t: "Create-only. Zero insider buys.", d: "Every product launches create-only — no dev buy, no insider allocation. The builders of PumpTank take none of the supply; the coins exist for the creators to claim." }`.
  - Card 02 `{ n: "02", t: "80% of fees → founders", d: "Creator trading fees split 80 / 20. …" }` → keep title; `d: "Creator trading fees route 80% to the original founder the moment they opt in. The lion's share is reserved for them — it is their story; it is their upside."`.
  - Card 03 `{ n: "03", t: "20% helps others …", d: "The 20% funds marketing and growth for the index …" }` → `{ n: "03", t: "20% fuels the index", d: "The remaining 20% funds marketing and growth for the index — and if someone helped onboard a founder, 10% of it is theirs as a thank-you. Onboarded a founder? Get in touch." }` (this is the ONLY, low-key, commission mention).

- [ ] **Step 6: Fee Fig. 1 — keep 80 / 20** (do NOT add a "10% Onboarder" segment; the review flagged that as too prominent). Leave the bar; update its figcaption to "Fig. 1 · Creator-fee allocation per token, upon founder opt-in (80% founder · 20% index & ecosystem)."

- [ ] **Step 7: Archive section**
  - Heading "100 rejected pitches, indexed." → "{products.length} Shark Tank pitches, indexed." (use the JS expression).
  - The caption "Ranked by reach · {products.length} entries" → "No-deal pitches ranked first · {products.length} entries".

- [ ] **Step 8: Verify + commit** — `cd web && npm run build` passes (no "1.5%" remains: `grep -n "1.5%" web/app/page.tsx` → empty).
```bash
git -C /home/hank/Documents/git/st add web/app/page.tsx
git -C /home/hank/Documents/git/st commit -m "feat(web): homepage all-products framing, drop 1.5% dev-buy, low-key 10% commission"
```

---

### Task 5: Onboard page — relabel + broaden (keep 80%, no commission)

**Files:** Modify `web/app/onboard/page.tsx`.

- [ ] **Step 1: Broaden the no-deal-only copy** (deal-getters can opt in too):
  - Hero lede "You pitched. You didn't get the deal. The internet remembered anyway. If you founded one of the companies in the PUMPTANK archive, you can claim …" → "You pitched on the Tank. Deal or no deal, the internet remembered. If you founded one of the companies in the PUMPTANK archive, you can claim …".
  - The 20% card body "…keeping the archive alive so **the rest of the no-deal class** gets discovered too." → "…keeping the archive alive so **the rest of the archive** gets discovered too."

- [ ] **Step 2: Relabel the 20% (keep 80% prominent; NO commission copy here)**
  - The "20% · Funds the index" card heading/body and the Fig. 1 "20% · Growth" segment label → "the index & ecosystem" / "20% · Index". Do not mention the onboarding commission on this founder-facing page.
  - Leave "Claim your 80%.", the 80% card, the "An 80 / 20 split, in your favor." heading, "Form 80-20", and the form AS-IS.

- [ ] **Step 3: Verify + commit** — `cd web && npm run build` passes.
```bash
git -C /home/hank/Documents/git/st add web/app/onboard/page.tsx
git -C /home/hank/Documents/git/st commit -m "feat(web): onboard page broadened for deal+no-deal founders; 20% -> index & ecosystem"
```

---

### Task 6: Brand sweep → "The Tribute Ledger"

**Files:** Modify `web/app/layout.tsx`, `web/components/RunningHead.tsx`, `web/components/SiteMasthead.tsx`, `web/components/SiteFooter.tsx`, `web/components/OgPlate.tsx`, `web/app/opengraph-image.alt.txt`, `web/app/twitter-image.alt.txt`, `web/app/globals.css`.

- [ ] **Step 1: Rename + broaden**
  - `app/layout.tsx`: `title: "PUMPTANK · The No-Deal Ledger"` → `"PUMPTANK · The Tribute Ledger"`; `description: "Tribute tokens for Shark Tank pitches that got no deal."` → `"Tribute tokens for Shark Tank pitches — deal or no deal."`.
  - `components/RunningHead.tsx`: `The No-Deal Ledger` → `The Tribute Ledger`.
  - `components/SiteMasthead.tsx`: nameplate sub-line `The No-Deal Ledger` → `The Tribute Ledger`; dateline `Vol. I · No. 100` → `Vol. I` (drop the stale "No. 100").
  - `components/SiteFooter.tsx`: `The No-Deal Ledger · A Tribute Archive` → `The Tribute Ledger · A Tribute Archive`; the red colophon tagline `No deal. Still iconic.` → `Pitched. Tributed. On-chain.`.
  - `app/opengraph-image.alt.txt` + `app/twitter-image.alt.txt`: `…Tribute tokens for Shark Tank pitches that got no deal.` → `…Tribute tokens for Shark Tank pitches — deal or no deal.`.
  - `app/globals.css` header comment (lines ~6-7): `"THE NO-DEAL LEDGER" / "A dark, broadcast-grade index of rejected pitches."` → `"THE TRIBUTE LEDGER" / "A dark, broadcast-grade index of Shark Tank tributes."` (comment only; cosmetic).

- [ ] **Step 2: `OgPlate.tsx`** — `The No-Deal Ledger · Pitch No. {folio}` → `The Tribute Ledger · Pitch No. {folio}`; the `<span className="og-stamp">No Deal</span>` → render ONLY when `!p.gotDeal` (`{!p.gotDeal && <span className="og-stamp">No Deal</span>}`).

- [ ] **Step 3: Verify** — `cd web && npm run build` passes; `grep -rn "No-Deal Ledger" web/` → empty (all renamed).

- [ ] **Step 4: Commit**
```bash
git -C /home/hank/Documents/git/st add web/app/layout.tsx web/components/RunningHead.tsx web/components/SiteMasthead.tsx web/components/SiteFooter.tsx web/components/OgPlate.tsx web/app/opengraph-image.alt.txt web/app/twitter-image.alt.txt web/app/globals.css
git -C /home/hank/Documents/git/st commit -m "feat(web): rebrand 'The No-Deal Ledger' -> 'The Tribute Ledger'; gate OG No-Deal stamp on gotDeal"
```

---

### Task 7: Final verification

- [ ] **Step 1: Build + tests** — `cd web && npm run build && npx vitest run` → build clean, all tests pass.
- [ ] **Step 2: No stale copy remains** — `grep -rniE "1\.5%|No-Deal Ledger" web/app web/components web/lib` → empty. `grep -rn "got no deal" web/app` → empty.
- [ ] **Step 3: Spot-check parity** — for one deal id and one no-deal id (from `data/products.json`): deal → no "No Deal" anywhere on its card/token page, neutral outcome; no-deal → full "No Deal" treatment intact. Homepage Fig.1 still 80/20; the 10% commission appears ONLY in mechanics card 03; founder/onboard pages don't mention it.

---

## Out of scope (flag, don't do)
- Regenerating the static `opengraph-image.jpg` / `twitter-image.jpg` (baked "No-Deal Ledger"/"no deal" art — byte-identical files) → follow-up image task.

## Self-review (against spec rev 2)
- Remove 1.5% (Task 4 chips+card01) ✓; 10% commission low-key copy-only, off founder surfaces (Task 4 card03 only; Tasks 3/5 keep founder pages at 80% with no commission) ✓; all-products accuracy mirroring cards — deal neutral / no-deal "No Deal" (Tasks 2/3/6 gates) ✓; data layer gotDeal + deal-aware sort + optional RawRecord.got_deal (Task 1, fixes typecheck) ✓; deal-branch fully specified — no "000"/phantom reach (Task 2) ✓; brand → "The Tribute Ledger" everywhere incl. masthead/footer/OG/alt/css (Task 6) ✓; missed refs caught (By-Numbers stamp T4S3, kicker T4S2, ONE-wallet chip T4S1, onboard no-deal-class T5S1) ✓; OG static images flagged out-of-scope ✓.
- Placeholders: none. Type consistency: `Product.gotDeal: boolean`, `byTributeOrder(a,b)`, `RawRecord.got_deal?: boolean` consistent across tasks.
