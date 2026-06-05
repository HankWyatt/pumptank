# PUMPTANK Index-Token Launch — Design Spec

_Date: 2026-06-05. **Rev 2 (post agent-review).** A standalone command to launch the index ($PUMPTANK) pump.fun token with a 10%-of-supply dev-buy, run before the 1,481 create-only product tokens. Status: approved design; spec rev 2 incorporates the adversarial code review (agent ac201e7)._

## Vision / decisions (locked with the user)

- The index token is **a pump.fun coin too** (same `create_v2` path, Token-2022, 6 decimals, 1e15 supply), **SOL-paired**.
- It launches **first** — before the product batch — so it exists before anything references the PUMPTANK treasury, and so its mint can be verified before the big run. It is **the only dev-buy in the entire project** (products are all create-only after the 2026-06-05 pivot — see `2026-06-04-pumptank-all-products-design.md`).
- **Dev-buy = 10% of supply** on the dev/house wallet (`1e14` base units = 1.5e13 × 6.67).
- **Identity:** name `PUMPTANK`, symbol `PUMPTANK`. Image = the user's logo, **converted to a 1000×1000 PNG** `data/index/pumptanklogo.png` (source `pumptanklogo.jpg`, 1254×1254). Description (locked): _"PUMPTANK — the index token of the unofficial Shark Tank tribute. Trading fees from every product token flow to the PUMPTANK treasury. Unofficial parody; not affiliated with Shark Tank/ABC/Sony; not financial advice; no promise of value."_
- **Fees:** the index token gets **no fee-sharing config** → 100% of its own trading fees stay in the house creator-vault (swept by the existing `fees collect` via `collect_creator_fee_v2`; the "legacy collect fails on sharing_config coins" caveat does NOT apply — the index has none). No founder, no 80/10/10. `MAIN_TOKEN_WALLET` (the 10% treasury that opted-in *founders'* fees route to) is a **separate** wallet, unrelated to and unchanged by this launch.

## Cost — computed on-chain, not assumed

Curve math (`cost = vQuote·ΔT/(vToken−ΔT)`, +on-chain fee): with mainnet genesis reserves vSol≈30e9, vTok≈1.073e15, **1.5%→0.4296 SOL** (matches the validated product figure) and **10% (ΔT=1e14)→~3.11 SOL**. ΔT is ~12.6% of the curve's ~793M real token reserves — well within range.

**The review's gap fix:** those reserve constants live nowhere in-repo and a 10% buy magnifies any drift ~7×. So `index-launch.ts` **computes the required SOL from the fetched on-chain `Global`** (the launcher already calls `fetchGlobal()`), using the SDK bonding-curve helper for `amount=1e14` on a genesis curve, then sets `solAmount = cost × (1 + slippageBps/1e4)`. `INDEX_DEV_BUY_SOL` (default 3.5) is a **safety ceiling**: abort before broadcast if the computed cost exceeds it. Note the SDK also adds its own hardcoded 1% on top to form the on-chain `max_sol_cost` (`sdk.ts:497,635`) — buffers stack, so the cap only ever errs high (safe). Total mainnet budget ≈ ~30 SOL (1,481 × ~0.02 rent) + ~3.5 SOL (index) ≈ **~33.5 SOL**.

## Architecture

Reuse the engine end-to-end; the index is one `LaunchItem` with `devBuy=true` and **its own** opts. No new on-chain logic.

| Unit | Responsibility |
|---|---|
| `launcher/src/index-launch.ts` (new) | Build the index `LaunchItem` (name/symbol/description/`imagePath`) + **its own** `LaunchOpts` (`devBuyTokens=1e14`, `solCapLamports` computed from on-chain `Global`) + **its own** runBatch `cfg` (`devBuySol`/`maxTotalSpendSol` sized for the index, NOT the product values). Build/reuse the ALT. Run the single item through the existing `runBatch([indexItem], ledger, mintstore, launchFn, mintExistsOnChain, cfg)`. Emit its **own** preview line (do NOT call `cli.ts preview()`, which is hardwired to product `cfg.devBuySol`). Print the resulting mint. |
| `launcher/src/launch.ts` | **Unchanged.** Its `devBuy` branch (`createV2AndBuy` + ALT + CU 300k, sign `[wallet, mint]`) is exactly what the index needs; takes amount/solAmount from `LaunchOpts`. |
| `launcher/src/alt.ts` | **Unchanged.** `computeStaticLutAddresses` (intersection — static accounts are amount-independent, so a 10% sample yields the same set) + `loadOrCreateLookupTable` → `data/launch-alt.json`. The index run is what **creates** this file (it's the project's only dev-buy). |
| `launcher/src/metadata.ts` | **Unchanged** — *because* we feed it a PNG. (`metadata.ts:17` hardcodes `image/png` + `${symbol}.png`; a JPEG would upload mislabeled. The 1000×1000 PNG uses the products' byte-proven path.) |
| `launcher/src/orchestrate.ts` (`runBatch`), `ledger.ts`, `mintstore.ts`, `recover.ts` | **Unchanged.** Crash-safe + idempotent per id; `index-pumptank` is just another id. Spend cap gates on `item.devBuy` → `maxTotalSpendSol` must be ≥ the index cap (see Config). |
| `launcher/src/config.ts` | Add `INDEX_*` reads; keep product `devBuyTokens`/`devBuySol` untouched (index supplies its own). |
| `launcher/package.json` | New script `launch:index`. |

## Config / env contract

`index-launch.ts` reuses the **same** env contract `buildConfig` already enforces, plus index-specifics:
- Reused (already required by `buildConfig`/`wallet.ts`): `WALLET`, `RPC_URL`, `MAX_TOTAL_SPEND_SOL` (must be set ≥ the ~3.5 index cap or runBatch throws), `SLIPPAGE_BPS`, `PRIORITY_FEE`.
- New: `INDEX_DEV_BUY_SOL` (default 3.5, safety ceiling), `--image <path>` flag (default `data/index/pumptanklogo.png`; **new** flag — add parsing), `--confirm` (default dry-run, same as the product CLI).
- Constants in `index-launch.ts`: `INDEX_NAME="PUMPTANK"`, `INDEX_SYMBOL="PUMPTANK"`, `INDEX_DESCRIPTION` (locked text), `INDEX_DEV_BUY_TOKENS=100_000_000_000_000n` (1e14).

## Data flow

`npm run launch:index` →
1. Parse args/env (`--confirm`, `--image`, `INDEX_DEV_BUY_SOL`); fail fast if the image path is missing.
2. Build the index `LaunchItem`.
3. Preview line: `Would launch index token $PUMPTANK with a 10% dev-buy (~<computed> SOL, cap <ceiling>) + ~0.02 SOL rent`. Dry-run stops here (compute cost from `Global` if reachable, else show the estimate).
4. `--confirm`: funding precheck (cap×1.08 + rent) → load SDK via `createRequire` → `fetchGlobal()` → **compute the 10% cost from Global; abort if > `INDEX_DEV_BUY_SOL`** → build/reuse ALT → `runBatch([indexItem], …)` (uploads metadata, one atomic `createV2AndBuy` tx) → ledger write → print the **$PUMPTANK mint**.

## Idempotency / error handling

- `runBatch` (reused) gives crash-safety: ledger id `index-pumptank`; prior `success` short-circuits; prior `attempting`/`failed` checks `mintExistsOnChain` before retry; `MintStore` reuses the same mint keypair on retry.
- Spend-cap trip happens **before** any attempt (orchestrate.ts) → clean no-op; just raise `MAX_TOTAL_SPEND_SOL`.
- **Single high-value coin caveat:** if the tx is sent but confirmation times out, the row is `attempting`; **manually verify the mint on-chain before any re-run** (don't blindly retry a ~3.5 SOL buy).
- Cap-too-low → tx reverts on `max_sol_cost`; raise `INDEX_DEV_BUY_SOL`. Create+buy is one atomic tx → no partial state.

## Testing (TDD)

- **Unit (offline, mock SDK like `cli.test.ts`):** index `LaunchItem`/`LaunchOpts` assembly (`devBuyTokens===1e14`); cost-from-Global computation + the ceiling-abort; its own preview string; missing-image guard; `--confirm` gate; that it does NOT reuse product `devBuySol`/`devBuyTokens`.
- **Reuse** `launchOne`/`runBatch`/`alt` existing unit tests (unchanged paths).
- **Devnet:** simulate the index `createV2AndBuy` (10% buy) with the funded devnet wallet → expect `err=null` (confirms 10% is buyable at genesis in one ALT tx).
- **Mainnet pre-broadcast gate:** read `Global` (PDA `4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf`), confirm `initial_virtual_*_reserves` + `creator_fee_basis_points`, recompute the cost, then **`simulateTransaction` the real 10% create+buy → expect `err=null`** before the real send. (Devnet Global can differ from mainnet.)

## Out of scope

- Setting `MAIN_TOKEN_WALLET` (a separate treasury the user controls).
- Wiring the index mint into the website (it's not a Shark Tank product; no `products.json` row). Featuring $PUMPTANK on the site is a separate change.
- The product batch (already built; runs after, unchanged).

## Operational order (mainnet, gated)

1. `npm run launch:index` (dry-run) → review → `--confirm` → record the $PUMPTANK mint.
2. `npm run launch --confirm` → the 1,481 create-only products.
3. Backfill / web / fee opt-ins as already specified.
