# PUMPTANK Index-Token Launch — Design Spec

_Date: 2026-06-05. A standalone command to launch the index ($PUMPTANK) pump.fun token with a 10%-of-supply dev-buy, run before the 1,481 create-only product tokens. Status: approved, pending spec review._

## Vision / decisions (locked with the user)

- The index token is **a pump.fun coin too** (same `create_v2` path, Token-2022, 6 decimals, 1e15 supply), **SOL-paired**.
- It launches **first** — before the product batch — so it exists before anything references the PUMPTANK treasury, and so its mint can be verified before the big run.
- **Dev-buy = 10% of supply** on the dev/house wallet (`1e14` base units). This is the project's only remaining dev-buy (products are all create-only after the 2026-06-05 pivot — see `2026-06-04-pumptank-all-products-design.md`).
- **Identity:** name `PUMPTANK`, symbol `PUMPTANK`. Image = the user's logo `data/index/pumptanklogo.jpg` (1254×1254 square JPEG). Description (locked): _"PUMPTANK — the index token of the unofficial Shark Tank tribute. Trading fees from every product token flow to the PUMPTANK treasury. Unofficial parody; not affiliated with Shark Tank/ABC/Sony; not financial advice; no promise of value."_
- **Fees:** the index token gets **no fee-sharing config** → 100% of its own trading fees stay in the house creator-vault (swept by the existing `fees collect`). It has no founder, so no 80/10/10 split. `MAIN_TOKEN_WALLET` (the 10% treasury that opted-in *founders'* fees route to) is a **separate** wallet, unrelated to and unchanged by this launch.

## Cost

The 10% buy is the **first instruction on a brand-new bonding curve** (atomic with `create`), so there is no front-running/slippage between dry-run and broadcast — cost is deterministic. Curve math `cost = vSOL·ΔT/(vToken−ΔT)` with mainnet genesis reserves (vSOL≈30, vToken≈1.073e9): 1.5%≈0.43 SOL (matches the verified product figure), **10%≈3.1 SOL**. Cap defaults to **~3.5 SOL** (`INDEX_DEV_BUY_SOL`) as a safe ceiling + create rent + priority fee. Total mainnet budget becomes ~30 SOL (products) + ~3.4 SOL (index) ≈ **~33.4 SOL**.

## Architecture

Reuse the existing engine end-to-end; the index is just a single `LaunchItem` with `devBuy=true` and index-specific opts. No new on-chain logic.

| Unit | Responsibility |
|---|---|
| `launcher/src/index-launch.ts` (new) | Assemble the index `LaunchItem` (name/symbol/description/imagePath) + `LaunchOpts` (10% tokens, SOL cap). Build/reuse the ALT (create+buy needs it). Run the single item through the existing **`runBatch([indexItem], ledger, mintstore, launchFn, mintExistsOnChain, cfg)`** — reusing the ledger + crash-safe recover + the on-chain-exists guard for free — which calls `launchOne(devBuy=true)`. Print the resulting mint. |
| `launcher/src/launch.ts` | **Unchanged.** Its `devBuy` branch (`createV2AndBuy` + ALT + CU 300k) already does exactly what the index needs. |
| `launcher/src/alt.ts` | **Unchanged.** `computeStaticLutAddresses` + `loadOrCreateLookupTable` reused (same `data/launch-alt.json`). |
| `launcher/src/metadata.ts` | **Unchanged.** `uploadTokenMetadata(item)` uploads the logo + JSON to `pump.fun/api/ipfs` → uri. |
| `launcher/src/ledger.ts` / `mintstore.ts` / `recover.ts` | **Unchanged.** Crash-safe + idempotent per id; `index-pumptank` is just another id. |
| `launcher/src/config.ts` | Add `INDEX_*` (see Config). |
| `launcher/package.json` | New script `launch:index`. |

## Data flow

`launch:index` →
1. Parse args/env: `--confirm` (default dry-run), `--image <path>` (default `data/index/pumptanklogo.jpg`), `INDEX_DEV_BUY_SOL`, RPC, wallet.
2. Build the index `LaunchItem` + `LaunchOpts` (`devBuyTokens=1e14`, `solCapLamports` from `INDEX_DEV_BUY_SOL`+slippage).
3. Preview line: `Would launch index token PUMPTANK with a 10% dev-buy (~X SOL cap) + rent`. Dry-run stops here.
4. `--confirm`: funding precheck (cap×1.08 + rent) → load SDK (createRequire) → `fetchGlobal` → build/reuse ALT → `launchOne(devBuy=true)` (uploads metadata, one atomic `createV2AndBuy` tx signed `[wallet, mint]`) → ledger write → print the **$PUMPTANK mint**.

## Idempotency / error handling

- `runBatch` (reused) gives crash-safety for free: ledger id `index-pumptank`, a prior `success` short-circuits (won't relaunch), a prior `attempting`/`failed` checks `mintExistsOnChain` before retry.
- The batch spend cap (`cfg.maxTotalSpendSol`, gated on `item.devBuy`) must be configured ≥ the ~3.5 SOL index dev-buy for the `--confirm` run; otherwise `runBatch` refuses to spend. Set it for this run.
- If `--image` path is missing → fail fast before any broadcast.
- Cap too low (tx reverts) → surfaced as the send error; bump `INDEX_DEV_BUY_SOL`. (No silent partial state — create+buy is one atomic tx.)

## Testing (TDD)

- Unit: index `LaunchItem`/`LaunchOpts` assembly (10% = `1e14`; cap math from `INDEX_DEV_BUY_SOL`); preview string; missing-image guard; `--confirm` gate. Offline (mock SDK like `cli.test.ts`).
- Reuse `launchOne`'s existing unit tests (unchanged path).
- **Devnet before mainnet:** simulate the index `createV2AndBuy` (10% buy) with the funded devnet wallet → expect `err=null` (confirms 10% is buyable at genesis in one ALT tx + the cap holds). Mirrors the product devnet proof.

## Out of scope

- Setting `MAIN_TOKEN_WALLET` (a separate treasury address the user controls).
- Any post-launch wiring of the index mint into the website/products (the index is not a Shark Tank product; it has no `products.json` row). If the site should feature $PUMPTANK, that's a separate change.
- The product batch itself (already built; runs after, unchanged).

## Operational order (mainnet, gated)

1. `npm run launch:index` (dry-run) → review → `--confirm` → record the $PUMPTANK mint.
2. `npm run launch --confirm` → the 1,481 create-only products.
3. Backfill / web / fee opt-ins as already specified.
