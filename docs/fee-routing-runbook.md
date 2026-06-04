# Fee-routing runbook (on-chain, Pump Fees V2)

PUMPTANK's creator-fee routing runs **entirely on-chain** via `@pump-fun/pump-sdk` — no
manual pump.fun UI, no PumpPortal. The house wallet (the deployer that minted every coin)
signs all fee transactions.

## The model

- **Every coin launches 100% house.** All 100 coins share ONE bonding-curve creator vault
  `["creator-vault", houseWallet]`, so un-opted coins' fees pool there.
- **On a founder's opt-in**, a coin makes a **one-time** on-chain move to **80% founder /
  20% house**, then **locks permanently** (mirrors the program's `admin_revoked`).
- Un-opted coins stay 100% house — that's intended.

SOL throughout: `quoteMint = NATIVE_MINT`, `quoteTokenProgram = TOKEN_PROGRAM_ID`.

All `fees` verbs default to **dry-run**; pass `--confirm` to broadcast. RPC + house key come
from env: `RPC_URL=<rpc> WALLET=<house-secret-json>` (and optional `MIN_COLLECT_SOL`,
default `0.005`).

## Verbs

| Verb | Purpose | RPC? | Broadcast? |
|---|---|---|---|
| `status` | List tracked coins (id, optedIn, split, changeUsed, mint). | no | no |
| `verify` | Preview the shared house-vault claimable (all un-opted coins). | yes | no |
| `collect [--confirm]` | Sweep the shared house vault to the house wallet. | yes | with `--confirm` |
| `optin <id> <founderWallet>` | Record a founder opt-in (looks up the coin's mint from the launch ledger). | no | no |
| `set-shares <id> [--confirm]` | The on-chain one-time 80/20 (creates the sharing config + sets shares, then locks). | yes | with `--confirm` |
| `distribute <id> [--confirm]` | Pay out an opted-in coin's accrued fees 80/20 to founder + house. | yes | with `--confirm` |

## Collecting un-opted fees (any time)

```
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- verify          # preview claimable
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- collect          # dry-run
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- collect --confirm # sweep
```

`collect` previews the shared house creator vault and refuses below `MIN_COLLECT_SOL`. One
`collect_creator_fee_v2` tx sweeps the pooled fees of all coins that haven't opted in.

## Founder opt-in -> on-chain 80/20 (one-time)

1. Vet the founder; obtain + double-check their payout (founder) wallet.
2. Record the opt-in (rejects an invalid wallet; resolves the coin's mint from the launch
   ledger; the coin stays 100% house until `set-shares`):
   ```
   cd launcher && npm run fees -- optin <product-id> <founder-wallet>
   ```
3. Make the on-chain 80/20 change. This is the **one-time** move and it **locks**:
   ```
   RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- set-shares <product-id>           # dry-run (prints the share math)
   RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- set-shares <product-id> --confirm  # broadcast + lock
   ```
   This assembles `createFeeSharingConfig` (creator = house, `pool = null` pre-graduation)
   and `updateFeeSharesV2` (`[{founder, 8000}, {house, 2000}]`, sum 10000 bps) into a single
   transaction, signs it with the house key, and on success records the sig and marks the
   coin `split_80_20` + locked. Re-running on a locked coin is refused.
4. `npm run fees -- status` to confirm.

That coin's future fees now flow to its per-coin sharing-config vault (off the shared house
vault), payable via `distribute`.

## Distributing an opted-in coin's fees

```
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- distribute <product-id>           # dry-run
RPC_URL=<rpc> WALLET=<house-secret-json> npm run fees -- distribute <product-id> --confirm  # pay out
```

`distribute` uses `buildDistributeCreatorFeesInstructions(mint)` (handles graduated coins)
to pay the accrued sharing-config vault 80/20 to founder + house. Refused if the coin hasn't
had `set-shares` run.

## Notes

- One-time + locked: `set-shares` can run successfully only once per coin (guarded both in
  `feeconfig` and on-chain via `admin_revoked`). The dry-run prints the exact share math.
- Unclaimed fees never expire and follow the configured split.
- Proof sigs (`sharingConfigSig`/`setSharesSig`, `distributeSig`) are recorded in
  `fee-config.json` for auditability.
