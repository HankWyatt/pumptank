# Shark Tank "No-Deal" Data Pipeline — Design Spec

**Date:** 2026-05-22
**Status:** Draft for review (v2 — simplified to no-deal only)
**Sub-project:** 1 of 5 (the data foundation)

---

## Project context (PUMPTANK)

The broader project launches pump.fun tokens on Solana: a hub token (`$PUMPTANK`)
plus one tribute token per **Shark Tank US pitch that got no deal** ("the ones the
sharks passed on"). Each token gets a transparent **1.5% dev buy** from a single,
identifiable creator wallet — no multi-wallet bundling, no fake demand.

The deployer wallet receives pump.fun **creator fees**; sub-project #4 forwards **80%**
to the original product creator if/when they opt in, and keeps **20%** for marketing.
(pump.fun's native fee mechanics — rates, the multi-wallet split, the one-time redirect
cap — are #4's concern, not this spec's.)

Tokens are **unaffiliated tribute/parody coins** with explicit disclaimers and **no
investment promises to buyers**. We publish exactly one factual, on-the-record claim per
token — *"pitched on Shark Tank, got no deal"* — which is public and verifiable, so there
is **no defamation exposure**. We never assert any company "failed" or label a specific
business negatively, including the no-deal pitches that later succeeded (e.g., DoorBot →
Ring).

Five sub-projects, each with its own spec → plan → implementation:

1. **No-deal data pipeline** ← *this spec*
2. Token asset generation (name, ticker, description, image)
3. Bundled launch engine (atomic create + 1.5% dev buy, scaled to all-at-once)
4. Fee routing (deployer-at-launch → 80/20 split on creator onboarding)
5. Website (hub + per-pitch pages, episode embeds, disclaimers)

This spec covers **#1 only**. Its output is the single source of truth the launcher and
the site both consume.

---

## Goal

Produce a structured dataset — `data/products.json` — of every Shark Tank US pitch that
**got no deal**, with enough per-pitch detail to drive both token creation and the
website.

**Done means:** running the pipeline yields a schema-valid `data/products.json`
containing every no-deal pitch across all available seasons, each with its show/pitch
facts and best-available media (image + episode link).

## Non-goals (other sub-projects)

- No failure verification, no company-status checks — **out entirely** (the v1 design's
  verification stage is deleted).
- Token naming/ticker/art generation (#2) — pipeline stores best-available media only.
- Any on-chain action, buying, or fee config (#3, #4).
- Website rendering (#5) — pipeline emits data + a YouTube URL only.

---

## Stack & repo layout

Python pipeline; language-neutral JSON output so the later TypeScript launcher and React
site consume it without coupling.

```
st/
├── pipeline/
│   ├── pyproject.toml
│   ├── pumptank_pipeline/
│   │   ├── config.py        # paths; Kaggle creds (if using the API)
│   │   ├── models.py        # the Pitch record type
│   │   ├── ingest.py        # Kaggle CSV + recent-season top-up → Pitch[]
│   │   ├── filter.py        # keep no-deal pitches
│   │   ├── assemble.py      # merge + resolve media → products.json
│   │   └── cli.py           # stage runner; resumable
│   └── tests/
├── data/
│   ├── raw/                 # downloaded CSV
│   ├── products.json        # THE output
│   └── products.schema.json # JSON Schema, validated in CI
```

---

## Architecture: three stages

### 1. Ingest → `data/raw/pitches.json`
- **Source A (backbone):** Kaggle `thirumani/shark-tank-us-dataset` (~52 columns:
  deal flag, deal amounts, equity, founders, industry, description).
  **Verify the live season/row coverage at implementation — do not hardcode it.** Public
  references disagree (S1–15 vs S1–16; ~1,038 vs ~1,320 rows), so re-baseline against the
  file actually downloaded.
- **Source B (top-up):** seasons beyond the dataset (the show is on **S17** as of early
  2026, so expect a ~1–2 season gap). Parse Wikipedia's "List of Shark Tank episodes"
  (CC BY-SA) for the missing pitches.
- Normalize both into a `Pitch` with a stable `id` (`s{season}e{episode}-{slug}`).

### 2. Filter → (in-memory)
The crux of this pipeline — getting "did they get a deal?" right is the whole job:
- Use the dataset's **explicit deal flag/column**, not a null/zero-amount inference.
- **An on-air deal = excluded**, even royalty-only, line-of-credit, or no-equity deals,
  **and even if the deal later fell through** in due diligence — the sharks didn't *pass*,
  so it isn't a "no-deal" pitch.
- Result: the set of pitches the sharks passed on.

### 3. Assemble → `data/products.json`
- Resolve **media**: best-available `image_url` (dataset image, or a Wayback snapshot of
  the former product site) with recorded provenance — store a **link, never a rehosted
  copy**; `youtube_url` for the episode/segment (link/embed only).
- Emit schema-valid `products.json`; validate against `products.schema.json`.

---

## Output schema (per record)

```jsonc
{
  "id": "s5e09-doorbot",
  "season": 5, "episode": 9, "air_date": "2013-11-15",
  "company_name": "...", "product_name": "...",
  "founders": ["..."],
  "industry": "...",
  "pitch": {
    "ask_amount": 700000, "ask_equity": 10,
    "implied_valuation": 7000000,   // as-pitched; sharks' counters not reflected
    "description": "..."
  },
  "outcome": { "got_deal": false, "notes": null },
  "media": {
    "image_url": "...", "image_source": "dataset|wayback|none",
    "former_website": "https://...", "youtube_url": "https://..."
  },
  "include": true,   // default true; set false to manually drop a pitch from minting
  "token": null      // populated by later sub-projects (ticker, mint address)
}
```

---

## Error handling & resumability
- **Stages write artifacts** (`data/raw/`), so re-runs are cheap and resumable
  (`cli.py --resume`).
- **Network:** retry with backoff on the dataset download / Wikipedia / Wayback fetches.
- **Missing fields:** tolerate; emit `null`, never fabricate. A pitch missing a deal flag
  is flagged for manual check, not silently included/excluded.

## Testing plan
- **Unit:** ingest normalization; the deal-flag filter including the edge cases
  (royalty-only / credit / no-equity / fell-through → all *excluded*); JSON-schema
  validation.
- **Deterministic fixture check:** a handful of known dataset rows assert the filter's
  behavior (a known no-deal pitch is present; a known on-air deal is absent). Uses static
  dataset rows, so no live-web flakiness.

## Downstream parameter (recorded for #3)
- Dev buy fixed at **1.5% ≈ 0.4306 SOL/token** (pump.fun opening-curve price). Total buy
  capital ≈ `0.4306 × (count of included no-deal pitches)`. The 1.5% fraction is launcher
  config, not hardcoded.

## Open questions / gating prerequisites
- **Dataset license (gating).** `products.json` is a derived, redistributed dataset
  feeding a public site. Confirm the Kaggle dataset's license permits this **before
  implementing**. If it doesn't, fall back to deriving the facts from primary sources
  (Wikipedia episode lists, CC BY-SA) — raw facts (who pitched, deal/no-deal) are
  generally not copyrightable, but a *compiled* dataset may carry a contractual/DB
  restriction.
- S17+ top-up source reliability — validate during implementation.

## Risks
- **Dataset license** — see above; the one true blocker. Mitigated by the Wikipedia
  fallback.
- **IP / likeness** of using product names & images — cross-project; mitigated by tribute
  framing, disclaimers, link-not-rehost media, and a recommended legal review before
  launch.
- **Dataset freshness** — backbone lags the current season; the top-up step covers it.

---

### Changelog
- **v2 (2026-05-22):** Scope simplified after review — selection is now **no-deal only**,
  not "no-deal + verifiably failed." Deleted the entire verification stage (status
  taxonomy, signal collection, Claude classification, evidence validation, golden set) and
  its defamation guardrails, which are unnecessary once the only published claim is the
  factual "got no deal." Retained the still-relevant review findings: explicit deal-flag
  filtering, live dataset re-baselining, the license gating prerequisite, and media
  link-not-rehost.
