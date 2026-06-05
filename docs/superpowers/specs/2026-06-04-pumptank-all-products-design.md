# PUMPTANK All-Products Expansion — Design Spec

_Date: 2026-06-04. Expands the launch from 100 no-deal coins to a token for EVERY Shark Tank product (~1,485), dev-buying only the top-100 no-deal. Status: design, pending review._

## Vision / decisions (locked with the user)

- **Launch a token for ALL ~1,485 products** (914 got-deal + 571 no-deal), so every product feeds the $PUMPTANK main token.
- **Dev-buy 1.5% of supply ONLY on the top-100 no-deal** (existing `selection` top-100). The narrative: no-deal founders "got no deal, so here's a little extra — tokens." Everyone else is **create-only** (coin exists, fees flow, no dev-buy).
- **Deal products get a generic tribute card** (no "NO DEAL" badge, neutral description); the 571 no-deal keep the vermilion "NO DEAL" badge + "— no deal" hook.
- **Fees:** un-opted → house; on opt-in → 80/10/10 creator/main-token/referrer (already built).
- **Budget:** ~65–70 SOL (43 dev-buys + ~22–27 locked in create rent for the rest).

## Data model (`pipeline/.../models.py`)

The current `include` flag means "selected for minting (top-100)". Re-define for all-products:
- `include: bool` → **"launched"** (true for every product we mint).
- Add `dev_buy: bool` (default false) → **"gets the 1.5% dev-buy"** (the top-100 no-deal). The launcher branches on this.
- `Outcome.got_deal` → the **real** value (currently hardcoded False); surface it on `Product`.
- `to_product_fields` passes `got_deal` + `dev_buy`. Product gains `got_deal: bool`, `dev_buy: bool`.

## Pipeline changes

| Stage | Change |
|---|---|
| `filter.py` | Replace `filter_no_deal` with `split_products`: return ALL pitches as the launch set + the no-deal subset (for ranking the dev-buy 100). Don't drop deals. |
| `rank.py` | Rank the **no-deal** pool as today, but set `dev_buy = rank <= SELECT_TOP_N` (top-100) instead of `include`. Set `include = true` for ALL launched products; `dev_buy = false` for deals + non-top-100 no-deal + excluded. (EXCLUDE_IDS / out-of-scope-season / unfindable → `dev_buy = false`; see Open Q1 for whether they still launch.) |
| `assets.py` | Generate `.token` for **every** launched pitch (not just selected). Description branches on `got_deal`: no-deal → "… — no deal. {disclaimer}"; deal → "… Pitched on Shark Tank S{n}E{m}. {disclaimer}" (no "no deal" hook). Symbol de-dup runs across ALL ~1,485 in a deterministic order (dev-buy 100 by rank first — they get the clean cashtags — then the rest by id). |
| `images.py` | Render a card for **every** launched pitch. `got_deal` → generic card (omit the vermilion "NO DEAL" badge; keep PUMPTANK wordmark + name + $ticker + "Shark Tank S_E_" + industry + footer disclaimer). no-deal → unchanged (NO DEAL badge). |
| `assemble.py` | Writes all launched products (~1,485) to `products.json` + schema. |
| `cli.py` | New flow: ingest → overrides → `split_products` → rank (dev-buy selection on no-deal) → assets (all) → images (all) → assemble. Print deal/no-deal/dev-buy counts. |
| `config.py` | `SELECT_TOP_N=100` stays (dev-buy count). Add the deal-description template. EXCLUDE_IDS semantics per Open Q1. |

## Launcher (`launcher/`)

- `products.ts` / `loadLaunchItems`: load ALL launched products, each with a `devBuy: boolean` (from `dev_buy`).
- `launch.ts`: branch — `devBuy` → `createV2AndBuyInstructions` (+ the reusable ALT, as built); `!devBuy` → **create-only** = `createV2Instruction` (no buy). create_v2 alone is ~16 accounts and fits one legacy tx without an ALT (verify); still uploads metadata + signs `[wallet, mint]`.
- `cli.ts` / `orchestrate.ts`: the SOL spend cap covers only the 100 dev-buys; add a separate count/rent expectation for the create-only coins. Funding precheck: `100 × ~0.437 + ~1,485 × ~0.015` SOL.
- `config.ts`: `DEV_BUY_TOKENS` unchanged (1.5% only applied when `devBuy`).
- Crash-safe ledger / mintstore / recover: unchanged (per-id; works for both paths).

## Website

- `web/lib/products.ts`: it already filters `r.include` — now that's all ~1,485, so the site shows everything. Optionally surface `got_deal` (deal vs no-deal styling) + `dev_buy`. MintLink + the C backfill already handle live links. (The visual design is the user's separate WIP — coordinate.)

## Asset generation

Running the pipeline produces ~1,485 1000×1000 PNGs (Pillow) — a few minutes + significant disk. See Open Q2 (commit vs gitignore). At launch, the launcher uploads ~1,485 metadata JSONs to `pump.fun/api/ipfs` (slow but fine; paced).

## Resolved (2026-06-04)

1. **Too-big EXCLUDE_IDS → LAUNCH them all as create-only** ("they won't C&D a memecoin"). So ALL ~1,485 products launch (`include=true`). EXCLUDE_IDS stay OUT of the dev-buy ranking pool (so the curated top-100 dev-buy set is unchanged) but get `dev_buy=false` + launch. Net: nothing is excluded from launch; EXCLUDE_IDS only affect which no-deal coins get a dev-buy.
2. **Commit the ~1,485 card PNGs** to git (durable, simple static deploy). No gitignore change; the existing 100 stay tracked and the new ones join them in `data/token_images/` (+ `web/public/token_images/`).

## Notes (non-blocking)

- **Legal surface:** 914 deal products are real, successful brands → higher trademark/parody exposure. Disclaimers apply to all; a legal once-over covering deal brands is advisable before public launch (user accepts the risk — "memecoin").
- **Symbol aesthetics at 1,485:** cashtag de-dup appends digits more often; acceptable.

## Out of scope (later)

The long-term ecosystem (main-token fee aggregation dashboards, the community-pitch/vote "investor thing," UK/Dragon's Den expansion) — future, not this change.
