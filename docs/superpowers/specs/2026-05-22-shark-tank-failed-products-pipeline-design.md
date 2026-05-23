# Shark Tank "Failed Products" Data Pipeline — Design Spec

**Date:** 2026-05-22
**Status:** Draft for review
**Sub-project:** 1 of 5 (the data foundation)

---

## Project context (PUMPTANK)

The broader project launches pump.fun tokens on Solana: a hub token (`$PUMPTANK`)
plus one tribute token per **failed Shark Tank US product** (a pitch that got **no
deal** *and* whose company **later failed**). Each token gets a transparent **1.5%
dev buy** from a single, identifiable creator wallet (no multi-wallet bundling, no
fake demand). pump.fun **creator fees** are routed 80% to the original product
creator (if/when they opt in) and 20% to the deployer for marketing.

Tokens are **unaffiliated tribute/parody coins** with explicit disclaimers and **no
investment promises to buyers**. Buyers participate purely on speculation. "Fund
your product" is a pitch to onboard the *original creators*, not a promise to buyers.

The full project decomposes into five sub-projects, each with its own spec → plan →
implementation:

1. **Research/data pipeline** ← *this spec*
2. Token asset generation (name, ticker, description, image)
3. Bundled launch engine (atomic create + 1.5% dev buy, scaled to all-at-once)
4. Fee routing (deployer-at-launch → one-shot 80/20 split on creator onboarding)
5. Website (hub + per-product pages, episode embeds, disclaimers)

This spec covers **#1 only**. The pipeline's output is the single source of truth
the launcher and the site both consume.

---

## Goal

Produce a verified, structured dataset — `data/products.json` — of Shark Tank US
pitches that **got no deal** and whose company has **verifiably failed**, with enough
per-product detail to drive both token creation and the website.

**Done means:** running the pipeline end-to-end yields a schema-valid
`data/products.json` where every record marked `mint_eligible: true` carries a
sourced, dated, confidence-scored failure determination — and no active business is
ever asserted to have failed.

## Non-goals (handled by other sub-projects)

- Token naming/ticker/art generation (#2) — pipeline stores best-available media only.
- Any on-chain action, buying, or fee config (#3, #4).
- Website rendering (#5) — pipeline only emits data + a YouTube URL.

---

## Stack & repo layout

Python pipeline (best tooling for scraping/data/LLM calls). Output is language-neutral
JSON, so the later TypeScript launcher and React site consume it without coupling.

```
st/
├── pipeline/
│   ├── pyproject.toml
│   ├── pumptank_pipeline/
│   │   ├── config.py          # paths, thresholds, env-sourced API keys
│   │   ├── models.py          # typed records: Pitch, StatusEvidence, Product
│   │   ├── ingest.py          # Kaggle CSV + S17+ top-up → normalized Pitch[]
│   │   ├── filter.py          # keep no-deal pitches
│   │   ├── verify/
│   │   │   ├── signals.py     # website / socials / news / USPTO / Wayback checks
│   │   │   ├── classify.py    # Claude API → status + confidence + why_failed
│   │   │   └── cache.py       # on-disk cache of every external lookup
│   │   ├── assemble.py        # merge + resolve media → products.json
│   │   └── cli.py             # stage runner; resumable; --stage / --resume
│   └── tests/
├── data/
│   ├── raw/                   # downloaded CSV + cached signal responses
│   ├── interim/               # per-stage artifacts (resumability)
│   ├── products.json          # THE output
│   └── products.schema.json   # JSON Schema, validated in CI
└── docs/superpowers/specs/
```

---

## Architecture: four stages

Each stage reads/writes a versioned artifact in `data/interim/`, so any stage can be
re-run or resumed without repeating expensive work.

### 1. Ingest → `interim/pitches.json`
- **Source A (backbone):** Kaggle `thirumani/shark-tank-us-dataset` — Seasons 1–16,
  ~1,038 pitches, 52 columns (deal amounts, equity, founders, industry, description).
- **Source B (top-up):** Season 17+ (not in the dataset). Wikipedia "List of Shark
  Tank episodes" + a recap source, LLM-assisted parse. Small volume (~1 season).
- Normalize both into a `Pitch` with a stable `id` (`s{season}e{episode}-{slug}`).
- **Licensing:** confirm the Kaggle dataset license permits derived redistribution
  before shipping (record the license in `data/raw/`).

### 2. Filter → `interim/no_deal.json`
- Keep pitches where `got_deal == false` (derived from null/zero deal amount).
- Expected ~40% of pitches → ~400–440 candidates.

### 3. Verify (the hard part) → `interim/verified.json`
For each candidate, gather **signals** (all cached + rate-limited):

| Signal | Failure indicator |
|---|---|
| Website liveness | NXDOMAIN / parked / dead vs. live |
| Wayback Machine | last snapshot long ago = likely dead |
| Social media | dormant accounts (last post age) |
| News search | "shut down / closed / out of business / bankruptcy" |
| USPTO TSDR | trademark `dead` / `abandoned` / `cancelled` |

Signals feed a **Claude API classification pass** (temperature 0, prompt-cached
system instructions, optionally Batch API) that returns:

```
status:      active | failed-confirmed | defunct-likely | unknown
confidence:  0.0–1.0
why_failed:  short narrative (only when failed)
evidence:    [{ claim, source_url, date }]
```

**Hard rule (defamation guardrail):** the classifier must **not** assert failure
without at least one citable, dated source. Absent evidence → `unknown`. When signals
conflict (e.g., dead site but live trademark) → `unknown`, never `failed`.

### 4. Assemble → `data/products.json`
- Merge pitch + verification.
- Resolve **media**: best-available `image_url` (Wayback snapshot of the former site,
  or dataset image — final art is sub-project #2) with provenance; `youtube_url` for
  the episode/segment (link/embed only, never rehosted).
- Compute `mint_eligible` / `review_required` from the qualification rule below.
- Validate against `products.schema.json`.

### Qualification rule
Eligibility requires **both** a failure label and sufficient confidence:

| Condition | Result |
|---|---|
| label `failed-confirmed` **and** confidence ≥ 0.80 | `mint_eligible: true`, no review |
| any failure label (`failed-confirmed` / `defunct-likely`) with confidence 0.60–0.79 | `mint_eligible: true`, `review_required: true` |
| confidence < 0.60, **or** label `active`, **or** label `unknown` | `mint_eligible: false` (kept in dataset, unminted) |

---

## Output schema (per record)

```jsonc
{
  "id": "s5e12-exampleco",
  "season": 5, "episode": 12, "air_date": "2013-11-15",
  "company_name": "...", "product_name": "...",
  "founders": ["..."],
  "industry": "...",
  "pitch": {
    "ask_amount": 100000, "ask_equity": 10,
    "implied_valuation": 1000000, "description": "..."
  },
  "outcome": { "got_deal": false },
  "status": {
    "label": "failed-confirmed", "confidence": 0.92, "verified_at": "2026-05-22",
    "why_failed": "...",
    "evidence": [{ "claim": "...", "source_url": "https://...", "date": "2017-03-01" }]
  },
  "media": {
    "image_url": "...", "image_source": "wayback|dataset|none",
    "former_website": "https://...", "youtube_url": "https://..."
  },
  "mint_eligible": true,
  "review_required": false,
  "token": null   // populated by later sub-projects (ticker, mint address)
}
```

---

## Error handling & resumability
- **Network:** retry with backoff; on persistent failure a signal is `null` (missing),
  never interpreted as failure.
- **Rate limits:** per-host throttling; every external lookup cached on disk so reruns
  don't refetch.
- **Idempotent stages:** intermediate artifacts make the pipeline resumable
  (`cli.py --resume`); re-running is safe and cheap.
- **Determinism:** classification pinned to temperature 0; model id + prompt version
  recorded per record so results are reproducible/auditable.
- **Degrade gracefully:** missing data → `unknown`, not a guess.

## Testing plan
- **Unit:** ingest normalization, no-deal filter, schema validation, and the
  qualification-rule mapping (status + confidence → `mint_eligible` / `review_required`).
- **Fixture-based:** canned signal payloads → mocked classifier → expected status,
  including the conflicting-signals → `unknown` case.
- **Golden set:** a hand-labeled set of ~15–20 known cases — verified at implementation
  time — that **must** include no-deal companies that went on to *thrive*. The
  classifier must label those `active` (never `failed`). This is the primary regression
  test for the defamation guardrail. (Labels are verified during implementation, not
  asserted here.)
- **CI:** unit + fixture tests run on every change; the golden set (uses live
  API/web) runs on a schedule or manually, not per-commit.

## Cost & performance
- ~400 candidates × (a few cached web fetches + 1 classify call). Prompt caching +
  Batch API keep classification cost modest; web checks dominate wall-clock → solved
  by caching + bounded concurrency.

## Downstream parameter (recorded for #3)
- Dev buy fixed at **1.5% = 0.4306 SOL/token** (pump.fun opening-curve price; a hair
  under half the 3% cost due to curve convexity). Total buy capital ≈
  `0.4306 × (count of mint_eligible)`. This count is the project's capital driver —
  the reason this pipeline is built first. The 1.5% fraction is launcher config, not
  hardcoded.

## Open questions / deferred
- Confirm Kaggle dataset license before redistribution.
- Final image/art strategy (Wayback vs. AI-generated) — decided in #2; pipeline stores
  best available.
- S17+ top-up source reliability — validate during implementation.

## Risks
- **Defamation** — mitigated by sources + confidence + `unknown` default + human review
  for borderline + the golden-set survivor test.
- **Verification ceiling** — some companies are genuinely unverifiable; they stay
  `unknown` and unminted. Acceptable: fewer, more-defensible tokens.
- **IP/trademark/likeness** of using product names & images — cross-project; addressed
  via tribute framing, disclaimers, and a recommended legal review before launch.
- **Dataset freshness** — backbone ends at S16; the top-up step covers the gap.
