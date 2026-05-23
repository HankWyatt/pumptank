# Token Text Metadata (name / ticker / description) — Design Spec

**Date:** 2026-05-23
**Status:** Draft for review (agent-review fixes applied)
**Sub-project:** 2a (text half of sub-project 2 — token assets). Images = 2b, separate spec.

---

## Project context (PUMPTANK)

For each of the **100 selected** no-deal Shark Tank pitches (`include == true` in
`data/products.json`), we mint a pump.fun tribute token. Each token needs metadata:
a **name**, a **ticker/symbol**, a **description**, and an **image**. This spec covers
the three **text** fields — deterministic, generated from data already in
`products.json`. The image is sub-project **2b** (separate: it carries external
dependencies and the project's heaviest IP question).

Guardrails this spec must embody: tokens are **unaffiliated tribute / parody** coins;
the one factual on-record claim is *"pitched on Shark Tank, got no deal"*; **no
investment promise**; never label a company a "failure." The disclaimer text is a
**draft pending the recommended legal review** and lives in config (a one-line change).

## Goal

Add a stage that, for every selected pitch, generates `{name, symbol, description}` and
stores them on the record's `token` field, deterministically and within pump.fun's field
limits.

**Done means:** running the pipeline yields a schema-valid `products.json` where every
`include == true` record has a populated `token` block with a cleaned `name`, a unique
uppercase `symbol`, and a `description` containing the product blurb, the factual no-deal
hook, and the disclaimer; non-selected records keep `token: null`.

## Non-goals

- **Images** (2b); any on-chain action or the real pump.fun create call (#3).
- Confirming pump.fun's exact byte limits — treated as conservative config here,
  cross-checked when #3 calls the create API.
- Per-token manual copywriting — generation is deterministic; a small `NAME_OVERRIDES`
  map handles the few names that auto-clean badly.

## Inputs (already in `products.json`)

Per selected record: `company_name` (dataset name, often de-spaced e.g.
`SmartTireCompany`), `industry`, `season`, `episode`, `pitch.description` (mixed quality:
real blurbs like *"Premium refrigerated pie"*, or junky *"Skyride - Outdoor Recreation"*).
Coverage among the 100: description 100/100, founders/website 86/100 (neither used here).

## Generation rules

### 1. Name (`token.name`) — de-smoosh the dataset name
- If `company_name` already contains a space, keep it.
- Else insert spaces at camelCase boundaries:
  - before an uppercase preceded by a lowercase/digit: `(?<=[a-z0-9])(?=[A-Z])`
  - before an acronym→word boundary: `(?<=[A-Z])(?=[A-Z][a-z])`
  - collapse repeated whitespace.
  - `SmartTireCompany→"Smart Tire Company"`, `BelloVerde→"Bello Verde"`,
    `TheHappyBirdwatcher→"The Happy Birdwatcher"`; all-caps/short stay (`ALL33`,
    `Skyride`, `Joyebells`).
- `NAME_OVERRIDES` (config, keyed by product `id`) wins over the algorithm, for names with
  letter↔digit boundaries the camelCase regex doesn't handle. **Empirically only 2 of the
  100 need it:** `Buzzy4Shots → "Buzzy 4 Shots"` and `50StateCapitalsin50Minutes → "50
  States in 50 Minutes"`. The implementer confirms by eyeballing the 100 rendered names.

### 2. Ticker (`token.symbol`) — uppercase cashtag, ≤ `MAX_TICKER_LEN` (10)
- Start from the cleaned name; strip a leading `"The "` and trailing corporate suffixes
  (`Company|Co|Inc|LLC|Corp`, case-insensitive); remove non-alphanumerics; uppercase;
  truncate to `MAX_TICKER_LEN`.
  - `Smart Tire Company→SMARTTIRE`, `Bello Verde→BELLOVERDE`, `Skyride→SKYRIDE`,
    `Joyebells→JOYEBELLS`, `ALL33→ALL33`.
- **Uniqueness across the 100:** iterate selected records in `selection.rank` order; if a
  symbol is already taken, append the smallest integer ≥ 2 that makes it unique
  (truncating the base further if needed to stay within `MAX_TICKER_LEN`). Deterministic.
- If a name yields an empty symbol (all non-alphanumeric), fall back to `TKN` + rank.

### 3. Description (`token.description`)
Assembled as: `"{blurb} Pitched on Shark Tank S{season}E{episode} — no deal. {DISCLAIMER}"`
- **blurb (hybrid):** use `pitch.description` verbatim **unless** it is the junky
  `"{Name} - {Category}"` pattern. **Detection:** the description contains a dash
  *surrounded by whitespace* — regex `\s[-–—]\s` (a spaced hyphen / en-dash / em-dash).
  This cleanly separates templated rows from real blurbs, whose hyphens are intra-word.
  (The trailing category is NOT the structured `industry` value, so it can't be matched
  against `industry`; the spaced dash is the reliable signal.) On junk → template
  `"{cleaned name}, a {industry} product."`. Ensure the blurb ends with a period.
  - `"Skyride - Outdoor Recreation"` → junk (spaced dash) → `"Skyride, a Fitness/Sports/Outdoors product."`
  - `"Invisible Xero Shoes - Men and Women's Shoes"` → junk (spaced dash) → template — a leading-modifier case a "starts-with-name" test would miss.
  - `"High-performance airless tires"`, `"plant-based nutritional supplements"` → kept (intra-word hyphens, no spaced dash).
  - *Empirically validated on the 100: flags 56, keeps 44, zero false positives.*
- **factual hook:** `"Pitched on Shark Tank S{season}E{episode} — no deal."`
- **DISCLAIMER (config, draft pending legal review):** *"Unofficial fan tribute & parody
  token. Not affiliated with or endorsed by the company, its founders, or Shark Tank /
  ABC / Sony. Not financial advice; no promise of value."*
- **Length:** if the full string exceeds `MAX_DESCRIPTION_LEN`, truncate **only the
  blurb** (the hook + disclaimer are mandatory and never trimmed); add an ellipsis.

## Output schema

Replace `Product.token: Optional[dict]` with a typed submodel; selected records get it,
others stay `null`:

```jsonc
"token": {
  "name": "Smart Tire Company",
  "symbol": "SMARTTIRE",
  "description": "High-performance airless tires. Pitched on Shark Tank S13E10 — no deal. Unofficial fan tribute & parody token. ...",
  "mint": null            // filled by sub-project 3 at launch
}
```

## Architecture

- **New module** `pipeline/pumptank_pipeline/assets.py` — one responsibility: generate
  text metadata.
  - Interface: `generate_assets(pitches: list[Pitch], *, max_ticker_len, max_description_len, disclaimer, name_overrides) -> list[Pitch]` — pure function; sets `pitch.token` on every `include == True` pitch (iterating in `selection.rank` order for deterministic ticker dedup), leaves others untouched; returns all.
  - Plain Python; helpers `_clean_name`, `_derive_symbol`, `_compose_description`,
    `_is_junk_blurb` are individually unit-testable.
- **`models.py`:** add `TokenAssets` (`name: str`, `symbol: str`, `description: str`,
  `mint: Optional[str] = None`). `Pitch` and `Product` get `token: Optional[TokenAssets] = None`; `to_product_fields` passes `token=pitch.token`.
- **CLI wiring:** `ingest → filter → rank → assets → assemble`. `run()` calls
  `generate_assets(ranked, ...)` before `write_products`.
- **`config.py`:** `MAX_TICKER_LEN = 10`, `MAX_DESCRIPTION_LEN` (default conservative,
  e.g. 480; confirm with #3), `TOKEN_DISCLAIMER = "..."`, `NAME_OVERRIDES = {}`.
- **`assemble.py`:** unchanged (regenerates schema from the model).

## Determinism

Same `products.json` → identical token assets. No randomness, no network. Ticker dedup is
ordered by `selection.rank`, so it's stable.

## Error handling / edge cases

- Empty/all-symbolic name → `TKN{rank}` fallback symbol; name falls back to the raw
  `company_name`.
- Missing `industry` (shouldn't happen — 100% present) → template omits it:
  `"{Name}, a Shark Tank product."`.
- Non-selected records (`include == False`) are never given a `token`.

## Testing plan

**Unit (`assets.py`, synthetic `Pitch` lists):**
- `_clean_name`: camelCase, acronym, all-caps, already-spaced, override wins.
- `_derive_symbol`: suffix/`The` stripping, truncation, uppercase, empty→`TKN` fallback.
- ticker **uniqueness**: two pitches whose names collide get distinct symbols, ordered by rank.
- `_is_junk_blurb`: spaced-dash blurb (`"X - Y"`, including leading-modifier `"Invisible X - Y"`) → True; intra-word-hyphen blurb (`"High-performance airless tires"`) → False; no-dash blurb → False.
- `_compose_description`: contains the blurb, the `S{e}E{e} — no deal` hook, and the disclaimer; over-length truncates the **blurb only** and keeps the disclaimer intact.
- only `include == True` pitches get a `token`; others stay `None`.

**Integration:** end-to-end CLI on a fixture CSV → selected records have a `token` block; `products.json` validates against the regenerated schema; ticker collisions across the fixture are unique.

## Open questions / cross-checks

- **Legal review of the `DISCLAIMER`** before public launch (config one-liner).
- **Exact pump.fun limits** (`symbol` length, `description` length) confirmed in #3; the
  config defaults are conservative.
- `NAME_OVERRIDES` populated after inspecting the 100 rendered names (an implementation step).

## Risks

- **Auto-de-smooshing is imperfect** for digit-laden / unusual names — mitigated by
  `NAME_OVERRIDES`; the failure mode is a cosmetically odd name, never a crash.
- **Ticker truncation is lossy** for long names (`The Happy Birdwatcher → HAPPYBIRDW`,
  after stripping the leading "The") — accepted; uniqueness is still guaranteed.
- **Disclaimer adequacy** is a legal question, not a code one — flagged for review.

## Review (2026-05-23)

Independent agent review (Opus 4.7) ran the proposed algorithms against the real 100
records. Findings: name de-smoosh wrong on only **2/100** (`Buzzy4Shots`,
`50StateCapitalsin50Minutes` → both now named as `NAME_OVERRIDES`); ticker derivation
**0 collisions / 0 empty fallbacks / 100 unique** (so the dedup and `TKN{rank}` paths are
defensive-only — kept under unit test, never exercised by real input); descriptions are
**220–273 chars** (so `MAX_DESCRIPTION_LEN=480` and the blurb-truncation path are
defensive-only too). Verdict **APPROVE WITH CHANGES**. Applied: (1) replaced the
"starts-with-name" junk test with a **spaced-dash** heuristic (`\s[-–—]\s`) — empirically
flags 56, keeps 44, **zero false positives**, and catches two leading-modifier blurbs the
old rule missed (`Invisible Xero Shoes - …`, `Cuddle Story Telling Bear - …`); (2) fixed
the `The Happy Birdwatcher → HAPPYBIRDW` ticker example (the algorithm strips leading
"The"); (3) named the 2 confirmed `NAME_OVERRIDES`; (4) noted the defensive-only paths so
they stay unit-tested without an integration trigger.
