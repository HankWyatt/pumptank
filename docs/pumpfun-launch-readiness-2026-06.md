# PUMPTANK Launch-Readiness + USDC Migration Report

_Generated 2026-06-03. Grounded in the official pump docs/IDL (github.com/pump-fun/pump-public-docs) and Nich's `@nirholas/pump-sdk@1.32.0` source, cross-referenced against our `launcher/` + `web/` code._

## 1. Summary — answering the two questions

**(1) Did pump.fun ship updates we must fix? YES — and we are broken on mainnet today.**
Our installed `pumpdotfun-repumped-sdk@1.4.2` `createAndBuy` (`launcher/src/launch.ts:22`) builds the **legacy `create`** instruction (SPL-Token path) — its bundled IDL contains **no `create_v2`/`buy_v2` at all**. Official `create_v2` now mandates a **Token-2022 mint, decimals=6** (was 9), 16 mandatory accounts + 3 optional for a non-native quote mint, and new args `is_mayhem_mode`/`is_cashback_enabled`. So every launch produces a legacy non-Token-2022 coin via the wrong path. Separately, fee collection (`collect.ts`) uses the **legacy single-recipient PumpPortal collect**, which **fails on any coin that has a `sharing_config`** and reads only PDA lamports (wrong for USDC).

_Correction to an earlier framing: the installed `buy` is already the post-April-28 16-account layout with `fee_program`; the real blocking gap is the missing `create_v2` (Token-2022) path. Official `buy` = 16 accounts (not 18); the 27-account variant is `buy_v2`._

**(2) How are we looking for a USDC launch? NOT READY.** The SDK we planned to adopt, **Nich `@nirholas/pump-sdk@1.32.0`, is SOL-only across the board**: create, buy, collect, and distribute all hardcode `NATIVE_MINT` and expose no `quoteMint`. Its `Global`/`BondingCurve` TS types don't even carry the quote-side reserve fields, so it cannot size a USDC buy. The single most important number — the per-token USDC dev-buy — depends on `Global.initial_virtual_quote_reserves` (R), which **exists in no local doc, IDL, or SDK** and must be read from mainnet before any dollar figure is quotable. **USDC paths require the official `@pump-fun/pump-sdk`.**

---

## 2. What pump.fun changed (grounded)

| Change | Evidence |
|---|---|
| `create` → `create_v2`: Token-2022 mint, **decimals=6**, 16 mandatory accounts + Mayhem accounts, +3 optional for non-native quote mint; new args `is_mayhem_mode`(bool), `is_cashback_enabled`(OptionBool) | COIN_CREATION.md:3,8; pump.json `create_v2` |
| USDC pairing (mint `EPjFW…TDt1v`) enabled 2026-05-21, requires V2; SOL coins still work via legacy but must pass wSOL as quote mint in V2 | COIN_CREATION.md:73-90 |
| 2026-04-28: 8 new fee recipients; `buy` is now **16 accounts** incl `fee_config`+`fee_program` (NOT 18); `buy_v2`=27 for the quote-mint layout | pump.json `buy`/`buy_v2`; FEE_RECIPIENTS.md |
| Fee routing moved to the Pump Fees program: `create_fee_sharing_config` → `update_fee_shares_v2` (≤10 shareholders, Σshare_bps=10000, one-time then admin-revoked) → `distribute_creator_fees_v2` | CREATOR_FEE_SHARING.md:87,152 |
| Legacy `collect_creator_fee` FAILS once a coin has a `sharing_config`; single-recipient coins use `collect_creator_fee_v2`/`collect_coin_creator_fee`; v2 uses a unified layout for SOL + non-SOL | COLLECT_CREATOR_FEE.md:3,10,23,33 |
| `Global` now carries `initial_virtual_quote_reserves` + `whitelisted_quote_mints`; `set_virtual_quote_reserves` admin ix added; `BondingCurve` renames quote side to `virtual_quote_reserves`/`real_quote_reserves` | pump.json |
| **Program id `6EF8…F6P` UNCHANGED**; `creator-vault` seed UNCHANGED | official IDL + bundled fork IDL match |

---

## 3. Pin-by-pin status + fix

| Pin (file:line) | Status | Fix |
|---|---|---|
| Legacy SDK `pumpdotfun-repumped-sdk@1.4.2` (package.json:15, cli.ts:3) | **REBUILD** | Drop it; add `@nirholas/pump-sdk@^1.32.0` (+ official `@pump-fun/pump-sdk` for USDC). Bundled IDL has no `create_v2`/`buy_v2`. |
| create/createAndBuy (launch.ts:16-31, :22) | **BROKEN** | Replace with `create_v2` + atomic dev-buy. SOL: Nich `createV2AndBuyInstructions` (sdk.ts:443, 4 ixs, auto-adds breaking fee-recipient + Mayhem accounts). USDC: official `createV2Instruction({quoteMint:USDC})` + `getBuyV2InstructionRaw`. Assemble one VersionedTransaction, +ComputeBudget, sign `[wallet,mint]`, send once. |
| Dev-buy amount (config.ts:4 `DEFAULT_DEV_BUY_SOL=0.4306`; launch.ts:5,25) | **NEEDS-CHANGE** | Re-pin to **token base units: 1.5% of 1e15 = 15,000,000,000,000 (1.5e13)**, quote-independent. Drive `amount`=1.5e13 + a quote-side cap, not a SOL spend. `0.4306` is ~0.23% above the formula's 0.4296 — re-derive. |
| Slippage units (config.ts:3,14,23; launch.ts:26) | **NEEDS-CHANGE** | Nich offline buy hardcodes `slippage:1`; OnlineSdk has no knob. Compute cap ourselves = `expectedCost*(1+slippageBps/1e4)` in the quote mint's base units (USDC 6dp / SOL lamports); keep cap=300 as a validation bound. Add ComputeBudget ixs ourselves. |
| Fee collection (collect.ts:11-13, :25-43) | **BROKEN** | Legacy collect FAILS on sharing_config coins; `getBalance` reads PDA lamports (wrong for USDC). Move to `collect_creator_fee_v2`/`collect_coin_creator_fee`; for USDC read `getTokenAccountBalance` on vault ATA. Nich `collectCoinCreatorFeeInstructions` is SOL-only. |
| Fee sharing (feeconfig.ts:5-11; feescli.ts) | **REBUILD** | FeeEntry has no mint/quoteMint/pool/sigs. On opt-in build `createFeeSharingConfig` + `updateFeeShares` ([(founder,8000),(house,2000)], one-time, admin-revoked); add `distribute` command. USDC distribute needs official `distributeCreatorFeesV2({shouldInitializeAta:true})`. Authoritative mint = `Ledger.mint` (types.ts:13). |
| PumpPortal (collect.ts:29; feescli.ts:67) | **REBUILD** | Drop PumpPortal + `PUMPPORTAL_URL`; build all fee txs via SDK + our RPC, signed by house wallet, dry-run default + `--confirm`. |
| Deps/anchor (package.json:11-16) | **NEEDS-CHANGE** | Remove fork; add `@nirholas/pump-sdk@^1.32.0`, `@solana/spl-token@^0.4.13`, `bn.js@^5.2.2`, `@types/bn.js`; bump `@coral-xyz/anchor` → `^0.31.1`, align web3.js `^1.98.2`. Likely add `@pump-fun/pump-sdk` for USDC. |
| Website mint links (MintLink.tsx:4) | **OK** | `pump.fun/<mint>` is mint-only, unchanged. Verify live route for a USDC coin post-launch. |
| products.json schema (products.schema.json:318-352; web/lib/products.ts:7) | **NEEDS-CHANGE** | Add optional `quote_mint` + `decimals` (default 6). Add a backfill script (all 100 are `mint:null`; ledger never writes back). |
| Funding model (cli.ts:41; orchestrate.ts:36-37; wallet.ts:11-12) | **NEEDS-CHANGE** | SOL-only + quote-blind. Assert quote-currency budget (USDC ATA if USDC) + separate SOL fee/rent buffer; add `MAX_TOTAL_SPEND_USDC`. |
| Program id `6EF8…F6P` | **OK** | Unchanged in official + fork IDL; creator-vault seed unchanged. No change. |
| Guardrails (orchestrate.ts:25-46) | **OK** | One signer / one atomic tx / 1.5% / 80-20 / disclaimers all survive V2/USDC. Preserve pinned-slippage by computing the cap in the quote mint's base units. ToS on parody/trademark is NOT local — needs out-of-band check. |

---

## 4. Work plan grouped by file

### `launcher/package.json`
Remove `pumpdotfun-repumped-sdk`. Add `@nirholas/pump-sdk@^1.32.0`, `@solana/spl-token@^0.4.13`, `bn.js@^5.2.2`, devDep `@types/bn.js`. Bump `@coral-xyz/anchor` → `^0.31.1`, `@solana/web3.js` → `^1.98.2`. **If USDC in scope, also add `@pump-fun/pump-sdk` (official, 1.33.0).** `npm install`, rebuild. Verify exports resolve from the installed package, not the checkout.

### `launcher/src/cli.ts`
- Line 3 import: `PumpFunSDK` → `PumpSdk`/`OnlinePumpSdk`. Line 45: replace `new PumpFunSDK(provider)` with `OnlinePumpSdk(connection)`.
- Lines 41-44 preflight: rewrite to assert **two** budgets — quote-currency (USDC ATA balance if USDC; SOL if SOL) **and** a separate SOL fee/rent buffer.

### `launcher/src/launch.ts`
- New flow: `uri = await uploadTokenMetadata(item)` → build create_v2 + atomic dev-buy. SOL: `createV2AndBuyInstructions({mint,name,symbol,uri,creator,user,amount:BN('15000000000000'),solAmount:capBN,mayhemMode:false,cashback:false})`. USDC: official `createV2Instruction({…,quoteMint:USDC})` + `getBuyV2InstructionRaw({…,quoteMint:USDC,quoteTokenProgram:TOKEN_PROGRAM_ID})`, hand-assembled.
- Assemble returned ixs into one `VersionedTransaction`, prepend ComputeBudget, sign `[wallet, mint]`, send, confirm. Single tx, single signer — guardrail preserved. Don't call `patchBcInstruction` (Nich already appends the breaking recipient; optionally assert with `validateBcInstruction`).
- Replace `devBuyLamports` with token-amount-pinned sizing + a quote-side cap = cost*(1+slippageBps/1e4).

### `launcher/src/metadata.ts` (NEW)
`uploadTokenMetadata(item)`: POST multipart FormData (image, name/symbol/description) to `https://pump.fun/api/ipfs`, return `uri`; assert `uri.length<=200`. **Confirm endpoint still accepts unauthenticated uploads before the run; else self-pin to our own IPFS gateway.**

### `launcher/src/config.ts`
Re-derive/replace `DEFAULT_DEV_BUY_SOL` (use `DEV_BUY_TOKENS=15000000000000`). Add `MAX_TOTAL_SPEND_USDC` alongside `MAX_TOTAL_SPEND_SOL`. Keep `SLIPPAGE_BPS_CAP=300` as a validation bound applied in our math.

### `launcher/src/orchestrate.ts`
Spend cap (lines 36-37) is quote-blind — gate USDC spend against `MAX_TOTAL_SPEND_USDC`, leave SOL cap for gas/rent. Keep ledger writeback; feed `id→mint(+quote_mint)` to the products.json backfill.

### `launcher/src/collect.ts`
Drop PumpPortal. `getVaultClaimable` branches on quote mint: SOL = `getBalance(creatorVaultPda)`; USDC = `getTokenAccountBalance` on the vault ATA (6dp). Build `collect_creator_fee_v2` (+ `collect_coin_creator_fee` if graduated); gate with an on-chain migration check; route migrated coins to distribute.

### `launcher/src/feeconfig.ts`
Extend `FeeEntry` with `mint`, `quoteMint`, `pool`, `graduated`, and proof sigs. Read mint from `Ledger.get(id).mint`. Gate `markRedirected` on confirmed broadcast (mirror on-chain `adminRevoked`).

### `launcher/src/feescli.ts`
`previewCollect`/threshold become quote-aware. `collect` branches: house_100 → collect_v2; split_80_20 → distribute. Add `distribute <product-id>` (USDC via official `distributeCreatorFeesV2`). Remove `PUMPPORTAL_URL`. Keep dry-run + `--confirm`.

### `web/` (low urgency)
`data/products.schema.json` + `web/lib/products.ts`: add optional `quote_mint`, `decimals`. New backfill script: ledger success rows → `data/products.json`, then rebuild Next static export. Optional "Paired: SOL/USDC" badge. No disclaimer/copy change.

---

## 5. USDC dev-buy budget (the money number)

- **Token side (canonical, quote-independent):** 1.5% of `token_total_supply` 1e15 = **15,000,000,000,000 (1.5e13) base units**.
- **Per-token USDC = `(R/1e6) × 0.0143195`**, where R = `Global.initial_virtual_quote_reserves` (USDC 6dp). **100 tokens = `R × 1.4319` USDC.** Scales LINEARLY in R.
- **Derivation:** dTok/(vTok-dTok) = 1.5e13/(1.073e15-1.5e13) = 0.0141777; ×1.01 fee = 0.0143195. SOL sanity: floor(1.5e13·30e9/(1.073e15-1.5e13))+1 + ceil(1%) = **429,584,122 lamports = 0.42958 SOL**, matching legacy 0.4306 within ~0.23%.
- **Illustrative (do NOT hardcode):** R=1000e6 → 14.32/token, 1431.95/100; R=6000e6 → 85.92/token, ~8591.7/100; R=12000e6 → 171.83/token, ~17183.4/100.
- **Confidence:** HIGH on formula + linear scaling; **MEDIUM** on any dollar total (R unknown — absent from every local source).
- **Required on-chain verification before quoting dollars:** (1) helius `getAccountInfo` on the `["global"]` PDA `4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf`, decode `initial_virtual_quote_reserves` with the **official** IDL; (2) confirm USDC curves keep `initial_virtual_token_reserves=1.073e15` via a live USDC coin's BondingCurve; (3) read `Global.creator_fee_basis_points` — the 1.01 assumes it is 0; if not, use `(1+(100+creator_fee_bps)/1e4)` (reconcile with cli.ts:20's ~1.25% assumption).

---

## 6. Funding plan (per 100-token batch)

- **Quote currency:** if USDC — `100 × per-token-USDC + 1% fee + slippage` in the house wallet's USDC ATA (pre-create the ATA); if SOL — `100 × ~0.4296 SOL × (1+0.01+slippage)`.
- **SOL for fees/rent (always):** per-launch ~**0.014 SOL** (rent ~0.0138: Token-2022 mint+metadata, bonding_curve PDA, T22 ATAs, mayhem_state PDA, +USDC quote ATA; +tx/priority ~0.00007). 100 launches ≈ **1.43 SOL** + ~0.04 one-time ATAs. **Budget ~1.8-2.0 SOL with buffer** (the original ~1.2 SOL was ~50% low). Measure one live `create_v2+buy` before multiplying by 100.

---

## 7. Guardrail check (all preserved)

- **1.5% dev-buy, one wallet, one atomic tx:** create_v2(+buy) is one ix pair, one `user` signer; `createV2AndBuyInstructions` is atomic. No bundling/Jito/sniping.
- **100% house → opt-in 80/20:** maps to `update_fee_shares_v2` [(founder,8000),(house,2000)] (Σ=10000, ≤10), one-time then admin-revoked; shareholders are recipient pubkeys, not signers.
- **Crash-safe ledger, dry-run default + `--confirm`, spend cap, pinned slippage:** preserved; slippage cap now computed in the quote mint's base units.
- **Disclaimers / parody / not-financial-advice:** present site-wide, curve-agnostic, unchanged.
- **Caveat:** pump.fun's ToS stance on parody/tribute + trademark is NOT in local docs — out-of-band live policy review required before launch.

---

## 8. Open questions (decision-blocking first)

1. **USDC vs SOL for the 100 tokens** — gates the entire SDK choice (Nich insufficient for USDC; needs official `@pump-fun/pump-sdk`).
2. **R = `Global.initial_virtual_quote_reserves`** — read on-chain; no local value. Confirm token reserves shared with SOL curve.
3. **`Global.creator_fee_basis_points`** — 0 vs cli.ts's ~1.25% assumption; reconcile before sizing.
4. **`pump.fun/api/ipfs`** — still accepts unauthenticated server-side uploads in 2026? Verify or self-pin.
5. **Token-pinned vs quote-pinned dev-buy** — token-pinned safer for the 1.5% guardrail.
6. **Per-token quote-mint + pool/graduated tracking** in fee-config; house wallet must sign sharing-config txs.
7. **Launch-ledger path/format** — needed for the products.json backfill.
8. **pump.fun ToS** on parody/trademark; live `/<mint>` route for USDC coins — both need out-of-band checks.
9. **Published `@nirholas/pump-sdk@1.32.0`** matches the audited checkout? Verify the installed package.
