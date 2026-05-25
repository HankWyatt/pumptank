# Fee Routing — Creator-Fee Config Tracker + Collect — Design Spec

**Date:** 2026-05-24
**Status:** Draft for review (redesigned after agent review + mechanics research)
**Sub-project:** 4 of 5 (creator-fee routing)

---

## Project context (PUMPTANK)

The deployer wallet is the pump.fun *creator* on all 100 launched tokens. The goal: original
product creators (Shark Tank founders) who opt in receive **80%** of *their* token's creator
fees, with **20%** retained for marketing.

**Verified mechanics (research, 2026-05-24 — see "Mechanics" below).** pump.fun's **Creator
Fee Sharing** (shipped Jan 2026) lets each token's creator fees be split across up to 10
recipient wallets at custom percentages — **per token**, with **exactly one post-launch
change, then permanently locked** (Mar 2026 anti-"vamping" rule). The split is administered
by pump.fun's fee layer (a program separate from the core bonding-curve program), so a claim
**auto-distributes to all configured recipients by their percentages**, and unclaimed fees
follow the new config when it changes. **There is no public programmatic API to *set* the
split — it is a pump.fun web/mobile UI action.**

**Therefore the model is:** each token launches at **100% house** (the deployer is the sole
creator). When a founder opts in, we use the token's **one allowed change** (manually, in the
pump.fun UI) to set **80% founder / 20% house**; thereafter fees route 80/20 natively and a
collect auto-distributes to both. Un-opted tokens stay 100% house (we keep those — the owner
is fine with that). **No escrow, custody, or per-trade attribution by us** — pump's fee layer
does the splitting.

## Goal

A small `fees` tool (in `launcher/`) that (1) **tracks** each token's fee-config state so the
irreversible one-time split-change is never wasted or mistimed, (2) provides a programmatic
**collect** (which auto-distributes per the on-chain split), and (3) documents the **manual
runbook** for setting the 80/20 split in the pump.fun UI on opt-in.

**Done means:** the tracker records per-token opt-in + split state + whether the one-time
change is used, and enforces valid transitions (no double-redirect; must be opted-in with a
valid payout wallet before redirect); `collect` (dry-run by default, `--confirm` to execute)
triggers `collectCreatorFee` so accrued fees distribute per each token's configured split; and
a runbook documents the UI steps + caveats.

## Non-goals

- **Setting the split programmatically** — no API exists; it's a manual pump.fun UI action
  (documented in the runbook). We do **not** script the UI (irreversible one-time change;
  too risky/brittle to automate).
- **Escrow / custody / per-trade fee attribution** — unnecessary; pump's fee layer splits natively.
- **Creator onboarding / opt-in UX** — manual / deferred to #5; #4 consumes the registry.
- The launch (#3), the website (#5), the hub `$PUMPTANK` token (same tooling later).

## Mechanics (verified; cite at build)

- **Two layers.** Core program (`6EF8rrec…`): creator fees pool in one `["creator-vault",
  creator]` PDA keyed on the single creator pubkey; `collectCreatorFee` drains the whole vault
  (no `mint` arg — per-creator, all the creator's coins at once). Fee-share layer (separate
  program + pump backend): per-token recipient list + percentages; auto-distributes on claim.
- **Collect (programmatic, this tool does it):** PumpPortal `POST /api/trade-local` (or
  `/api/trade`) with `{ "action": "collectCreatorFee", "pool": "pump" }`, signed by the
  deployer wallet — **confirm this exact endpoint/shape against PumpPortal docs at build**
  (the one pinned piece). Alternatively the `collectCreatorFee` instruction (IDL) via Anchor.
- **Set split (manual UI, runbook only):** pump.fun web/mobile — set recipients + %, one change
  then locked.
- **One-change-locked:** each token gets exactly one post-launch recipient/split change.
  The tracker's central job is to guard this irreversible budget.

## What #4 builds

### 1. Fee-config tracker — `data/fee-config.json` (the core deliverable)
Per product `id` (only `success` mints from #3's launch ledger):
```jsonc
{ "s13e10p1129-smarttirecompany": {
    "optedIn": false,            // mirrors creator-registry.json
    "payoutWallet": null,        // founder wallet, when opted in
    "split": "house_100",        // "house_100" | "split_80_20"
    "changeUsed": false,         // the one post-launch change consumed?
    "changedAt": null            // ts when the UI change was recorded
} }
```
A `tracker` module + CLI verbs:
- `mark-optin <id> <payoutWallet>` — set `optedIn=true` + validate base58 wallet.
- `mark-redirected <id>` — record that the UI split-change was made (sets `split="split_80_20"`,
  `changeUsed=true`, `changedAt=now`). **Refuses** if `!optedIn`, no `payoutWallet`, or
  `changeUsed` already true (guards the one-time lock).
- Pure state-transition validation, fully unit-testable.

### 2. `collect` command (programmatic)
Triggers `collectCreatorFee` (PumpPortal action) signed by the deployer; pump auto-distributes
to each token's configured recipients. Because claiming is per-creator (one vault), this is a
**single call**, not per-token. **Dry-run default** (report the claimable vault balance + the
current per-token split states it will distribute under); **`--confirm`** to execute. A
min-claim threshold skips dust.

### 3. `status` / `verify`
- `status` — print the tracker: per token opt-in/split/changeUsed; counts.
- `verify` — read on-chain what's readable: the `bonding_curve.creator` pubkey (core IDL) and
  the pooled vault's claimable balance. (The per-token split config lives in pump's fee layer
  and may not be openly readable — if not, the tracker file is the source of truth; the runbook
  has the operator confirm via the pump.fun UI.)

### 4. Manual runbook (`docs/`)
Step-by-step: on a founder's opt-in, in the pump.fun UI for that token, set creator-fee
recipients to 80% founder-wallet / 20% house, confirm (one-time, irreversible), then
`fees mark-redirected <id>`. Includes the lock caveat + a pre-change checklist.

## Architecture

New modules in `launcher/` (reuse `config`, `wallet`, `Connection`):
- `src/feeconfig.ts` — load/save `fee-config.json`; pure `markOptin`, `markRedirected`
  transition fns with validation.
- `src/collect.ts` — `collectCreatorFee(conn, wallet, opts)` (PumpPortal action; the
  build-time-pinned piece) + a `getVaultClaimable(conn, creator)` read.
- `src/feescli.ts` — the `fees` entrypoint: `mark-optin`, `mark-redirected`, `status`,
  `verify`, `collect` (dry-run default, `--confirm` gate). `npm run fees`.
- `docs/fee-routing-runbook.md` — the manual UI procedure.

## Safety

- **Tracker guards the irreversible one-time change:** `mark-redirected` refuses unless opted-in
  + valid wallet + not already used. The *operator* still performs the UI change; the tracker
  prevents recording (and thus signals against making) an invalid/duplicate one.
- **`collect` dry-run default**; `--confirm` required to broadcast (unit-tested refusal);
  threshold skips dust; deployer keypair from env, never logged/committed.
- The split itself is enforced by pump.fun (we don't move per-creator funds ourselves), so a
  bad split can only arise from a wrong UI action — mitigated by the runbook checklist +
  `mark-optin` wallet validation + dry-run preview.

## Testing plan

**Unit (no network, `vitest`):**
- `feeconfig`: `markOptin` validates the wallet; `markRedirected` succeeds only when opted-in +
  wallet present + `!changeUsed`; **rejects a second redirect** (lock) and an un-opted redirect;
  load/save round-trip.
- `collect`: dry-run reports claimable + does not broadcast; `--confirm` path calls the
  (mocked) collect action; refuses to broadcast without `--confirm`; threshold skips dust.
- `status`/`verify` formatting with a fixture tracker.

**Integration (gated, post-launch, not CI):** against mainnet after tokens trade — confirm
`collect` claims the vault and pump distributes per a token's configured split.

## Risks

- **Setting the split is manual UI, irreversible, one-time** — the highest-risk action, and we
  deliberately do NOT automate it. Mitigated by the tracker's guard + runbook checklist.
- **`collect` mechanism pinned at build** — confirm PumpPortal's `collectCreatorFee` endpoint
  (or the Anchor instruction) against current docs; only fully exercised post-launch (like #3).
- **Split config may not be on-chain-readable** — then the tracker file is the source of truth;
  `verify` covers only the creator pubkey + vault balance, and the operator confirms split in the UI.
- **Real-money collect** — dry-run default + `--confirm` + threshold.
- **Operates post-launch** — no fees until tokens trade; tracker/runbook usable from launch on.

## Open questions

- PumpPortal `collectCreatorFee` exact request shape (pinned at build).
- Whether the per-token split config is readable on-chain (determines how far `verify` can go).
- Run cadence for `collect` (operator-driven).
