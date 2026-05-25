# Fee-routing runbook (manual pump.fun UI steps)

Setting a token's 80/20 creator-fee split is a **pump.fun web/mobile UI action** — there is
no API, and it can be done **exactly once per token, then locks permanently**. Do not rush it.

## On a founder's opt-in
1. Vet the founder; obtain + double-check their payout wallet (Solana address).
2. Record the opt-in:  `cd launcher && npm run fees -- mark-optin <product-id> <payout-wallet>`
   (rejects an invalid wallet; sets the token to opted-in, still at 100% house.)
3. In the **pump.fun UI** for that token, open creator-fee settings → set recipients to
   **80% = founder wallet**, **20% = house wallet** → confirm. **This is the one-time change.**
4. Record it:  `npm run fees -- mark-redirected <product-id>`
   (refuses if not opted-in or already redirected — so you can't waste/duplicate the change.)
5. `npm run fees -- status` to confirm.

## Collecting fees (any time, post-launch)
- Preview:  `RPC_URL=<rpc> WALLET=<deployer-secret-json> npm run fees -- collect`  (dry-run)
- Execute:  add `--confirm`. pump auto-distributes the pooled vault to each token's configured
  recipients by their %s (founders get 80% of theirs; un-opted tokens' fees go 100% to house).

## Notes
- Un-opted tokens stay 100% house — that's intended; collecting still works.
- Unclaimed fees never expire and follow the new split once changed.
- The `collect` request shape (PumpPortal `collectCreatorFee`) is pinned in `collect.ts`;
  confirm it against current PumpPortal docs before the first real collect.
