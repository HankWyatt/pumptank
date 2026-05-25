# Launch Engine (one-shot pump.fun create + dev-buy) — Design Spec

**Date:** 2026-05-24
**Status:** Draft for review (agent-review fixes applied)
**Sub-project:** 3 of 5 (the on-chain launch)

---

## Project context (PUMPTANK)

Sub-projects 1–2 produced `data/products.json`: the **100 selected** no-deal pitches, each
with a token `{name, symbol, description}` and a generated card image in
`data/token_images/`. Sub-project **3** is the **one-shot launch engine**: run once, it
creates all 100 pump.fun tokens — each an atomic **create + dev-buy** in a single
transaction from **one identifiable creator wallet** — and records the resulting mint
addresses. Then it is never run again.

This is the project's first **irreversible, real-money, on-chain** step. Two hard gates sit
**before** any mainnet run (outside this code's control): a **legal review** of the
disclaimer + Shark Tank trademark/likeness posture, and the user's explicit go/no-go.

**Terminology:** "bundled" here means the **atomic create+dev-buy in one transaction** (the
legitimate pump.fun pattern). It does **NOT** mean multi-wallet Jito bundling — that
sybil/fake-demand pattern is explicitly rejected (a project guardrail). Every token is one
transaction signed by the one creator wallet.

## Goal

A TypeScript launcher that, run once, creates the 100 tokens (create + dev-buy per token)
and records each mint — **crash-safe/resumable** and **safety-gated** (dry-run + simulation
by default; an explicit confirm flag required to broadcast real money).

**Done means:** on a `--confirm` run with a funded wallet, every selected token is created
on pump.fun with its card image + a dev-buy, and `data/launch-ledger.json` records each
`{id → mint, signature, status}`; a crash mid-run is fully recoverable — re-running launches
only the not-yet-succeeded tokens and **never double-creates**, even if a crash occurred
between broadcast and confirmation.

## Non-goals

- **Fee routing** (#4) and the **website** (#5).
- The **hub `$PUMPTANK` token** — same mechanism, separate metadata; handled separately.
- **Multi-wallet / Jito bundling** — rejected guardrail; single wallet, one tx per token.
- A reusable/long-lived tool — one-shot; optimize for **correctness at launch time** (pin
  the SDK, verify against mainnet just before) over future-proofing.

## Inputs

- `data/products.json` → records with `include == true`: `token.{name, symbol, description}`,
  `media.image_url` (relative path to the card PNG under `data/`).
- `data/token_images/*.png` — the card images.
- **Creator wallet keypair** — loaded from an env var / key file, **never committed**.
- A Solana **mainnet RPC endpoint** (env).
- Config: `DEV_BUY_SOL = 0.4306`, `slippageBps` (pinned, see Safety), `priorityFee`,
  `pacingMs`, `MAX_TOTAL_SPEND_SOL`, `maxRetriesPerToken`.

## On-chain mechanics (verified against `pumpdotfun-repumped-sdk` v1.4.2 + pump.fun docs)

Per token: `mint = Keypair.generate()`; image → `Blob`; then
`sdk.trade.createAndBuy(creator, mint, { name, symbol, description, file: imageBlob },
buyAmountSol, slippageBasisPoints, priorityFees?, commitment?, finality?)`. It uploads
metadata+image to `https://pump.fun/api/ipfs`, builds the `create` instruction, appends the
`buy` (dev-buy) in the **same transaction**, signs with `[creator, mint]`, and broadcasts.
`mint.publicKey` is the token mint/CA.

Verified specifics (do not deviate):
- **`buyAmountSol` is a `bigint`.** Use `BigInt(Math.round(DEV_BUY_SOL * LAMPORTS_PER_SOL))`
  — a plain `number` throws inside the SDK. (The SDK README's `0.0001 * LAMPORTS_PER_SOL`
  example is buggy; do not copy it.)
- **`slippageBasisPoints` defaults to `500n` (5%)** if omitted — we pass an explicit pinned value.
- **Program IDs (mainnet, confirmed):** pump program `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`,
  fee program `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ`. Re-verify against mainnet before the run.
- **Fees (current pump.fun docs):** **token creation is free (0 SOL)**; a **~1.25% trading
  fee** (0.95% protocol + 0.30% creator) applies to each buy — so the dev-buy's effective
  cost is `DEV_BUY_SOL` + ~1.25% + account rent + priority fee. (The 0.30% creator share is
  what #4 later forwards 80/20.)
- **Dev-buy size:** `0.4306 SOL ≈ 1.5% of the 1,000,000,000 total supply` at the opening
  curve (~1.9% of the on-curve supply). "1.5%" is measured against **total** supply.

**No devnet path (important):** the IPFS upload is hardcoded to mainnet `pump.fun/api/ipfs`,
and PumpPortal/pump.fun offer **no devnet/testnet**. A devnet dress-rehearsal is therefore
**not viable end-to-end**. Safety relies on mainnet `simulateTransaction` dry-runs + a
single tiny real launch (below), not a free full rehearsal.

## Architecture

New TypeScript/Node project at **`launcher/`** (separate from the Python `pipeline/`),
consuming the repo's `data/`. Pinned deps: `pumpdotfun-repumped-sdk` (v1.4.2),
`@solana/web3.js`, `@coral-xyz/anchor`; test runner `vitest`.

Modules (each one responsibility, independently testable):
- `src/config.ts` — env + flags → typed config; **asserts `slippageBps` ≤ an upper bound**
  and `MAX_TOTAL_SPEND_SOL` is set.
- `src/wallet.ts` — load + validate the creator `Keypair` from env/file; pubkey; balance.
- `src/products.ts` — load `data/products.json`, filter `include == true`, map to
  `LaunchItem { id, name, symbol, description, imagePath }`; **validate the image exists and
  that `id` and `symbol` are unique — fail loudly on dupes** before any launch.
- `src/mintstore.ts` — generate + persist a per-`id` mint `Keypair` to a **git-ignored**
  `data/.mint-keys/{id}.json` **before broadcast**; reload it on resume (so a retry reuses
  the same mint — a duplicate `create` is rejected on-chain, never a second token).
- `src/ledger.ts` — read/write `data/launch-ledger.json`
  (`{ [id]: { mint, signature?, status: "attempting"|"success"|"failed", error?, attempts, ts } }`),
  **fsync on write**; `statusOf(id)`, `record(entry)`. **Pubkeys/signatures only — never secrets.**
- `src/launch.ts` — `launchOne(sdk, wallet, item, mint, opts) -> { mint, signature }`; loads
  the image Blob, calls `createAndBuy` with `commitment:"confirmed"`, throws on failure.
- `src/recover.ts` — for an `attempting` entry on resume: query the chain for that mint
  (`getAccountInfo` on the mint / bonding-curve PDA). Exists → promote to `success`
  (recover, do **not** relaunch). Provably absent → eligible to retry with the **same** mint.
- `src/orchestrate.ts` — the batch: cost preview, balance precheck, **recover `attempting`
  first**, iterate items skipping `success`, enforce `MAX_TOTAL_SPEND_SOL` against cumulative
  confirmed spend + `maxRetriesPerToken`, write-ahead `attempting` → `launchOne` → record
  `success`/`failed`, pace between txs; a single failure records + continues, never aborts.
- `src/cli.ts` — arg parsing + the gates (below); wires the modules.

## Per-token launch sequence (crash-safe)

1. `recover`: if ledger `status==success` → skip. If `attempting` → chain-check the recorded
   mint; recover→`success` or fall through to retry (same mint from `mintstore`).
2. Load/generate the per-`id` mint keypair (persisted to git-ignored `data/.mint-keys/`).
3. **Write-ahead:** ledger `{id, mint:<pubkey>, status:"attempting", attempts++}` + fsync —
   *before* broadcasting.
4. `createAndBuy(...)`; on confirmation → ledger `status:"success", signature`.
5. On throw/timeout → ledger `status:"failed", error` (the next run re-checks the chain via
   step 1, so a late-confirming tx can't double-create). Stop the item after `maxRetriesPerToken`.

## Safety gates (the crux)

- **Default = dry-run:** build each tx and `simulateTransaction` (no broadcast); report what
  *would* launch + the full cost. Broadcasting requires explicit **`--confirm`**; a unit test
  asserts the CLI refuses to broadcast without it.
- **Cost preview** — `count × DEV_BUY_SOL` (≈43.1 SOL) **+ ~1.25% trading fee + rent +
  priority fees** ⇒ budget **~44–45 SOL**; printed before any spend.
- **`MAX_TOTAL_SPEND_SOL` hard cap** — checked against cumulative *confirmed* spend mid-run;
  abort if exceeded (guards a config error or RPC-flap retry loop from runaway spend).
- **Balance precheck** — abort before launching if wallet balance < required total.
- **`--only <id>` / `--limit N`** — launch a subset (used for the single mainnet test launch).
- **Pinned slippage** (e.g. `slippageBps = 150`) with an asserted upper bound.
- **Mandatory pre-full-run runbook:** (1) dry-run/simulate all 100; (2) one **real mainnet
  test launch** (`--only <id> --confirm`) verified on pump.fun; (3) legal sign-off + go/no-go;
  (4) the full `--confirm` run. (No devnet step — not viable; see mechanics.)

## Output

- `data/launch-ledger.json` — the canonical record (pubkeys/signatures only; committed after
  the real run).
- `data/.mint-keys/` — per-id mint secrets; **git-ignored**, never committed.
- A small **backfill step** copies `ledger[id].mint` into `products.json` `token.mint`
  (a Python one-liner / `launcher` subcommand) so #4/#5 read mints from the existing source.

## Key & secret handling

Creator keypair from env/file only; **never committed; never logged** (scrub error paths so a
thrown SDK error can't surface the secret). `.gitignore` covers the keystore, `data/.mint-keys/`,
`*.key`, and `.env`. The committed ledger contains only public mints/signatures.

## Testing plan

On-chain real-money code can't be fully exercised in CI; test everything around the broadcast,
plus the recovery logic, and rehearse the broadcast via mainnet simulation + one tiny real launch.

**Unit (no network, `vitest`):**
- `config`: parsing; **mainnet broadcast refused without `--confirm`**; `slippageBps` over the
  cap is rejected; missing `MAX_TOTAL_SPEND_SOL` rejected.
- dev-buy math: `BigInt(Math.round(DEV_BUY_SOL*LAMPORTS_PER_SOL))`; cost-preview total.
- `products`: filters `include==true`; **fails on a missing image, a duplicate `id`, or a
  duplicate `symbol`**.
- `ledger`/`mintstore`: round-trip; `statusOf`; same-mint reload on retry; ledger holds no secret.
- **`recover` (mocked chain):** `attempting` + mint exists on-chain → `success` (no relaunch);
  `attempting` + mint absent → eligible retry with the same mint. (Highest-value test.)
- `orchestrate` with a **mocked SDK**: skips `success`; write-ahead `attempting` precedes the
  call; records `success`/`failed`; **continues** on a thrown `createAndBuy`; enforces
  `MAX_TOTAL_SPEND_SOL` and `maxRetriesPerToken`; respects `--limit`.
- `wallet`: loads from a fixture secret; balance precheck aborts when too low (mocked RPC).

**Integration (gated, not CI — runbook):** mainnet **simulate** all 100 (no broadcast); then
one real `--only <id> --confirm` tiny launch, confirm the mint on pump.fun + ledger recovery.

## Risks

- **Irreversible real money** — mitigated by default dry-run/simulate, cost preview,
  `MAX_TOTAL_SPEND_SOL`, balance precheck, the `--confirm` gate, and the one-test-launch runbook.
- **No free full rehearsal** (devnet not viable) — the residual risk is real; mitigated by
  mainnet simulation + one tiny real launch + careful SDK audit. Accept consciously.
- **Crash-window double-launch** — mitigated by the write-ahead `attempting` ledger +
  same-mint retry + on-chain recovery check (per-token sequence above).
- **Community SDK / program correctness** — pin v1.4.2; **audit the `create`+`buy`
  instructions and re-verify the program IDs against mainnet** before the run.
- **Slippage / fee surprises** — pinned slippage + budgeted ~1.25% trading fee; `MAX_TOTAL_SPEND_SOL`
  is the backstop.
- **RPC reliability / rate limits** — pacing + bounded per-token retry; resumable ledger.
- **Key leakage** — see Key & secret handling.

## Open questions

- Recommended **priority fee** + `pacingMs` for a reliable 100-tx mainnet run (tuned during
  the simulate/test-launch step).
- Hub `$PUMPTANK` token launch (separate; could reuse this engine).

## Review (2026-05-24)

Independent agent review (Opus 4.7) verified mechanics against `pumpdotfun-repumped-sdk`
v1.4.2 source + pump.fun/PumpPortal docs. Verdict **NEEDS CHANGES → applied**: (1) **devnet
rehearsal is not viable** (IPFS hardcoded to mainnet; no devnet API) — pivoted the safety net
to mainnet simulate + one tiny real launch; (2) **crash-between-broadcast-and-confirm
double-launch** — added the write-ahead `attempting` ledger + persisted per-id mint +
on-chain recovery check; (3) `buyAmountSol` is `bigint` (not `round()`→number); (4) pinned
slippage + upper-bound assert (SDK default 5%); (5) `MAX_TOTAL_SPEND_SOL` + per-token retry
cap; (6) unique `id`/`symbol` validation; (7) key/secret hygiene (no secrets in ledger/logs;
git-ignore mint-keys/keystore/.env); (8) corrected fee facts (creation free; ~1.25% trading)
and the "1.5% of total supply" denominator.
