# USDC Quote-Mint Support for `@nirholas/pump-sdk` — Design Spec

_Date: 2026-06-03. Status: design, pending user review._

## Why

pump.fun enabled **USDC as a quote mint (2026-05-21)** via the V2 instruction set (Token-2022 `create_v2`, `buy_v2`, and the V2 fee instructions). Nich's `@nirholas/pump-sdk@1.32.0` — the SDK PUMPTANK is adopting — builds the **SOL-only** convenience paths and its bundled IDL predates several V2 instructions. PUMPTANK wants to launch **USDC-paired** tribute coins, so rather than hack USDC into our launcher privately, we add proper USDC support **to the SDK** and contribute it **upstream as two PRs** so the whole pump.fun dev community benefits. PUMPTANK then consumes the merged SDK.

Companion analysis: `docs/pumpfun-launch-readiness-2026-06.md` (the PUMPTANK-side consumption + funding/dev-buy sizing). Authoritative source for all account layouts here: the official IDL at `github.com/pump-fun/pump-public-docs` (`idl/{pump,pump_amm,pump_fees}.json`), verified programmatically.

## Decisions (agreed)

1. **Approach A — additive optional params.** Add optional `quoteMint?: PublicKey` (default `NATIVE_MINT` = `So111…112`) and `quoteTokenProgram?: PublicKey` (default SPL `TOKEN_PROGRAM_ID`) to the builders. Non-native (USDC) appends the quote-side accounts; native takes today's branch. Mirrors the official `@pump-fun/pump-sdk` API shape.
2. **Two PRs.** **PR1** = launch path (`create_v2` + buy). **PR2** = fee path (collect + distribute).
3. **Additive only — never remove v1.** Where USDC needs a different on-chain instruction than the one a method calls today (the fee path), add a **parallel `…V2` method** and leave the existing v1 method **fully functional and untouched** (a light `@deprecated`/"see …V2 for sharing-config coins" JSDoc note only — no behavior change, no removal). Downstream users on v1 are unaffected. This mirrors how the SDK already keeps legacy `collect`.
4. **Sync the bundled IDL.** `buy_v2`, `collect_creator_fee_v2`, `update_fee_shares_v2`, `distribute_creator_fees_v2`, `transfer_creator_fees_to_pump_v2` are **absent** from Nich's `src/idl/*.json` (verified); copy them from the official IDL and regenerate the matching `.ts` types. `create_v2`, `collect_coin_creator_fee`, `create_fee_sharing_config` are already present.
5. **Explicit USDC buy cap.** `createV2AndBuyInstructions` accepts an explicit `quoteAmount` cap for the USDC buy leg (mirrors official `getBuyV2InstructionRaw`) instead of re-deriving from `solAmount`.
6. **Fork & verification bar.** Work happens in the user's fork **`https://github.com/HankWyatt/pump-fun-sdk`**; the two PRs open from it against upstream `nirholas/pump-fun-sdk`. Verification bar before PUMPTANK trusts this for a real-money launch: **(a)** offline Jest unit tests (account layouts + SOL byte-identity), **(b)** `simulateTransaction` of every new instruction path (no broadcast), **(c)** a **devnet** `create_v2` + `buy_v2` USDC integration test with a real broadcast. The pump program is deployed on devnet; if no USDC quote mint is whitelisted in the devnet `Global`, fall back to whichever quote mint *is* whitelisted there (or a locally-whitelisted mint) to exercise the non-native code path, and rely on mainnet `simulateTransaction` for the USDC-specific accounts.
7. **Include `transfer_creator_fees_to_pump_v2`** in PR2 for upstream API parity (graduated-only; moot for PUMPTANK but completes the V2 fee surface).

## Load-bearing invariants

- **Base mint is ALWAYS Token-2022** (`TokenzQdB…`) — drives `create_v2` `token_program`, `associated_bonding_curve`, `mayhem_token_vault`, and the user's base ATA. Never changes.
- **The quote side is plain SPL Token** (`Tokenkeg…`) for **both** wSOL and USDC — `quoteTokenProgram` defaults to `TOKEN_PROGRAM_ID`, **not** Token-2022. (COIN_CREATION.md:26 warns it "is not necessarily the legacy SPL Token Program" — so it's a param, but USDC's value is the legacy program.)
- **Quote-side ATAs** use `getAssociatedTokenAddressSync(quoteMint, owner, /*allowOwnerOffCurve*/ true, quoteTokenProgram)`. Vault owners are PDAs → `allowOwnerOffCurve=true` is mandatory.
- **`bondingCurve.ts` requires ZERO changes.** Every formula is pure `x*y/(x±dx)` BN math over virtual reserves with no hardcoded `1e9`/decimals (verified `getBuy*`/`getSell*`/`getTokenAmountForTargetSol`/`bondingCurveMarketCap`/`maxSafeSellAmount`). USDC curves read the same `virtualSolReserves` decoded field. Only the variable names cosmetically say "sol" — document the caveat; do not change logic.

## New module: `src/quoteMints.ts`

`USDC_MINT` today lives only in `channel-bot/src/types.ts:20`. Promote to core:

```
USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")  // 6 decimals, legacy SPL
QUOTE_MINTS = {
  wSOL: { mint: NATIVE_MINT, decimals: 9, tokenProgram: TOKEN_PROGRAM_ID, ticker: "SOL" },
  USDC: { mint: USDC_MINT,  decimals: 6, tokenProgram: TOKEN_PROGRAM_ID, ticker: "USDC" },
}
```

Re-export from `index.ts`. Reuse `spl-token`'s `NATIVE_MINT`/`TOKEN_PROGRAM_ID`/`TOKEN_2022_PROGRAM_ID` (already imported in `sdk.ts:7-12`).

---

## PR1 — Launch path (`create_v2` + buy)

### `create_v2` (pump, 16 IDL accounts; 3 optional appended for non-native)

Args unchanged (`name, symbol, uri, creator, is_mayhem_mode, is_cashback_enabled`). The IDL has exactly 16 accounts; the 3 quote accounts are appended as **remaining accounts** (all-three-or-none), in order:

| # | remaining account (non-native only) | writable | derivation |
|---|---|---|---|
| R0 | `quote_mint` | no | = `quoteMint` |
| R1 | `associated_quote_bonding_curve` | yes | `ATA(bondingCurvePda(mint), quoteMint, true, quoteTokenProgram)` |
| R2 | `quote_token_program` | no | = `quoteTokenProgram` |

**Builder delta** — `createV2Instruction` (sdk.ts:338-370): add `quoteMint`/`quoteTokenProgram` params; before `.instruction()`, `isNative ? .remainingAccounts([]) : .remainingAccounts([R0,R1,R2])`. The `.createV2(...)` args and `.accountsPartial({… tokenProgram: TOKEN_2022_PROGRAM_ID})` are untouched ⇒ native is byte-identical. No new imports.

### buy (legacy SOL, **KEEP**) vs `buy_v2` (USDC, **ADD**)

- **Legacy `buy`** (disc `0x66063d12`, 16 accts, args `amount, max_sol_cost, track_volume`) — SOL-only. Nich's `getBuyInstructionInternal` (sdk.ts:879-922) builds it including its post-Apr-28 patch (2 remaining accounts: `bondingCurveV2Pda` + `pickBreakingFeeRecipient`). **Leave untouched** for the native branch.
- **`buy_v2`** (disc `0xb817ee6167c5d33d`, **27 accounts, ONLY 2 args** `amount, max_sol_cost`; **no `track_volume`**) — ADD to bundled IDL + regen `.ts`. `max_sol_cost` is semantically the **max QUOTE cost in quote base units** (USDC = 6dp); official TS names it `quoteAmount`. Account order (0-based) per official IDL:

```
0 global  1 base_mint  2 quote_mint  3 base_token_program(Token-2022)  4 quote_token_program(SPL)
5 associated_token_program  6 fee_recipient(w)  7 associated_quote_fee_recipient(w)
8 buyback_fee_recipient(w)  9 associated_quote_buyback_fee_recipient(w)
10 bonding_curve(w)  11 associated_base_bonding_curve(w)  12 associated_quote_bonding_curve(w)
13 user(w,signer)  14 associated_base_user(w)  15 associated_quote_user(w)
16 creator_vault(w)  17 associated_creator_vault(w)  18 sharing_config
19 global_volume_accumulator  20 user_volume_accumulator(w)  21 associated_user_volume_accumulator(w)
22 fee_config  23 fee_program  24 system_program  25 event_authority  26 program
```

- **New `buyV2` builder** (near sdk.ts:846): `.buyV2(amount, quoteAmount).accountsPartial({ baseMint, quoteMint, baseTokenProgram: TOKEN_2022, quoteTokenProgram, feeRecipient, buybackFeeRecipient, user, creatorVault: creatorVaultPda(creator) })` — Anchor resolves the ATAs/PDAs from IDL seeds.
- **New `fees.ts` helper `pickBuybackFeeRecipient()`** — `buy_v2` needs a separate `buyback_fee_recipient` (#8) that legacy `buy` lacks; only `pickBreakingFeeRecipient` exists today (fees.ts:173).
- **Routing** — `buyInstructions`/`getBuyInstructionRaw`/`buyInstruction`/`getBuyInstructionInternal` (sdk.ts:372/846/563/879): add `quoteMint`/`quoteTokenProgram`; native → legacy `buy`, non-native → `buyV2`.
- **`createV2AndBuyInstructions`** (sdk.ts:443-509): forward `quoteMint`/`quoteTokenProgram` to both legs; base side stays Token-2022; buy leg → `buyV2` for non-native; accept explicit `quoteAmount` cap.

---

## PR2 — Fee path (collect + distribute)

### `collect_creator_fee_v2` (pump, disc `[207,17,138,242,4,34,19,56]`, 10 accts, 0 args) — ADD

Replaces (does not remove) legacy `collect_creator_fee` (5 accts) which Nich calls at sdk.ts:778 and which **fails on `sharing_config` coins**. Accounts: `0 creator(w)` `1 creator_token_account(w)=ATA(creator,quote)` `2 creator_vault(w)` `3 creator_vault_token_account(w)=ATA(creatorVaultPda(creator),quote,true)` `4 quote_mint` `5 quote_token_program` `6 associated_token_program` `7 system_program` `8 event_authority` `9 program`. Permissionless (no signer). No `init_if_needed` ⇒ for USDC the builder optionally prepends `createAssociatedTokenAccountIdempotent` for `creator_token_account`.

- **New `collectCreatorFeeV2Instruction`** (keep legacy `collectCreatorFeeInstruction` sdk.ts:772 with a JSDoc pointer).
- **Balance-read helper** branches on quote: SOL = vault PDA lamports (minus rent); USDC = `getTokenAccountBalance` of the vault ATA (treat missing ⇒ 0).

### `collect_coin_creator_fee` (pump_amm, disc `[160,57,89,42,181,139,43,66]`, 8 accts) — FIX existing

Already in bundled IDL; `ammCollectCoinCreatorFeeInstruction` (sdk.ts:2222) sets only `coinCreator` ⇒ Anchor can't resolve `quote_mint`(#0)/`quote_token_program`(#1) ⇒ fails even for SOL. Add `quoteMint`/`quoteTokenProgram` + `coinCreatorVaultAuthority`, `coinCreatorVaultAta`, `coinCreatorTokenAccount`. `coinCreator` must be the resolved `pool.coin_creator` (`decodePool`), not the bonding-curve creator.

### `distribute_creator_fees_v2` (pump, disc `[255,203,19,79,244,68,8,159]`, 12 accts, arg `initialize_ata: bool`) — ADD

Nich's `distributeCreatorFees` (sdk.ts:1162) calls v1 (7 accts) — **keep it**. New `distributeCreatorFeesV2({…, quoteMint, quoteTokenProgram, shouldInitializeAta = true})`. Fixed accounts add `8 creator_vault_quote_token_account(w)=ATA(creatorVaultPda(sharingConfig),quote,true)` `9 quote_mint` `10 quote_token_program` `11 associated_token_program`. Remaining accounts, **order == `sharingConfig.shareholders` exactly**: wSOL = `[shareholders(w)]`; USDC = `[shareholders(w), ata_i(w)]` where `ata_i = ATA(shareholder_i, quoteMint, true, quoteTokenProgram)`. Wrong order/count ⇒ `ShareholdersAndRemainingAccountsMismatch`.

### `update_fee_shares_v2` (pump_fees, disc `[111,251,49,6,78,78,106,18]`, 19 accts, arg `shareholders: Vec<Shareholder>`) — ADD

Nich's `updateFeeShares` (sdk.ts:1083) calls v1 (18 accts) — **keep it**. New `updateFeeSharesV2`. v2 inserts `pump_creator_vault_ata`(#8) before `system_program`; supply that = `ATA(creatorVaultPda(sharingConfigPda), quote, true)`, plus `quote_mint`(#14), `token_program`(#15), `coin_creator_vault_ata`(#18) = `coinCreatorVaultAtaPda(coinCreatorVaultAuthorityPda(sharingConfigPda), quote, quoteTokenProgram)`. Remaining accounts keyed to the **CURRENT** shareholders (not the new list); USDC appends their ATAs; the inner distribute CPI uses `initialize_ata = true`.

### `transfer_creator_fees_to_pump_v2` (pump_amm, disc `[1,33,78,185,33,67,44,92]`, 12 accts) — ADD (parity)

v2 prepends `payer`(#0, signer) + adds `pump_creator_vault_ata`(#9) vs v1. Graduated-only ⇒ **moot for PUMPTANK** (tribute coins aren't expected to graduate), but include for upstream API parity.

### `create_fee_sharing_config` — NO CHANGE

Quote-agnostic (no quote accounts/args; 13 accts incl. 3 optional pool accounts). Initial shareholders `[(creator, 10000 bps)]`. Cosmetic: param `creator` maps to IDL `payer`.

### PUMPTANK 80/20 flow

`createFeeSharingConfig(pool=null)` → `updateFeeSharesV2(newShareholders=[{founder,8000},{house,2000}])` (one-time, admin revoked after) → (skip transfer; not graduated) → `distributeCreatorFeesV2(shouldInitializeAta=true)`. SOL launch uses defaults; USDC sets `quoteMint=USDC_MINT, quoteTokenProgram=TOKEN_PROGRAM_ID`.

---

## Backward compatibility

All new params are optional and default to wSOL + SPL Token, so existing native call sites take their current branch:
- `create_v2` native → `.remainingAccounts([])` (no-op) ⇒ identical discriminator + 16-account key array + data buffer.
- buy native → unchanged legacy `.buy(...)`; USDC routes to a **separate** `buy_v2` and never mutates the legacy path.
- Fee path → v1 methods kept **fully functional**; v2 are **new methods**. No in-place instruction swap, so no silent behavior change for SOL callers.

## Test matrix (offline Jest + `fixtures.ts`, no RPC)

- **SOL byte-identity** snapshots for `create_v2` and `buy` (omit `quoteMint`) — assert key array + data buffer match a captured baseline (no-regression guarantee).
- `create_v2` USDC → `keys.length === 19`; 3 trailing remaining accounts in exact order + writability; `associated_quote_bonding_curve === ATA(bondingCurvePda(mint), USDC_MINT, true, TOKEN_PROGRAM_ID)`.
- `create_v2` explicit `NATIVE_MINT` → appends 0 remaining accounts (same as omitting).
- `buy_v2` USDC → disc `0xb817…`, `keys.length === 27`, data encodes **only 2 args** (no `track_volume` byte), `quote_mint`(#2)/`quote_token_program`(#4=SPL)/`base_token_program`(#3=Token-2022) correct.
- `collect_creator_fee_v2` USDC → 10 accts, quote ATAs correct, no signer.
- `collect_coin_creator_fee` USDC → quote accounts set; SOL regression via defaults.
- `distributeCreatorFeesV2` USDC → disc, 12 fixed accts, remaining `== 2N` `[shareholders…, ata_i…]` order == `sharingConfig.shareholders`, `initialize_ata` byte == 1; SOL remaining `== N`.
- `updateFeeSharesV2` USDC → disc, 19 accts, vault ATAs correct, remaining keyed to current shareholders.
- Constants: `QUOTE_MINTS.USDC` (mint/decimals=6/tokenProgram=SPL).
- Reuse existing patterns: `PUMP_SDK` singleton, `fixtures.ts` makers, structural key-count + `isWritable`/`isSigner` asserts, `getAssociatedTokenAddressSync` equality (sdk.test.ts:217-396). Maintain `bondingCurve.ts` 90/90/80 coverage (CONTRIBUTING.md). Branch prefix `feat/`, conventional commits, squash-merge.

## Risks & gotchas

- **`buy_v2` 2-arg trap** — legacy `buy` has 3 args incl. `track_volume`; `buy_v2` has only 2. Passing `{0:true}` to `buyV2` mis-encodes the data buffer. Volume tracking is implicit via the accumulator accounts.
- **`max_sol_cost` is quote units** — for USDC it's 6dp; misreading as SOL lamports underprices the cap ~1000×. Keep `solAmount` naming only on legacy-compat wrappers; use `quoteAmount` on `buyV2`.
- **Token-program conflation** — base = Token-2022, quote = SPL even for USDC. Deriving any quote ATA with the wrong program corrupts the address.
- **`pickBuybackFeeRecipient` required** — `buy_v2` can't be built without it.
- **Collect ATA pre-existence** — `collect_*` have no `init_if_needed`; USDC destination ATAs must exist or be idempotently pre-created by the builder.
- **Remaining-accounts order** — `distribute` keys to `sharingConfig.shareholders`; `update_fee_shares_v2`'s inner CPI keys to **current** shareholders.
- **Collect vs distribute mutual exclusivity** — `collect_creator_fee_v2`/`collect_coin_creator_fee` are the single-recipient flow and fail once a coin has a `sharing_config`; `distribute_creator_fees_v2` is the sharing flow. Document; don't combine on one coin.
- **IDL `.ts` regen sync** — adding instructions to the JSON requires regenerating the matching `.ts` type; a stale mismatch mis-types the Anchor program.

## Resolved & remaining

**Resolved (2026-06-03):** Fork = `https://github.com/HankWyatt/pump-fun-sdk` (decision 6). Verification = unit + `simulateTransaction` + devnet integration (decision 6). `transfer_creator_fees_to_pump_v2` included for parity (decision 7).

**Remaining (handle in the plan):**
1. **Devnet USDC availability** — confirm whether a USDC quote mint is whitelisted in the devnet `Global.whitelisted_quote_mints`; if not, pick a whitelisted devnet quote mint (or whitelist a test mint) to exercise the non-native path, and lean on mainnet `simulateTransaction` for USDC-account correctness.
2. **Per-PR IDL chore commit** — keep IDL JSON + `.ts` regen as a separate commit within each PR (squash-merge is used upstream).
3. **`@nirholas/pump-sdk` published-package vs source parity** — verify the npm package PUMPTANK will consume matches the merged fork (or consume via git dependency on the fork until upstream merges).
