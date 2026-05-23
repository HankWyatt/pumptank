# Shark Tank "No-Deal" Data Pipeline — Design Spec

**Date:** 2026-05-22
**Status:** Draft for review (v3 — second-review fixes applied)
**Sub-project:** 1 of 5 (the data foundation)

---

## Project context (PUMPTANK)

The broader project launches pump.fun tokens on Solana: a hub token (`$PUMPTANK`)
plus one tribute token per **Shark Tank US pitch that got no deal** ("the ones the
sharks passed on"). Each token gets a transparent **1.5% dev buy** from a single,
identifiable creator wallet — no multi-wallet bundling, no fake demand.

The deployer wallet receives pump.fun **creator fees**; sub-project #4 forwards **80%**
to the original product creator if/when they opt in, and keeps **20%** for marketing.
(pump.fun's native fee mechanics are #4's concern, not this spec's.)

Tokens are **unaffiliated tribute/parody coins** with explicit disclaimers and **no
investment promises to buyers**. We publish exactly one factual, on-the-record claim per
token — *"pitched on Shark Tank, got no deal"* — which is public and verifiable, so there
is **no defamation exposure**. We never assert any company "failed" or label a business
negatively, including the no-deal pitches that later succeeded (e.g., DoorBot → Ring).

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
**got no deal**, across all completed seasons the source dataset covers (currently
S1–S16), with enough per-pitch detail to drive both token creation and the website.

**Done means:** running the pipeline yields a schema-valid `data/products.json`
containing every no-deal pitch from the dataset's seasons, each with its show/pitch facts
and best-available media (image + episode link).

## Non-goals

- **No failure verification** — deleted in v2; selection is purely "got no deal."
- **Season 17** — still airing as of 2026 (Sep 2025 → ~Apr 2026); no compiled dataset
  exists for it yet. Out of scope here, a **fast-follow** once it wraps and is compiled.
  (This is a data-availability boundary, not curation.)
- Token naming/ticker/art (#2); any on-chain action (#3, #4); website rendering (#5).

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
│   │   ├── ingest.py        # Kaggle CSV → normalized Pitch[]
│   │   ├── filter.py        # keep Got Deal == 0
│   │   ├── assemble.py      # merge + resolve media (best-effort) → products.json
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
- **Source:** Kaggle `thirumani/shark-tank-us-dataset` (~52–53 columns including a `Got
  Deal` flag, deal amounts, equity, `Valuation Requested`, founders, industry,
  description). The author keeps it current; it covers all completed seasons. **The
  GitHub mirror lags at S15; the live Kaggle file is updated through S16 — re-baseline
  against the file you actually download; do not hardcode the season count.**
- **No top-up source.** (Wikipedia episode lists carry no per-pitch deal outcome,
  founders, ask, or equity — verified — so they cannot substitute.) S17 is a fast-follow.
- Normalize into a `Pitch` with a stable, **collision-free** id:
  `s{season}e{episode}p{pitch}-{slug}` — episodes contain multiple pitches, so include
  the dataset's `Pitch Number`.

### 2. Filter → (in-memory)
The crux of this pipeline — getting "did they get a deal?" right is the whole job:
- **Selection = `Got Deal == 0`. That single column is the *only* filter input.**
- `Royalty Deal`, `Loan`, and `Deal has conditions` are **NOT** filter inputs — they
  exist only to confirm a `Got Deal == 1` row is still a deal (and therefore excluded).
  Do **not** drop rows based on them.
- Equivalently: any on-air deal is excluded — royalty-only, line-of-credit, conditional,
  or one that later fell through in due diligence — because the sharks didn't *pass*.
- **Null/blank `Got Deal`:** count and log them, and **fail the run loudly** if the null
  count exceeds a small threshold (guards against a column rename / parse error silently
  sweeping pitches into "no-deal"). Individual nulls → flagged for manual check, never
  auto-included.

### 3. Assemble → `data/products.json`
- Resolve media **best-effort, non-blocking**: prefer the dataset's image; a Wayback
  snapshot of the former product site is optional and commonly absent (`image_source:
  "none"` is a normal result). Final art is sub-project #2 — this stage must not block on
  image lookups. Store a **link, never a rehosted copy**, with recorded provenance.
  `youtube_url` = the episode/segment (link/embed only).
- Emit schema-valid `products.json`; validate against `products.schema.json`.

---

## Output schema (per record)

```jsonc
{
  "id": "s5e09p1-doorbot",
  "season": 5, "episode": 9, "pitch_number": 1, "air_date": "2013-11-15",
  "company_name": "...", "product_name": "...",
  "founders": ["..."],
  "industry": "...",
  "pitch": {
    "ask_amount": 700000, "ask_equity": 10,
    "valuation_requested": 7000000,   // copied from the dataset's 'Valuation Requested'
    "description": "..."
  },
  "outcome": { "got_deal": false },   // always false by construction; kept for schema stability
  "media": {
    "image_url": null, "image_source": "dataset|wayback|none",
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
- **Network:** retry with backoff on the dataset download / optional Wayback fetches; a
  failed Wayback lookup yields `image_source: "none"`, never a failed run.
- **Missing fields:** tolerate; emit `null`, never fabricate — except `Got Deal`, which
  is guarded as above (loud failure past the null threshold).

## Testing plan
- **Unit:** ingest normalization; the **filter keys only on `Got Deal == 0`** (assert a
  `Got Deal == 1` row that is royalty-only / conditional / loan is *excluded*, and a
  `Got Deal == 0` row is *included*); the null-count guard fails past threshold;
  JSON-schema validation; id uniqueness across multi-pitch episodes.
- **Deterministic fixture check** on static dataset rows (a known no-deal pitch present; a
  known on-air deal absent) — no live-web flakiness.

## Downstream parameter (recorded for #3)
- Dev buy fixed at **1.5% ≈ 0.4306 SOL/token** (pump.fun opening-curve price). Total buy
  capital ≈ `0.4306 × (count of included no-deal pitches)`. The 1.5% fraction is launcher
  config, not hardcoded.

## License — gating prerequisite (resolve before publishing)
`products.json` is a derived dataset feeding a public site, and the Kaggle dataset is the
**only** clean source of per-pitch deal outcomes.
- **Confirm the Kaggle dataset's license before relying on redistribution.** Treat an
  unstated/unclear license as **not redistributable** (the GitHub mirror has no license
  file; the Kaggle badge could not be confirmed externally).
- If redistribution isn't permitted, the posture is: publish **facts** (who pitched,
  season/episode, deal outcome, ask/equity) — facts are generally not copyrightable —
  while **not** copying the dataset author's creative expression (e.g., re-summarize or
  omit their written `description`). This is a weaker legal position than a clean license,
  so flag it explicitly rather than assume it's fine.
- **Recommended:** legal review before launch, given real names + a public, monetized
  project. (Building the pipeline against the data privately is fine; *publishing* is the
  gated step.)

## Open questions
- S17 fast-follow once the season wraps (~Apr 2026) and a compiled dataset exists.

## Risks
- **Dataset license** — the one true blocker for *publishing*; see above.
- **IP / likeness** of using product names & images — cross-project; mitigated by tribute
  framing, disclaimers, link-not-rehost media, and a recommended legal review.
- **Dataset freshness** — backbone trails the current (airing) season by design; S17
  fast-follow covers it.

---

### Changelog
- **v3 (2026-05-22):** Applied second review. Removed the Wikipedia S16/S17 "top-up"
  (Wikipedia episode lists carry no per-pitch deal data — verified) and scoped output to
  the dataset's completed seasons (S1–S16); S17 is a fast-follow. Rewrote the license
  section honestly (dropped the broken CC-BY-SA fallback; publish facts, not the dataset's
  creative text; treat unstated license as not-redistributable). Pinned the filter to
  `Got Deal == 0` only with a null-count guard. Fixed `id` collisions via `Pitch Number`.
  Downgraded Wayback media to best-effort/non-blocking. Schema: added `valuation_requested`
  from the dataset column, dropped the vestigial `outcome.notes`.
- **v2 (2026-05-22):** Simplified to no-deal only; deleted the failure-verification
  subsystem (status taxonomy, signals, LLM classification, evidence validation, golden
  set) and its defamation guardrails — unnecessary once the only published claim is "got
  no deal."
