# Shark Tank No-Deal — Selection Stage (Top-N) Design Spec

**Date:** 2026-05-23
**Status:** Draft for review (review fixes applied)
**Sub-project:** 1b (extends sub-project 1, the no-deal data pipeline)

---

## Project context (PUMPTANK)

The no-deal pipeline (sub-project 1) produces every Shark Tank US pitch that got no
deal: **559** records for S1–S16 (567 including a partial, still-compiling S17). Each
token carries a transparent **1.5% dev buy ≈ 0.4306 SOL**, so minting *all* of them
would cost ≈ 240 SOL. To control cost while keeping the most compelling tokens, we mint
a curated **top-N** (default **100 ≈ 43.1 SOL**), chosen by a transparent, reproducible
**blended score** rather than hand-picking.

This spec covers the **selection stage only**. It slots between `filter` and `assemble`
in the existing pipeline and does not touch token assets (#2), launch (#3), fees (#4),
or the website (#5).

## Goal

Add a selection stage that ranks no-deal pitches by a blended score and marks the top N
(default 100) for minting, annotating **every** record with its score for transparency.

**Done means:** running the pipeline yields a schema-valid `products.json` in which
exactly N records (or all, if the candidate pool < N) have `include == true` and a
populated `selection` block; the ranking is deterministic and reproducible from the same
CSV; and every excluded record carries a machine-readable reason.

## Non-goals

- Token assets (#2), launch (#3), fee routing (#4), website (#5).
- **Season 17** — partial in the dataset (episodes 1–11 only, 4 unrecorded outcomes);
  a **fast-follow** re-rank once the season is fully compiled.
- Manual curation beyond the existing `include` flag (a future concern).

## Inputs — two new dataset columns to capture

Selection needs three signals. Two are not yet captured by sub-project 1's ingest:

| Signal | Status | Source column |
|--------|--------|---------------|
| `valuation_requested` | already captured | `Valuation Requested` |
| `founders` | already captured | `Entrepreneur Names` |
| **viewership** | **NEW** → new `Pitch.us_viewership` | `US Viewership` |
| **website** | **NEW** → new `Pitch.company_website`, surfaced as `media.former_website` (today always null) | `Company Website` |

`COLUMN_MAP` additions: `us_viewership → "US Viewership"`, `company_website →
"Company Website"`. Both are present in the live CSV (verified).

**Plumbing both fields end-to-end (don't stop at the `Pitch`):** `Pitch` gains
`us_viewership` and `company_website`, and ingest populates them — but `to_product_fields`
(in `models.py`) currently constructs **no `Media` object at all**, so the website would
never reach the output. It must be extended to build
`media = Media(former_website=pitch.company_website, …)`. `us_viewership` is surfaced as a
top-level `Product` field. Wiring only the `Pitch` field and not `to_product_fields` is
the trap to avoid.

## Selection method

1. **Candidate pool** = no-deal records (filter output) with `season ≤ MAX_SEASON` (16).
   Partial S17 is excluded this round.
2. **Findability floor** — drop records with **no founder AND no website** (84 records,
   all in S1–16) → **475 candidates**. We cannot "fund the product" of a company we
   cannot even identify, and the floor self-cleans the pool.
3. **Component scores**, each in `[0, 1]`:
   - `reach` = percentile rank of `us_viewership` **within the record's season**
     (de-biases the Season 5–6 ratings peak — a standout S16 episode competes fairly
     with a standout S6 one). Null viewership → `0` (see Error handling).
   - `ambition` = percentile rank of `valuation_requested` across the whole pool
     (a delusional ask is notable regardless of era). Null → `0`.
   - `findability` = `0.5·(founders nonempty) + 0.5·(former_website present)`. The floor
     has already removed the `0.0` case, so survivors score `0.5` (one of founder/site)
     or `1.0` (both) — an intended gradient that nudges fully-documented pitches up, not a
     double-count of the floor.
4. **`score` = 0.45·reach + 0.30·ambition + 0.25·findability.** Weights live in config
   and must sum to 1.0.
5. **Sort** descending by the 4-tuple **`(score, reach, ambition, id)`**, stable; assign
   `rank` `1..len(pool)`. The final `id` key guarantees byte-identical output even if a
   future dataset refresh produces a tie on score+reach+ambition.
6. **Select top N** (default 100) → `include = true`. If pool < N, select all and warn.

**Percentile rank** = fraction of the group (whole pool for ambition; same-season members
for reach) whose value is ≤ this record's, with ties sharing the averaged rank
(pandas `rank(pct=True)` semantics). Implemented in **plain Python** in `rank.py` so the
stage is unit-testable on synthetic `Pitch` lists without pandas or a CSV.

## Output schema additions (per record)

```jsonc
{
  // ... existing fields ...
  "us_viewership": 7.8,        // NEW top-level fact (millions); null if absent
  "include": true,             // = selection.selected; the launcher reads this
  "selection": {
    "selected": true,
    "rank": 7,                 // 1..pool size; null if not scored
    "score": 0.842,            // null if not scored
    "reach": 0.95,
    "ambition": 0.88,
    "findability": 1.0,
    "excluded_reason": null    // "out_of_scope_season" | "unfindable" | null
  }
}
```

- **Selected (top N):** `selected=true`, `include=true`, full components.
- **Scored but below the cut (ranks N+1..475):** `selected=false`, `include=false`,
  full components, `rank`/`score` populated, `excluded_reason=null` (explained by rank).
- **Floored / out-of-scope (un-findable, or S17):** `selected=false`, `include=false`,
  `rank=null`, `score=null`, components null, `excluded_reason` set.

**`include` precedence:** this stage *writes* `include = selection.selected`, and the
integration test asserts that invariant on freshly generated output. Manual curation (a
non-goal this round — the parent spec lets `include` double as a manual-drop flag) is
layered *after* generation: a human setting `include=false` on a selected record
intentionally overrides selection and is expected to break the auto invariant. Selection
never *reads* `include`.

Every no-deal pitch stays in `products.json` with its disposition explained — full
transparency and auditability; nothing is silently dropped.

## Architecture

- **New module** `pipeline/pumptank_pipeline/rank.py` — one responsibility: score + select.
  - Interface: `rank_and_select(pitches: list[Pitch], *, weights, n, max_season) -> list[Pitch]`
    — pure function, no I/O, returns annotated + sorted records.
  - Plain Python (no pandas), unit-testable on synthetic `Pitch` lists.
- **CLI wiring:** `ingest → filter → rank → assemble`. `filter` stays "Got Deal == 0
  only"; the season cap, findability floor, scoring, and N all live in `rank`.
- **`config.py`:** `SELECTION_WEIGHTS = {"reach":0.45,"ambition":0.30,"findability":0.25}`,
  `SELECT_TOP_N = 100`, `MAX_SEASON = 16`.
- **`models.py`:** `Pitch` gains `us_viewership` and `company_website`; `Product` gains
  `us_viewership` and a `Selection` submodel. **`to_product_fields` must be extended to
  build a populated `Media(former_website=pitch.company_website, …)`** — it currently
  constructs none, so `former_website` would otherwise stay null.
- **`assemble.py`:** regenerates the JSON Schema from the Pydantic models to include the
  new fields. (Schema *validation* is enforced by the **test suite**, not at runtime —
  matching sub-project 1's existing behavior; see Testing.)

## Determinism & reproducibility

Same CSV → byte-identical `products.json`. The sort uses the explicit 4-tuple key
`(score, reach, ambition, id)`, so the rank-N boundary is stable across runs and across
dataset refreshes. No randomness, no network.

## Error handling

- **Pool < N:** select all, `warnings.warn`, do not fail.
- **Null viewership → `reach = 0`.** Note: viewership is **100% present** for no-deal rows
  in the current CSV (verified), so no production record is affected and no season is
  all-null. This rule exists for robustness on synthetic test inputs, not as a load-bearing
  production path.
- **Missing new CSV columns:** ingest's existing missing-column guard raises `IngestError`
  once `US Viewership` / `Company Website` are in `COLUMN_MAP`.

## Testing plan

**Unit (`rank.py`, synthetic `Pitch` lists, deterministic):**
- within-season percentile correct on a hand-checked set;
- findability floor drops no-founder&no-website, keeps founder-only and website-only;
- `season > MAX_SEASON` excluded with `excluded_reason="out_of_scope_season"`;
- exactly N selected; pool < N selects all and warns;
- stable/reproducible ordering across repeated runs; documented boundary tie-break (incl.
  the `id` final key);
- null viewership/valuation → 0 contribution, no crash;
- `include == selection.selected` for every record.

**Integration:**
- end-to-end CLI on a fixture CSV passed via **explicit `--input`** (the
  `config.DEFAULT_CSV` basename does not match the real download — a pre-existing
  sub-project-1 nit, out of scope here — so tests and real runs must pass `--input`).
  `products.json` validates against the regenerated schema; `selected` count == N; new
  `us_viewership` / `former_website` populated.

## Downstream parameter (for #3)

Dev-buy budget = `0.4306 SOL × SELECT_TOP_N` = **≈ 43.1 SOL** at N=100. N is config; the
budget scales linearly (e.g. N=50 → ≈ 21.5 SOL, N=150 → ≈ 64.6 SOL).

## Open questions / fast-follow

- **S17 re-rank** once the dataset compiles the full season.
- **Weight tuning** is config-driven and cheap to re-run; `0.45/0.30/0.25` is the agreed
  default.
- **Dataset refreshes** (the author updates Kaggle) can shift rankings; `products.json`
  is regenerable, never hand-edited.

## Risks

- **Viewership is episode-level** — co-pitches in one episode share a `reach` value;
  accepted proxy, documented.
- **Residual Season-6 lean** even after season-relative normalization (S6 had the most
  high-rated episodes); accepted — the resulting mix is diverse across eras and industries.
- **Thin-season percentile coarseness** — `reach` is a within-season percentile, so a
  season with few pool members gives coarse, upward-biased scores to its weakest pitches
  (the bottom pitch in a 7-member season scores `reach ≈ 0.29` vs `≈ 0.02` in a 50-member
  season). Bounded — no season has ≤ 5 pool members — and accepted; flagged as a known
  property. A future mitigation could damp `reach` by season size if it distorts picks.
- **"Findable" in the dataset ≠ creator actually reachable** — a listed website may be
  dead. Sub-project #4 validates contactability at onboarding; selection only guarantees
  a starting point.

## Review (2026-05-23)

Independent agent review (Opus 4.7) verified all headline numbers against the CSV (pool
475, floor 84, S1–16 = 559, S17 = 8) and confirmed the integration claims against the
code. Verdict: **APPROVE WITH CHANGES**. Applied: (1) specified the new
`Pitch.company_website` field and the `to_product_fields → Media` wiring (the Critical
gap); (2) made the sort key a literal 4-tuple including `id`; (3) corrected the
null-viewership and schema-"validates" framing to match the actual 100%-coverage data and
test-only validation; (4) documented the thin-season percentile property and the
`include` / manual-curation precedence; (5) noted the pre-existing `DEFAULT_CSV` basename
mismatch for the integration test.
