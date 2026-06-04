# PUMPTANK SOL Launcher Rebuild — Design Spec

_Date: 2026-06-04. Sub-project A of the post-pump.fun-V2 migration. Status: design, approved to plan._

## Why

The `launcher/` is built on the dead `pumpdotfun-repumped-sdk@1.4.2`, which emits the **legacy `create`** (SPL-Token, non-Token-2022) instruction — broken on current mainnet (pump.fun now requires `create_v2`/Token-2022, and the April-28 fee-recipient upgrade changed `buy`). So the launcher cannot launch today, independent of pairing. This rebuilds the **launch engine** on the current, maintained **official `@pump-fun/pump-sdk@^1.36.0`**, launching **SOL-paired** coins via `create_v2` + an atomic dev-buy.

Decisions (locked with the user):
- **SOL-paired** (not USDC). Mainnet 1.5% dev-buy ≈ 0.4296 SOL/token (~43 SOL for 100) ≈ the same USD as USDC but **no Address Lookup Table needed** (SOL create+buy fits one legacy tx). USDC support was contributed upstream as [nirholas/pump-fun-sdk#8](https://github.com/nirholas/pump-fun-sdk/pull/8) and is not used here.
- **SDK = official `@pump-fun/pump-sdk@^1.36.0`** (clean versioned npm dep; current/post-April-28; `createV2AndBuyInstructions` API confirmed).
- **Surgical migration**, not a rewrite: the old launcher was already SOL-based, so the crash-safe ledger / orchestration / recovery are preserved; only the SDK + create-call + metadata + config change.
- Dev-buy **pinned to token base units** (1.5% = `15_000_000_000_000`), with a SOL cap.

Companion: `docs/pumpfun-launch-readiness-2026-06.md` (full pin analysis). Guardrails (one wallet, one atomic tx, 1.5%, 80/20, dry-run default + `--confirm`, transparent, no bundling) are unchanged and preserved.

## Confirmed SDK API (`@pump-fun/pump-sdk@1.36.0`)

```ts
new PumpSdk()              // offline instruction builders
new OnlinePumpSdk(conn)    // RPC-connected; .fetchGlobal(): Promise<Global>
PumpSdk.createV2AndBuyInstructions({
  global, mint, name, symbol, uri, creator, user,
  amount: BN,      // token base units to buy (1.5% = 15_000_000_000_000)
  solAmount: BN,   // max SOL cost (cap)
  mayhemMode: boolean,   // false
  // cashback?, isTokenizedAgent?, buyBackBps? — omit (defaults)
}): Promise<TransactionInstruction[]>   // omitting quoteMint ⇒ SOL/native
```
Helpers exported: `bondingCurvePda`, `creatorVaultPda`, `getBuySolAmountFromTokenAmount`, `getPumpProgram`, `NATIVE_MINT` (via spl-token). Base mint is **Token-2022, decimals = 6** (so total supply `1e15` base units; 1.5% = `1.5e13`).

## Architecture

`launcher/` keeps its shape; we swap the broken layer and add metadata upload. Each unit's responsibility:

| File | Change |
|---|---|
| `package.json` | Remove `pumpdotfun-repumped-sdk`. Add `@pump-fun/pump-sdk@^1.36.0`, `@solana/spl-token@^0.4`, `bn.js`. Bump `@coral-xyz/anchor`→`^0.31`, `@solana/web3.js`→`^1.98`. `npm install`, rebuild. |
| `src/metadata.ts` (NEW) | `uploadTokenMetadata(item): Promise<string>` — POST the token's PNG (`data/token_images/<id>.png`) + `name`/`symbol`/`description` as multipart to `https://pump.fun/api/ipfs`; return the metadata `uri` (assert ≤200 chars). **OPEN:** confirm the endpoint still accepts unauthenticated server-side uploads; else self-pin to an IPFS gateway. |
| `src/launch.ts` | Replace `sdk.trade.createAndBuy(...)`. New `launchOne`: `uri = await uploadTokenMetadata(item)`; build `createV2AndBuyInstructions({ global, mint, name, symbol, uri, creator: wallet, user: wallet, amount: DEV_BUY_TOKENS, solAmount: cap, mayhemMode: false })`; assemble into ONE `VersionedTransaction` (prepend ComputeBudget set-unit-limit/price), sign `[wallet, mint]`, `sendRawTransaction`, confirm; return `{ mint, signature }`. One tx / one signer → guardrail preserved. No ALT (SOL fits ~1084 bytes). |
| `src/config.ts` | `DEV_BUY_TOKENS = 15_000_000_000_000n` (1.5% of supply). SOL cap `= getBuySolAmountFromTokenAmount(global reserves, DEV_BUY_TOKENS) × (1 + SLIPPAGE_BPS/1e4)` computed at launch (≈0.4296 SOL +slippage). Keep `SLIPPAGE_BPS_CAP=300`, default 150. `MAX_TOTAL_SPEND_SOL` stays. |
| `src/cli.ts` | Swap SDK init: `PumpFunSDK` → `new OnlinePumpSdk(connection)` (for `fetchGlobal`) + `new PumpSdk()` (offline builders). Preflight stays SOL: `required = items × ~0.43 × (1+slippage) + perLaunchRent`; add Token-2022 mint+ATA+bonding-curve rent (~0.014 SOL/launch) to the buffer. |
| `src/orchestrate.ts` | Unchanged control flow (pacing, spend cap, retries). Pass `global` + the computed cap through. Spend cap stays SOL. |
| `src/{ledger,mintstore,recover,wallet,products,types}.ts` | Unchanged. **Verify** `recover.ts`'s "a create leaves a mint account on-chain" recovery still detects a **Token-2022** mint (the mint is now owned by the Token-2022 program, not legacy SPL Token) — adjust the owner check if needed. |
| Tests (`launcher/test/*`, vitest) | Mock the SDK builders. Assert `createV2AndBuyInstructions` called with `amount === DEV_BUY_TOKENS`, native (no quoteMint), and the SOL cap; assert the assembled tx is one tx signed by `[wallet, mint]`. Keep ledger crash-safety + dry-run preview tests. Update the old `sdk.trade.createAndBuy` mock to the new shape. |

## Data flow (per token, dry-run default)

`products.json` record → `uploadTokenMetadata` → `uri` → `fetchGlobal` (once, cached) → compute SOL cap from curve reserves → `createV2AndBuyInstructions` → assemble+sign one tx → **dry-run: print mint + ~SOL, no broadcast** / `--confirm`: `simulateTransaction` then `sendRawTransaction` → write `mint`+`sig` to the crash-safe ledger.

## Error handling / crash-safety (preserved)

Write-ahead `attempting` ledger + persisted per-id mint keys + on-chain recovery ⇒ no double-launch/overspend. Default dry-run; `--confirm` to broadcast; spend cap; pinned slippage (as a SOL cap). pump.fun is mainnet-only (no devnet IPFS), so the safety net is mainnet `simulateTransaction` + one tiny test launch before the full 100.

## Testing & verification

- Unit (vitest, offline, mocked SDK): the assertions above + config (token-pinned dev-buy, slippage cap) + dry-run preview total (~43 SOL) + ledger crash-safety.
- Pre-launch: `npm run` dry-run on the real 100 prints "~43 SOL, DRY RUN"; then a mainnet `simulateTransaction` of one `create_v2`+buy (we already proved `create_v2` works on devnet via PR1).

## Out of scope (later sub-projects)

- **B — Fee routing** (collect/distribute, 80/20) — kept local, post-launch (task #7).
- **C — Website** — `products.json` mint backfill + live links, post-launch.

## Open questions (resolve during the plan/impl)

1. **`pump.fun/api/ipfs`** — does it still accept unauthenticated server-side multipart uploads? Verify before the run; else self-host/pin metadata.
2. **`recover.ts` Token-2022 owner check** — confirm the orphan-mint recovery matches a Token-2022-owned mint.
3. **`OnlinePumpSdk` vs `PumpSdk` for create+buy** — `OnlinePumpSdk` may expose a `createV2AndBuyInstructions` wrapper that fetches `global` itself; prefer it if so, else `PumpSdk` + an explicit `fetchGlobal`. Confirm against the installed `@pump-fun/pump-sdk@1.36.0` at implementation.
4. **SOL cap derivation** — confirm `getBuySolAmountFromTokenAmount` signature/inputs (global reserves) for the cap; fall back to a fixed generous cap (e.g. 0.46 SOL) if simpler.
