# PUMPTANK Fee-Routing Rebuild (SOL) — Design Spec

_Date: 2026-06-04. Sub-project B. Status: design, approved to build ("build it"). Kept in PUMPTANK (not upstreamed)._

## Why

The launcher's fee path is obsolete: `collect.ts` uses PumpPortal's legacy `collectCreatorFee` (fails on any coin migrated to a `sharing_config`, and is a third-party dependency), and the runbook assumes a **manual pump.fun-UI** 80/20 change. pump.fun moved creator-fee sharing to the on-chain **Pump Fees program** (`create_fee_sharing_config` → `update_fee_shares_v2` → `distribute_creator_fees_v2`), and single-recipient collection to `collect_creator_fee_v2` / `collect_coin_creator_fee`. Rebuild the fee path on the official `@pump-fun/pump-sdk@1.36.0` (SOL), dropping PumpPortal. Post-launch/operational; runs as founders opt in over time.

PUMPTANK model (unchanged intent): every coin launches **100% house**; on a founder's opt-in, a **one-time** move to **80% founder / 20% house**, then locked.

## Key facts

- **All 100 coins share ONE bonding-curve creator vault** `["creator-vault", houseWallet]` (creator = the deployer/house wallet for every coin). So un-opted coins' bonding-curve fees pool there and are swept in a **single** `collect_creator_fee_v2` call.
- **Opting a coin in migrates THAT coin** off the shared vault: `create_fee_sharing_config` repoints `bonding_curve.creator` (and `pool.coin_creator` if graduated) to a per-coin `sharing_config` PDA; `update_fee_shares_v2` sets `[{founder, 8000}, {house, 2000}]` (sum 10000 bps, ≤10) and **revokes admin (one-time, locks)**. That coin's fees then flow to the sharing-config vault and are paid out by `distribute_creator_fees_v2`.
- Legacy `collect_creator_fee` FAILS once a coin has a `sharing_config` — so routing must branch on opt-in state.
- SOL throughout: `quoteMint = NATIVE_MINT`, `quoteTokenProgram = TOKEN_PROGRAM_ID`.
- The coin's `mint` comes from the launch ledger (`Ledger.get(id).mint`).

## SDK API (confirmed, `@pump-fun/pump-sdk@1.36.0`)

- `PumpSdk.createFeeSharingConfig({ creator, mint, pool })` — `pool` = canonical Pump AMM pool (or `null` if not graduated).
- `PumpSdk.updateFeeSharesV2({ authority, mint, currentShareholders, newShareholders, quoteMint, quoteTokenProgram })` — `newShareholders: Shareholder[]` (`{address, shareBps}`).
- `OnlinePumpSdk.buildDistributeCreatorFeesInstructions(mint)` → `DistributeCreatorFeeResult` (fetches sharing-config, handles graduated; high-level path for payout).
- `OnlinePumpSdk.collectCoinCreatorFeeV2Instructions(coinCreator, quoteMint, quoteTokenProgram, feePayer?)` — AMM-side collect (graduated coins).
- Bonding-curve single-recipient collect (`collect_creator_fee_v2`): if no convenience method exists on `PumpSdk`/`OnlinePumpSdk`, build it via the exported anchor program (`getPumpProgram(conn).methods.collectCreatorFeeV2()`), mirroring how PR1 built `buyV2`. **Resolve the exact method at implementation** (grep the SDK; prefer a built-in if present).
- SDK loaded via **`createRequire`** (CJS) like `cli.ts` — its ESM build is broken (anchor `BN` import).

## Architecture (file by file)

`launcher/` fee modules, rebuilt:

| File | Change |
|---|---|
| `src/collect.ts` | **Drop PumpPortal.** New SOL builders over the SDK: `getCreatorVaultClaimable(conn, creator)` (lamports in `["creator-vault", creator]`, minus rent), `buildCollectHouseFees(sdk, conn, house)` → `collect_creator_fee_v2` (+ AMM `collect_coin_creator_fee_v2` if graduated) instructions for the shared house vault. Sign + send via our RPC. |
| `src/feeconfig.ts` | Extend `FeeEntry` to carry `mint`, `pool` (string\|null), `founderWallet`, and proof sigs (`sharingConfigSig`, `setSharesSig`, `distributeSig`). State: `house_100` (no sharing-config) ↔ `split_80_20` (migrated). Keep the one-time/locked guard. |
| `src/feescli.ts` | Verbs: `status`, `verify` (preview claimable), `collect [--confirm]` (sweep the house vault for all un-opted coins), `optin <id> <founderWallet>` (record), `set-shares <id> [--confirm]` (ON-CHAIN: `createFeeSharingConfig` + `updateFeeSharesV2` [founder 8000, house 2000] — the one-time 80/20, then mark locked), `distribute <id> [--confirm]` (pay out an opted-in coin via `buildDistributeCreatorFeesInstructions`). Dry-run default + `--confirm`; `MIN_COLLECT_SOL` dust threshold. Read `mint` from the ledger. Drop `PUMPPORTAL_URL`. |
| `docs/fee-routing-runbook.md` | Rewrite: the on-chain flow (no manual UI, no PumpPortal). opt-in → `set-shares` (on-chain 80/20, one-time) → `distribute`; un-opted → `collect`. |
| Tests `test/{collect,feeconfig,feescli}.test.ts` | vitest, mock the SDK builders + connection. Assert: collect builds `collect_creator_fee_v2` for the house vault; `set-shares` builds `createFeeSharingConfig`+`updateFeeSharesV2` with `[{founder,8000},{house,2000}]` (sum 10000); the one-time/locked guard; dry-run gating; `distribute` wires `buildDistributeCreatorFeesInstructions`. |

## Flow

- **Launch → all coins 100% house.** Fees accrue to `["creator-vault", house]` (+ AMM coin-creator vault if graduated).
- **Collect (any time):** `fees collect --confirm` → sweep the shared house vault (un-opted coins) to the house wallet. One tx (+ AMM if any graduated).
- **Founder opt-in:** `fees optin <id> <founderWallet>` (record + vet) → `fees set-shares <id> --confirm` (on-chain `createFeeSharingConfig` + `updateFeeSharesV2` [founder 8000 / house 2000]; **one-time, locks**; mark `split_80_20`). That coin's future fees route to its sharing-config vault.
- **Distribute (opted-in coins):** `fees distribute <id> --confirm` → `buildDistributeCreatorFeesInstructions(mint)` pays the accrued vault 80/20 to founder+house.

## Guardrails / safety

- House wallet signs all fee txs (custody kept); dry-run default + `--confirm`; `MIN_COLLECT_SOL` dust gate; the 80/20 `set-shares` is one-time + locked (mirror on-chain `admin_revoked`), guarded in `feeconfig`. Transparent; no third parties (PumpPortal dropped). 80/20 honors the founder-share intent.

## Out of scope

Launch path (sub-project A, done) + its ALT follow-up; website (C). USDC fee handling (we launch SOL).

## Open questions (resolve at implementation)

1. **Bonding-curve `collect_creator_fee_v2` builder** — confirm whether `PumpSdk`/`OnlinePumpSdk` expose a convenience method; if not, build via `getPumpProgram(conn).methods.collectCreatorFeeV2()` (the IDL has it; accounts per `COLLECT_CREATOR_FEE.md`). 
2. **`pool` for `createFeeSharingConfig`** — `null` pre-graduation (our coins won't have graduated when founders opt in early); derive the canonical pool only if a coin has graduated (`canonicalPumpPoolPda`).
3. **`currentShareholders` for `updateFeeSharesV2`** — after `createFeeSharingConfig` the initial set is `[creator]` (= the house/sharing-config); pass `[house]` (or per the SDK's expectation) as `currentShareholders`.
