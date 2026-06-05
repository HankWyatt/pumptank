# Fee-routing runbook (on-chain, Pump Fees V2)

PUMPTANK's creator-fee routing runs **entirely on-chain** via `@pump-fun/pump-sdk` — no
manual pump.fun UI, no PumpPortal. The house wallet (the deployer that minted every coin)
signs all fee transactions.

## The model

- **Every coin launches 100% house.** All 100 coins share ONE bonding-curve creator vault
  `["creator-vault", houseWallet]`, so un-opted coins' fees pool there.
- **On a founder's opt-in**, a coin makes a **one-time** on-chain move to a **3-way referral
  split**, then **locks permanently** (mirrors the program's `admin_revoked`). The founder
  (creator) is **always 80%**; the remaining 20% routes to the main token ($PUMPTANK) and,
  if present, a referrer:
  - **WITH a referrer:** creator **80%** / main-token **10%** / referrer **10%**
    (`[{founder, 8000}, {mainToken, 1000}, {referrer, 1000}]`).
  - **WITHOUT a referrer:** creator **80%** / main-token **20%**
    (`[{founder, 8000}, {mainToken, 2000}]`).
- Un-opted coins stay 100% house — that's intended.

SOL throughout: `quoteMint = NATIVE_MINT`, `quoteTokenProgram = TOKEN_PROGRAM_ID`.

All `fees` verbs default to **dry-run**; pass `--confirm` to broadcast. RPC + house key come
from env: `RPC_URL=<rpc> WALLET=<house-secret-json>` (and optional `MIN_COLLECT_SOL`,
default `0.005`). `set-shares` additionally requires `MAIN_TOKEN_WALLET=<main-token-payout-pubkey>`
(the $PUMPTANK fee-share wallet).

## Verbs

| Verb | Purpose | RPC? | Broadcast? |
|---|---|---|---|
| `status` | List tracked coins (id, optedIn, split, changeUsed, mint). | no | no |
| `verify` | Preview the shared house-vault claimable (all un-opted coins). | yes | no |
| `collect [--confirm]` | Sweep the shared house vault to the house wallet. | yes | with `--confirm` |
| `optin <id> <founderWallet> [referrerWallet]` | Record a founder opt-in (looks up the coin's mint from the launch ledger); optional referrer wallet. | no | no |
| `set-shares <id> [--confirm]` | The on-chain one-time referral split (creates the sharing config + sets shares, then locks). Needs `MAIN_TOKEN_WALLET`. | yes | with `--confirm` |
| `distribute <id> [--confirm]` | Pay out an opted-in coin's accrued fees per the configured split to founder + main-token (+ referrer). | yes | with `--confirm` |

## Collecting un-opted fees (any time)

```
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- verify          # preview claimable
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- collect          # dry-run
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- collect --confirm # sweep
```

`collect` previews the shared house creator vault and refuses below `MIN_COLLECT_SOL`. One
`collect_creator_fee_v2` tx sweeps the pooled fees of all coins that haven't opted in.

## Founder opt-in -> on-chain referral split (one-time)

1. Vet the founder; obtain + double-check their payout (founder) wallet. If the founder was
   referred, also obtain the referrer's payout wallet.
2. Record the opt-in (rejects an invalid founder/referrer wallet; resolves the coin's mint
   from the launch ledger; the coin stays 100% house until `set-shares`):
   ```
   cd launcher && npm run fees -- optin <product-id> <founder-wallet> [referrer-wallet]
   ```
   Omit `[referrer-wallet]` for an un-referred founder (the split becomes 80/20 main-token).
3. Make the on-chain split change. This is the **one-time** move and it **locks**. It needs
   `MAIN_TOKEN_WALLET` (the $PUMPTANK fee-share payout wallet) in env:
   ```
   RPC_URL=<rpc> WALLET=<house-secret-json> MAIN_TOKEN_WALLET=<main-token-wallet> npm run fees -- set-shares <product-id>           # dry-run (prints the share math)
   RPC_URL=<rpc> WALLET=<house-secret-json> MAIN_TOKEN_WALLET=<main-token-wallet> npm run fees -- set-shares <product-id> --confirm  # broadcast + lock
   ```
   This assembles `createFeeSharingConfig` (creator = house, `pool = null` pre-graduation)
   and `updateFeeSharesV2` into a single transaction, signs it with the house key, and on
   success records the sig and marks the coin `split_80_20` + locked. The shareholders are:
   - **with a referrer:** `[{founder, 8000}, {mainToken, 1000}, {referrer, 1000}]`
   - **without a referrer:** `[{founder, 8000}, {mainToken, 2000}]`

   (sum 10000 bps; founder, main-token, and referrer must all be **distinct** — Pump Fees V2
   rejects duplicate shareholders). Re-running on a locked coin is refused.
4. `npm run fees -- status` to confirm (the referrer, when set, is printed on the entry's line).

That coin's future fees now flow to its per-coin sharing-config vault (off the shared house
vault), payable via `distribute`.

## Distributing an opted-in coin's fees

```
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- distribute <product-id>           # dry-run
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- distribute <product-id> --confirm  # pay out
```

`distribute` uses `buildDistributeCreatorFeesInstructions(mint)` (handles graduated coins)
to pay the accrued sharing-config vault per the configured split to founder + main-token
(+ referrer). Refused if the coin hasn't had `set-shares` run.

## Notes

- One-time + locked: `set-shares` can run successfully only once per coin (guarded both in
  `feeconfig` and on-chain via `admin_revoked`). The dry-run prints the exact share math.
- Unclaimed fees never expire and follow the configured split.
- Proof sigs (`sharingConfigSig`/`setSharesSig`, `distributeSig`) are recorded in
  `fee-config.json` for auditability.
