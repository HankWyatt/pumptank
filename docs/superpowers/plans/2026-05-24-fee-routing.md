# Fee Routing (tracker + collect + runbook) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A small `fees` tool in `launcher/` that tracks each token's creator-fee split state (guarding pump.fun's one-time, irreversible per-token change), provides a programmatic `collect`, and ships a manual UI runbook.

**Architecture:** `feeconfig` is a pure state-machine over `data/fee-config.json` (`house_100 → split_80_20`, one change then locked). `collect` reads the pooled creator-vault balance and triggers `collectCreatorFee` (pump auto-distributes per each token's configured split — we never custody or attribute). The CLI wires them behind a dry-run-default / `--confirm` gate. Setting the split is a **manual pump.fun UI action** (runbook), never automated.

**Tech Stack:** TypeScript (ESM) in the existing `launcher/`, `@solana/web3.js`, `vitest`. Reuses `config`/`wallet`/`Connection`. Tests mock the chain/HTTP — nothing broadcasts or spends in CI.

**Spec:** `docs/superpowers/specs/2026-05-24-fee-routing-design.md`

**Guardrail:** single deployer wallet; pump.fun's fee layer does the 80/20 split natively; real spend (the `collect` broadcast) gated behind `--confirm`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `launcher/src/feeconfig.ts` | `FeeConfig` types; load/save `fee-config.json`; pure `markOptin`/`markRedirected` transitions (the one-change lock guard) |
| `launcher/src/collect.ts` | `creatorVaultPda`, `getVaultClaimable` (read pooled vault), `collectCreatorFee` (PumpPortal local-tx wrapper — pinned at build) |
| `launcher/src/feescli.ts` | `fees` CLI: `mark-optin`, `mark-redirected`, `status`, `verify`, `collect` (dry-run default + `--confirm`) |
| `docs/fee-routing-runbook.md` | the manual pump.fun-UI procedure for the 80/20 split on opt-in |
| `launcher/test/feeconfig.test.ts`, `collect.test.ts`, `feescli.test.ts` | vitest units |

---

### Task 1: `feeconfig.ts` — the fee-config tracker (state machine)

**Files:** Create `launcher/src/feeconfig.ts`, `launcher/test/feeconfig.test.ts`

- [ ] **Step 1: Write the failing tests** — create `launcher/test/feeconfig.test.ts`:

```typescript
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadFeeConfig, saveFeeConfig, markOptin, markRedirected } from "../src/feeconfig.js";

const VALID = "So11111111111111111111111111111111111111112"; // a valid base58 pubkey
const path = () => join(mkdtempSync(join(tmpdir(), "fee-")), "fee-config.json");

test("markOptin sets optedIn + validates the payout wallet", () => {
  const cfg = markOptin({}, "a", VALID);
  expect(cfg.a.optedIn).toBe(true);
  expect(cfg.a.payoutWallet).toBe(VALID);
  expect(cfg.a.split).toBe("house_100");
  expect(cfg.a.changeUsed).toBe(false);
});

test("markOptin rejects an invalid wallet", () => {
  expect(() => markOptin({}, "a", "not-a-pubkey")).toThrow(/wallet/i);
});

test("markRedirected requires opted-in + wallet, then locks", () => {
  let cfg = markOptin({}, "a", VALID);
  cfg = markRedirected(cfg, "a");
  expect(cfg.a.split).toBe("split_80_20");
  expect(cfg.a.changeUsed).toBe(true);
  expect(cfg.a.changedAt).not.toBeNull();
});

test("markRedirected refuses a second redirect (one-change lock)", () => {
  let cfg = markRedirected(markOptin({}, "a", VALID), "a");
  expect(() => markRedirected(cfg, "a")).toThrow(/already|locked|used/i);
});

test("markRedirected refuses an un-opted token", () => {
  expect(() => markRedirected({}, "a")).toThrow(/opt/i);
});

test("save + load round-trips", () => {
  const p = path();
  saveFeeConfig(p, markOptin({}, "a", VALID));
  expect(loadFeeConfig(p).a.payoutWallet).toBe(VALID);
  expect(loadFeeConfig("/no/such/file.json")).toEqual({});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run test/feeconfig.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/feeconfig.ts`**

```typescript
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";

export type Split = "house_100" | "split_80_20";
export interface FeeEntry {
  optedIn: boolean;
  payoutWallet: string | null;
  split: Split;
  changeUsed: boolean;
  changedAt: string | null;
}
export type FeeConfig = Record<string, FeeEntry>;

function entry(cfg: FeeConfig, id: string): FeeEntry {
  return cfg[id] ?? { optedIn: false, payoutWallet: null, split: "house_100", changeUsed: false, changedAt: null };
}

export function markOptin(cfg: FeeConfig, id: string, payoutWallet: string): FeeConfig {
  try { new PublicKey(payoutWallet); } catch { throw new Error(`invalid payout wallet: ${payoutWallet}`); }
  return { ...cfg, [id]: { ...entry(cfg, id), optedIn: true, payoutWallet } };
}

export function markRedirected(cfg: FeeConfig, id: string): FeeConfig {
  const e = entry(cfg, id);
  if (!e.optedIn || !e.payoutWallet) throw new Error(`cannot redirect ${id}: not opted in / no payout wallet`);
  if (e.changeUsed) throw new Error(`cannot redirect ${id}: one-time change already used (locked)`);
  return { ...cfg, [id]: { ...e, split: "split_80_20", changeUsed: true, changedAt: new Date().toISOString() } };
}

export function loadFeeConfig(path: string): FeeConfig {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as FeeConfig) : {};
}

export function saveFeeConfig(path: string, cfg: FeeConfig): void {
  const fd = openSync(path, "w");
  try { writeSync(fd, JSON.stringify(cfg, null, 2)); fsyncSync(fd); } finally { closeSync(fd); }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run test/feeconfig.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /home/hank/Documents/git/st add launcher/src/feeconfig.ts launcher/test/feeconfig.test.ts
git -C /home/hank/Documents/git/st commit -m "feat(launcher): fee-config tracker with one-time-change lock guard"
```

---

### Task 2: `collect.ts` — vault read + collectCreatorFee wrapper

**Files:** Create `launcher/src/collect.ts`, `launcher/test/collect.test.ts`

**Context:** `getVaultClaimable` reads the pooled `["creator-vault", creator]` PDA balance (claimable fees across all the deployer's tokens). `collectCreatorFee` is a thin PumpPortal `trade-local` wrapper (sign locally, keep custody) — its exact request shape is the **one build-time pin** (confirm `action:"collectCreatorFee"` + fields against PumpPortal docs). Unit tests cover `getVaultClaimable` + the error path; the happy-path broadcast is exercised post-launch (like #3's real SDK call).

- [ ] **Step 1: Write the failing tests** — create `launcher/test/collect.test.ts`:

```typescript
import { expect, test, vi } from "vitest";
import { Keypair, PublicKey } from "@solana/web3.js";
import { creatorVaultPda, getVaultClaimable, collectCreatorFee, PUMP_PROGRAM_ID } from "../src/collect.js";

test("creatorVaultPda derives a deterministic PDA owned by the pump program", () => {
  const creator = Keypair.generate().publicKey;
  const a = creatorVaultPda(creator);
  const b = creatorVaultPda(creator);
  expect(a.equals(b)).toBe(true);
  expect(a).toBeInstanceOf(PublicKey);
  expect(PUMP_PROGRAM_ID.toBase58()).toBe("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
});

test("getVaultClaimable returns the vault lamport balance as bigint", async () => {
  const conn = { getBalance: async () => 12345 } as any;
  expect(await getVaultClaimable(conn, Keypair.generate().publicKey)).toBe(12345n);
});

test("collectCreatorFee throws on a non-OK PumpPortal response", async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "err" });
  const conn = { sendRawTransaction: vi.fn() } as any;
  await expect(collectCreatorFee(conn, Keypair.generate(),
    { pumpportalUrl: "https://pumpportal.fun", fetchImpl })).rejects.toThrow(/collectCreatorFee/i);
  expect(conn.sendRawTransaction).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run test/collect.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/collect.ts`**

```typescript
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";

export const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

export function creatorVaultPda(creator: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), creator.toBuffer()], PUMP_PROGRAM_ID,
  )[0];
}

export async function getVaultClaimable(conn: Connection, creator: PublicKey): Promise<bigint> {
  return BigInt(await conn.getBalance(creatorVaultPda(creator), "confirmed"));
}

export interface CollectOpts {
  pumpportalUrl: string;
  priorityFeeSol?: number;
  fetchImpl?: typeof fetch;
}

// Thin PumpPortal local-tx wrapper: fetch a serialized collectCreatorFee tx, sign
// locally (keep custody), submit via our RPC. CONFIRM the request shape against
// PumpPortal docs at build (the one pinned piece); pump auto-distributes per each
// token's configured split.
export async function collectCreatorFee(
  conn: Connection, wallet: Keypair, opts: CollectOpts,
): Promise<string> {
  const f = opts.fetchImpl ?? fetch;
  const res = await f(`${opts.pumpportalUrl}/api/trade-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      publicKey: wallet.publicKey.toBase58(),
      action: "collectCreatorFee",
      pool: "pump",
      priorityFee: opts.priorityFeeSol ?? 0.00001,
    }),
  });
  if (!res.ok) throw new Error(`PumpPortal collectCreatorFee failed: ${res.status} ${await res.text()}`);
  const tx = VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
  tx.sign([wallet]);
  return conn.sendRawTransaction(tx.serialize());
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run test/collect.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git -C /home/hank/Documents/git/st add launcher/src/collect.ts launcher/test/collect.test.ts
git -C /home/hank/Documents/git/st commit -m "feat(launcher): creator-vault read + collectCreatorFee wrapper"
```

---

### Task 3: `feescli.ts` — the `fees` CLI behind the gate

**Files:** Create `launcher/src/feescli.ts`, `launcher/test/feescli.test.ts`

**Context:** Pure helpers (`previewCollect`, `assertCanBroadcast`) are unit-tested; `main()` wires modules (config/wallet/Connection/feeconfig/collect) and is exercised by the runbook. `collect` injects the collect fn so the CLI is tested without network. Guard the module-level entrypoint with the ESM main-module check (as `cli.ts` does) so importing it in tests doesn't run it.

- [ ] **Step 1: Write the failing tests** — create `launcher/test/feescli.test.ts`:

```typescript
import { expect, test } from "vitest";
import { previewCollect, assertCanBroadcast } from "../src/feescli.js";

test("previewCollect formats the claimable vault balance", () => {
  const line = previewCollect(2_500_000_000n);
  expect(line).toMatch(/2\.5/);
  expect(line).toMatch(/SOL/);
});

test("assertCanBroadcast throws without --confirm", () => {
  expect(() => assertCanBroadcast(false)).toThrow(/confirm/i);
});

test("assertCanBroadcast passes with --confirm", () => {
  expect(() => assertCanBroadcast(true)).not.toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run test/feescli.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/feescli.ts`**

```typescript
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { loadWallet } from "./wallet.js";
import { loadFeeConfig, saveFeeConfig, markOptin, markRedirected } from "./feeconfig.js";
import { getVaultClaimable, collectCreatorFee } from "./collect.js";

const DATA_DIR = join(process.cwd(), "..", "data");
const CONFIG_PATH = join(DATA_DIR, "fee-config.json");

export function previewCollect(claimableLamports: bigint): string {
  return `Claimable creator-fee vault: ${(Number(claimableLamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL (pump distributes per each token's configured split)`;
}

export function assertCanBroadcast(confirm: boolean): void {
  if (!confirm) throw new Error("refusing to broadcast: pass --confirm to collect (default is dry-run)");
}

export async function main(argv: string[], env: Record<string, string | undefined>): Promise<void> {
  const [cmd, ...rest] = argv;
  const confirm = argv.includes("--confirm");

  if (cmd === "mark-optin") {
    const [id, wallet] = rest;
    saveFeeConfig(CONFIG_PATH, markOptin(loadFeeConfig(CONFIG_PATH), id, wallet));
    console.log(`opted in: ${id} -> ${wallet}`);
    return;
  }
  if (cmd === "mark-redirected") {
    const [id] = rest;
    saveFeeConfig(CONFIG_PATH, markRedirected(loadFeeConfig(CONFIG_PATH), id));
    console.log(`redirected (80/20) + locked: ${id}`);
    return;
  }
  if (cmd === "status") {
    const cfg = loadFeeConfig(CONFIG_PATH);
    const all = Object.entries(cfg);
    const redirected = all.filter(([, e]) => e.split === "split_80_20").length;
    console.log(`fee-config: ${all.length} tracked, ${redirected} redirected (80/20), ${all.length - redirected} at 100% house`);
    for (const [id, e] of all) console.log(`  ${id}: optedIn=${e.optedIn} split=${e.split} changeUsed=${e.changeUsed}`);
    return;
  }

  // collect / verify need the wallet + RPC
  const wallet = loadWallet(env);
  const conn = new Connection(env.RPC_URL ?? "https://api.mainnet-beta.solana.com", "confirmed");
  const claimable = await getVaultClaimable(conn, wallet.publicKey);

  if (cmd === "verify") {
    console.log(`creator (deployer): ${wallet.publicKey.toBase58()}`);
    console.log(previewCollect(claimable));
    return;
  }
  if (cmd === "collect") {
    console.log(previewCollect(claimable));
    if (!confirm) { console.log("DRY RUN -- not collecting. Re-run with --confirm."); return; }
    assertCanBroadcast(confirm);
    const sig = await collectCreatorFee(conn, wallet, { pumpportalUrl: env.PUMPPORTAL_URL ?? "https://pumpportal.fun" });
    console.log(`collected: https://solscan.io/tx/${sig}`);
    return;
  }
  console.log("usage: fees <mark-optin|mark-redirected|status|verify|collect> [...]");
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2), process.env).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
}
```

Add to `launcher/package.json` `scripts`: `"fees": "tsx src/feescli.ts"`.

- [ ] **Step 4: Run tests + full suite + build**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run test/feescli.test.ts && npm test && npm run build`
Expected: all PASS; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git -C /home/hank/Documents/git/st add launcher/src/feescli.ts launcher/test/feescli.test.ts launcher/package.json
git -C /home/hank/Documents/git/st commit -m "feat(launcher): fees CLI (tracker verbs + dry-run collect gate)"
```

---

### Task 4: Runbook + real-data `status`

**Files:** Create `docs/fee-routing-runbook.md`; verify `fees status` runs.

- [ ] **Step 1: Create `docs/fee-routing-runbook.md`**

```markdown
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
```

- [ ] **Step 2: Verify `fees status` runs on an empty/real config**

Run: `cd /home/hank/Documents/git/st/launcher && npm run fees -- status`
Expected: prints `fee-config: 0 tracked, ...` (no `data/fee-config.json` yet) and exits 0 — no wallet/network needed for `status`.

- [ ] **Step 3: Commit**

```bash
git -C /home/hank/Documents/git/st add docs/fee-routing-runbook.md
git -C /home/hank/Documents/git/st commit -m "docs(launcher): fee-routing manual UI runbook"
```

---

## Self-Review

- **Spec coverage:** tracker state-machine + one-change lock (Task 1) ✓; `collect` + pooled-vault read + PumpPortal `collectCreatorFee` pinned-at-build (Task 2) ✓; CLI verbs `mark-optin/mark-redirected/status/verify/collect` + dry-run-default/`--confirm` gate (Task 3) ✓; manual UI runbook (Task 4) ✓; no escrow/attribution (none built — pump splits natively) ✓; reuses `wallet`/`Connection` (Task 3) ✓; secrets via env, never logged (`feescli` error path prints `.message`) ✓.
- **Placeholder scan:** none — complete code/commands per step. The "confirm PumpPortal request shape at build" note (Task 2) is a real external-dependency pin (mocked in CI, verified post-launch), not deferred work; `collectCreatorFee` happy-path is exercised post-launch exactly like #3's SDK call.
- **Type consistency:** `FeeConfig`/`FeeEntry`/`Split`, `markOptin(cfg,id,wallet)`, `markRedirected(cfg,id)`, `loadFeeConfig/saveFeeConfig`, `creatorVaultPda`, `getVaultClaimable(conn,creator)`, `collectCreatorFee(conn,wallet,opts)`, `previewCollect`/`assertCanBroadcast` are used identically across modules + tests + CLI.
- **Real-money safety:** the only broadcast is `collect`, gated behind `--confirm` (dry-run default, unit-tested refusal); the irreversible split-change is manual UI, guarded (not performed) by the tracker.
