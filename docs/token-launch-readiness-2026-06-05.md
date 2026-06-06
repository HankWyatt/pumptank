# Token Launch Readiness — 2026-06-05

_Supersedes the stale `pumpfun-launch-readiness-2026-06.md` (2026-06-03), which described a pre-migration **broken** state. That fix plan has since been fully executed (see git log: `cf72799` adopt official SDK → `ebffc4b`/`f334da1` create-only → Fees V2 → ALT → backfill → devnet sim). This report is grounded in the **current** code + live checks._

## Verdict

**Code: ready & tested. Launching right now: NO — 3 hard operational blockers, the worst being the metadata host is offline.**

The on-chain launcher is code-complete, migrated to the official `@pump-fun/pump-sdk@1.36.0` `create_v2` (Token-2022, **SOL-native**), dry-run-by-default, crash-resumable, and fully green (**100 launcher + 35 fee unit tests pass**, `tsc` clean). Nothing has ever been broadcast (0/1481 mints, no ledger, no mint-keys).

## 🔴 P0 blockers (must clear before any `--confirm`)

1. **Metadata CDN is DEAD.** `meta.thepumptank.fun` does not resolve (`curl: (6) Could not resolve host`). Every `create_v2` bakes that URL in as the on-chain `uri` (e.g. `…/m/s10e10p840-adventurehunt.json`). Launch today = **1,481 coins permanently pointing at a 404**. Fix: create the DO Space, run `scripts/spaces-deploy-metadata.py --confirm` (needs `SPACES_KEY/SECRET`, `SPACES_REGION=nyc3`, `SPACES_BUCKET`), then point `meta.thepumptank.fun` DNS at the Space CDN. The 1,482 JSON files are already staged locally (`data/metadata/m/`).
2. **No wallet / RPC, unfunded.** `WALLET` (house secret-key JSON) and `RPC_URL` are env-only and absent. Need a secured house keypair, a real RPC (e.g. Helius), and **~40–50 SOL** funding: index dev-buy ~3.5 SOL cap + ~29.6 SOL rent for 1,481 create-only (~0.02 SOL each) + priority fees + buffer. **Measure one live `create_v2` cost before multiplying.**
3. **Legal sign-off.** Trademark/likeness + pump.fun ToS on parody tribute coins — self-flagged in `README.md:18`. Not a code item; a human go/no-go.

## 🟡 P1 / P2

- **Never broadcast.** No `create_v2` has hit devnet or mainnet. Do **one** devnet (or 1-coin mainnet) `--confirm` smoke of both a create-only and the dev-buy/ALT path before the full batch.
- **Manual sequencing.** Two entrypoints, no combined orchestrator: launch the **index first** (`npm run launch:index -- --confirm`), confirm its mint, then the **catalog** (`npm run launch -- --confirm`).
- **Stale `data/launch-alt.json`** references an ALT (`EHA8q9…`) — likely a devnet/test artifact. `loadOrCreateLookupTable` revalidates on-chain so it self-heals, but verify/remove before a mainnet run.
- **`MAIN_TOKEN_WALLET`** (the $PUMPTANK fee-share payout pubkey) must be chosen before any founder `set-shares` (not needed for the mint itself).
- **Post-launch:** `npm run backfill -- --confirm` writes `token.mint` into `products.json` (currently 0/1481), then redeploy the site so mint links resolve.
- **Fee code caveat:** the house `collect` path only builds bonding-curve `collect_creator_fee_v2`, not the AMM `collect_coin_creator_fee` — irrelevant unless the pooled house vault is tied to a graduated coin.

## ✅ What's done (verified)

- **Products:** all 1,481 `include=true`, **0 dev_buy** (create-only). Fail-fast preflight (token/symbol/image present), deterministic per-id mint keys, write-ahead ledger → resumable.
- **Index $PUMPTANK:** 10% dev-buy, ALT-backed v0 tx so `create_v2+buy` fits, cap/balance preflights.
- **Fees V2:** `collect`/`set-shares`/`distribute`, 80/10/10 (+referrer) & 80/20 opt-in, one-time-locked, PumpPortal fully removed. Runbook matches code.
- **Guardrails:** dry-run default + `--confirm` on every money-mover; spend-cap; slippage cap ≤300 bps; metadata `uri` https + ≤200-byte guarded.
- **Web:** already deployed and live (`thepumptank.fun` → 200); auto-deploys on push.

## Operator path (condensed)

```bash
# P0-1  deploy metadata + DNS
python3 scripts/build-token-metadata.py
SPACES_KEY=… SPACES_SECRET=… SPACES_REGION=nyc3 SPACES_BUCKET=pumptank-meta \
  python3 scripts/spaces-deploy-metadata.py --confirm --verify
# CNAME meta.thepumptank.fun -> Space CDN, then:
curl -I https://meta.thepumptank.fun/m/index-pumptank.json   # must be 200

# P0-2  secrets + funding
export WALLET='[…secret-key array…]' RPC_URL='https://mainnet.helius-rpc.com/?api-key=…'
export MAX_TOTAL_SPEND_SOL=50 SLIPPAGE_BPS=150 PRIORITY_FEE=200000 INDEX_DEV_BUY_SOL=3.5

# dry-run both (no --confirm), then devnet smoke, then:
cd launcher && npm run launch:index -- --confirm   # index first
cd launcher && npm run launch -- --confirm          # 1,481 catalog (resumable)
cd launcher && npm run backfill -- --confirm        # wire mints into the site, redeploy
```
