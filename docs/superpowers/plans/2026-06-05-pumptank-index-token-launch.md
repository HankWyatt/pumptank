# Index-Token ($PUMPTANK) Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone `npm run launch:index` command that launches the index ($PUMPTANK) pump.fun token with a 10%-of-supply dev-buy on the house wallet, reusing the existing launch engine.

**Architecture:** A new thin `launcher/src/index-launch.ts` builds one `LaunchItem` (`devBuy=true`) + its OWN opts (10% = 1e14 tokens; SOL cap from `INDEX_DEV_BUY_SOL`), builds/reuses the Address Lookup Table, and runs the single item through the existing `runBatch` → `launchOne(devBuy)` path. No new on-chain logic. `INDEX_DEV_BUY_SOL` is the on-chain `max_sol_cost` ceiling (over-estimating never overspends); a devnet/mainnet `simulate` is the real-curve safety gate before broadcast.

**Tech Stack:** TypeScript (ESM, `tsx`), `@pump-fun/pump-sdk@1.36.0` (loaded via `createRequire`), `@solana/web3.js`, `bn.js`, Vitest. Spec: `docs/superpowers/specs/2026-06-05-pumptank-index-token-launch-design.md`.

---

## File structure

- **Create** `launcher/src/index-launch.ts` — index constants + pure helpers (`buildIndexItem`, `resolveIndexDevBuySol`, `indexLaunchOpts`, `indexBatchOpts`, `indexPreview`, `flagOr`) + the `main()` network orchestration + entrypoint guard.
- **Create** `launcher/test/index-launch.test.ts` — offline unit tests for the pure helpers (mock the SDK, like `cli.test.ts`).
- **Create** `launcher/scripts/devnet-index-simulate.ts` — throwaway devnet `simulate` of the 10% create+buy (verification, Task 7).
- **Modify** `launcher/package.json` — add the `launch:index` script.
- **Asset** `data/index/pumptanklogo.png` — PNG conversion of `pumptanklogo.jpg` (fixes the `metadata.ts` `image/png` hardcoding; Task 1).

Reused UNCHANGED: `launch.ts` (`launchOne`/`LaunchDeps`/`LaunchOpts`), `alt.ts`, `orchestrate.ts` (`runBatch`/`BatchOpts`), `metadata.ts`, `wallet.ts`, `recover.ts`, `ledger.ts`, `mintstore.ts`, `config.ts` (`buildConfig`).

---

### Task 1: Convert the logo to PNG

**Files:**
- Create: `data/index/pumptanklogo.png` (from `data/index/pumptanklogo.jpg`)

- [ ] **Step 1: Convert JPEG → PNG (format only, preserve the art)**

Run:
```bash
cd /home/hank/Documents/git/st && python3 -c "from PIL import Image; Image.open('data/index/pumptanklogo.jpg').convert('RGB').save('data/index/pumptanklogo.png')"
```

- [ ] **Step 2: Verify it is a valid PNG**

Run:
```bash
cd /home/hank/Documents/git/st && python3 -c "from PIL import Image; im=Image.open('data/index/pumptanklogo.png'); print(im.format, im.size, im.mode)"
```
Expected: `PNG (1254, 1254) RGB`

- [ ] **Step 3: Commit**

```bash
git -C /home/hank/Documents/git/st add data/index/pumptanklogo.png
git -C /home/hank/Documents/git/st commit -m "chore(index): add PNG logo for the index token (image/png upload path)"
```

---

### Task 2: Pure helpers — constants, item, opts, preview

**Files:**
- Create: `launcher/src/index-launch.ts`
- Test: `launcher/test/index-launch.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `launcher/test/index-launch.test.ts`:
```ts
import { expect, test, vi } from "vitest";

// Mirror cli.test.ts: stub the pump SDK so the loader stays offline. The pure
// helpers under test never touch the SDK (it's loaded via createRequire in main()).
vi.mock("@pump-fun/pump-sdk", () => ({ OnlinePumpSdk: class {}, PumpSdk: class {} }));

import {
  INDEX_ID, INDEX_NAME, INDEX_SYMBOL, INDEX_DEV_BUY_TOKENS,
  buildIndexItem, resolveIndexDevBuySol, indexLaunchOpts, indexBatchOpts, indexPreview,
} from "../src/index-launch.js";

test("buildIndexItem returns the index LaunchItem with devBuy=true", () => {
  const item = buildIndexItem("/abs/pumptanklogo.png");
  expect(item.id).toBe(INDEX_ID);
  expect(item.id).toBe("index-pumptank");
  expect(item.name).toBe(INDEX_NAME);
  expect(item.symbol).toBe(INDEX_SYMBOL);
  expect(item.imagePath).toBe("/abs/pumptanklogo.png");
  expect(item.devBuy).toBe(true);
  expect(item.description.toLowerCase()).toContain("not financial advice");
});

test("INDEX_DEV_BUY_TOKENS is 10% of the 1e15 supply", () => {
  expect(INDEX_DEV_BUY_TOKENS).toBe(100_000_000_000_000n); // 1e14 = 10% of 1e15
});

test("resolveIndexDevBuySol: default 3.5, env override, rejects bad values", () => {
  expect(resolveIndexDevBuySol({})).toBe(3.5);
  expect(resolveIndexDevBuySol({ INDEX_DEV_BUY_SOL: "4.2" })).toBe(4.2);
  expect(() => resolveIndexDevBuySol({ INDEX_DEV_BUY_SOL: "0" })).toThrow(/INDEX_DEV_BUY_SOL/);
  expect(() => resolveIndexDevBuySol({ INDEX_DEV_BUY_SOL: "x" })).toThrow(/INDEX_DEV_BUY_SOL/);
});

test("indexLaunchOpts: 1e14 tokens + a slippage-buffered lamport cap", () => {
  const opts = indexLaunchOpts(150, 3.5, 200_000);
  expect(opts.devBuyTokens).toBe(100_000_000_000_000n);
  // 3.5 * (1 + 150/10000) * 1e9 = 3,552,500,000
  expect(opts.solCapLamports).toBe(3_552_500_000n);
  expect(opts.priorityFeeMicroLamports).toBe(200_000);
});

test("indexBatchOpts: devBuySol is the INDEX figure (so the spend cap accounts for it)", () => {
  const cfg = { slippageBps: 150, priorityFeeMicroLamports: 200_000, pacingMs: 1500,
    maxTotalSpendSol: 5, maxRetriesPerToken: 2 } as any;
  const b = indexBatchOpts(cfg, 3.5);
  expect(b.devBuySol).toBe(3.5);
  expect(b.maxTotalSpendSol).toBe(5);
  expect(b.maxRetriesPerToken).toBe(2);
});

test("indexPreview: mentions PUMPTANK, 10%, and the cap", () => {
  const { capSol, line } = indexPreview(3.5);
  expect(capSol).toBe(3.5);
  expect(line).toMatch(/PUMPTANK/);
  expect(line).toMatch(/10%/);
  expect(line).toMatch(/3\.50/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run test/index-launch.test.ts`
Expected: FAIL — cannot find module `../src/index-launch.js` / exports undefined.

- [ ] **Step 3: Create `launcher/src/index-launch.ts` with the constants + pure helpers**

```ts
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { argv as processArgv } from "node:process";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import type { LaunchItem } from "./types.js";
import type { BatchOpts } from "./orchestrate.js";
import type { LaunchDeps, LaunchOpts } from "./launch.js";
import { buildConfig } from "./config.js";
import { loadWallet, hasSufficientBalance } from "./wallet.js";
import { launchOne } from "./launch.js";
import { uploadTokenMetadata } from "./metadata.js";
import { mintExistsOnChain } from "./recover.js";
import { runBatch } from "./orchestrate.js";
import { computeStaticLutAddresses, loadOrCreateLookupTable } from "./alt.js";
import { Ledger } from "./ledger.js";
import { MintStore } from "./mintstore.js";

export const INDEX_ID = "index-pumptank";
export const INDEX_NAME = "PUMPTANK";
export const INDEX_SYMBOL = "PUMPTANK";
// 10% of the 1e15 Token-2022 (6-decimal) supply. The product dev-buy was 1.5e13 (1.5%).
export const INDEX_DEV_BUY_TOKENS = 100_000_000_000_000n;
export const DEFAULT_INDEX_DEV_BUY_SOL = 3.5; // on-chain max_sol_cost ceiling (~3.1 actual at genesis)
export const INDEX_DESCRIPTION =
  "PUMPTANK — the index token of the unofficial Shark Tank tribute. Trading fees from " +
  "every product token flow to the PUMPTANK treasury. Unofficial parody; not affiliated " +
  "with Shark Tank/ABC/Sony; not financial advice; no promise of value.";

export function flagOr(argv: string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

export function buildIndexItem(imagePath: string): LaunchItem {
  return { id: INDEX_ID, name: INDEX_NAME, symbol: INDEX_SYMBOL,
    description: INDEX_DESCRIPTION, imagePath, devBuy: true };
}

export function resolveIndexDevBuySol(env: Record<string, string | undefined>): number {
  const v = Number(env.INDEX_DEV_BUY_SOL ?? DEFAULT_INDEX_DEV_BUY_SOL);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error(`INDEX_DEV_BUY_SOL must be a positive number, got ${env.INDEX_DEV_BUY_SOL}`);
  }
  return v;
}

export function indexLaunchOpts(
  slippageBps: number, indexDevBuySol: number, priorityFeeMicroLamports: number,
): LaunchOpts {
  const solCapLamports = BigInt(Math.ceil(indexDevBuySol * (1 + slippageBps / 10_000) * 1e9));
  return { devBuyTokens: INDEX_DEV_BUY_TOKENS, solCapLamports, priorityFeeMicroLamports };
}

export function indexBatchOpts(
  cfg: { slippageBps: number; priorityFeeMicroLamports: number; pacingMs: number;
    maxTotalSpendSol: number; maxRetriesPerToken: number },
  indexDevBuySol: number,
): BatchOpts {
  return {
    devBuySol: indexDevBuySol, // the spend cap must account for the index buy
    slippageBps: cfg.slippageBps,
    priorityFeeMicroLamports: cfg.priorityFeeMicroLamports,
    pacingMs: cfg.pacingMs,
    maxTotalSpendSol: cfg.maxTotalSpendSol,
    maxRetriesPerToken: cfg.maxRetriesPerToken,
  };
}

export function indexPreview(indexDevBuySol: number): { capSol: number; line: string } {
  return {
    capSol: indexDevBuySol,
    line: `Would launch index token $PUMPTANK with a 10% dev-buy ` +
      `(cap ~${indexDevBuySol.toFixed(2)} SOL; ~3.1 SOL actual at genesis) ` +
      `+ ~0.02 SOL create rent + priority fee`,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run test/index-launch.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git -C /home/hank/Documents/git/st add launcher/src/index-launch.ts launcher/test/index-launch.test.ts
git -C /home/hank/Documents/git/st commit -m "feat(launcher): index-launch pure helpers (item/opts/preview) + tests"
```

---

### Task 3: `main()` orchestration + entrypoint

**Files:**
- Modify: `launcher/src/index-launch.ts` (append `main()` + entrypoint guard)

- [ ] **Step 1: Append `main()` and the entrypoint guard to `launcher/src/index-launch.ts`**

```ts
export async function main(argv: string[], env: Record<string, string | undefined>): Promise<void> {
  const cfg = buildConfig(argv, env); // reuses MAX_TOTAL_SPEND_SOL/RPC_URL/SLIPPAGE_BPS/PRIORITY_FEE/--confirm
  const dataDir = join(process.cwd(), "..", "data");
  const imagePath = flagOr(argv, "--image", join(dataDir, "index", "pumptanklogo.png"));
  if (!existsSync(imagePath)) throw new Error(`index image not found: ${imagePath}`);
  const indexDevBuySol = resolveIndexDevBuySol(env);
  const item = buildIndexItem(imagePath);

  const { line } = indexPreview(indexDevBuySol);
  console.log(line);
  if (!cfg.confirm) { console.log("DRY RUN -- no transactions broadcast. Re-run with --confirm to launch."); return; }

  const wallet = loadWallet(env);
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  const opts = indexLaunchOpts(cfg.slippageBps, indexDevBuySol, cfg.priorityFeeMicroLamports);
  const required = indexDevBuySol * 1.08 + 0.02; // dev-buy (slippage buffer) + create rent
  if (!(await hasSufficientBalance(conn, wallet.publicKey, required))) {
    throw new Error(`wallet balance below required ~${required.toFixed(2)} SOL`);
  }
  // ESM/CJS: load the official SDK via createRequire (its ESM build's named anchor BN import breaks under Node ESM).
  const { OnlinePumpSdk, PumpSdk } = createRequire(import.meta.url)("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");
  const onlineSdk = new OnlinePumpSdk(conn);
  const pumpSdk = new PumpSdk();
  const global = await onlineSdk.fetchGlobal();

  // The index is a dev-buy → build/reuse the ALT so create_v2+buy fits one legacy tx.
  const staticAddrs = await computeStaticLutAddresses((m: Keypair) => pumpSdk.createV2AndBuyInstructions({
    global, mint: m.publicKey, name: item.name, symbol: item.symbol, uri: "https://pump.fun",
    creator: wallet.publicKey, user: wallet.publicKey,
    amount: new BN(opts.devBuyTokens.toString()), solAmount: new BN(opts.solCapLamports.toString()), mayhemMode: false,
  } as any), wallet.publicKey);
  console.log(`lookup table: ${staticAddrs.length} static accounts`);
  const lookupTable = await loadOrCreateLookupTable(conn, wallet, staticAddrs, join(dataDir, "launch-alt.json"));

  const deps: LaunchDeps = {
    global,
    uploadMetadata: (it) => uploadTokenMetadata(it),
    buildCreateAndBuy: (args) => pumpSdk.createV2AndBuyInstructions({ ...args, mint: args.mint.publicKey } as any),
    buildCreate: async (args) => [await pumpSdk.createV2Instruction({ ...args, mint: args.mint.publicKey, mayhemMode: false } as any)],
    connection: conn as unknown as LaunchDeps["connection"],
    lookupTable,
  };
  const ledger = new Ledger(join(dataDir, "launch-ledger.json"));
  const mintstore = new MintStore(join(dataDir, ".mint-keys"));
  const result = await runBatch(
    [item], ledger, mintstore,
    (mint, it) => launchOne(deps, wallet, mint, it, opts),
    (mintB58) => mintExistsOnChain(conn, new PublicKey(mintB58)),
    indexBatchOpts(cfg, indexDevBuySol),
  );
  const entry = ledger.get(item.id);
  console.log(`Done: ${result.succeeded} launched, ${result.failed} failed.`);
  console.log(`$PUMPTANK mint: ${entry?.mint ?? "(see launch-ledger.json)"}  sig: ${entry?.signature ?? ""}`);
}

function isMainModule(): boolean {
  const entry = processArgv[1];
  if (!entry) return false;
  try { return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isMainModule()) {
  main(process.argv.slice(2), process.env).catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/hank/Documents/git/st/launcher && npx tsc --noEmit`
Expected: no output (clean). If `Ledger.get`/`MintStore.getOrCreate` signatures differ, fix the call to match (read `src/ledger.ts`/`src/mintstore.ts`).

- [ ] **Step 3: Run the full launcher test suite (nothing regressed)**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run`
Expected: PASS (all suites, incl. the 6 new index-launch tests).

- [ ] **Step 4: Commit**

```bash
git -C /home/hank/Documents/git/st add launcher/src/index-launch.ts
git -C /home/hank/Documents/git/st commit -m "feat(launcher): index-launch main() — ALT + runBatch single-item create+buy"
```

---

### Task 4: `launch:index` npm script + offline dry-run smoke

**Files:**
- Modify: `launcher/package.json`

- [ ] **Step 1: Add the script**

In `launcher/package.json`, add to `"scripts"` after the `"launch"` line:
```json
    "launch:index": "tsx src/index-launch.ts",
```

- [ ] **Step 2: Run the dry-run (offline — no broadcast, no network)**

Run:
```bash
cd /home/hank/Documents/git/st/launcher && MAX_TOTAL_SPEND_SOL=5 RPC_URL=http://localhost:8899 npm run launch:index
```
Expected: prints `Would launch index token $PUMPTANK with a 10% dev-buy (cap ~3.50 SOL; ~3.1 SOL actual at genesis) + ~0.02 SOL create rent + priority fee` then `DRY RUN -- no transactions broadcast.` and exits 0. (Dry-run returns before any wallet/SDK/RPC use.)

- [ ] **Step 3: Verify the missing-image guard (dry-run still validates the image path)**

Run:
```bash
cd /home/hank/Documents/git/st/launcher && MAX_TOTAL_SPEND_SOL=5 RPC_URL=http://localhost:8899 npm run launch:index -- --image /no/such.png
```
Expected: throws `index image not found: /no/such.png` (non-zero exit). (Note: the image check is before the dry-run print in `main()`; confirm it fires.)

- [ ] **Step 4: Commit**

```bash
git -C /home/hank/Documents/git/st add launcher/package.json
git -C /home/hank/Documents/git/st commit -m "feat(launcher): add launch:index npm script"
```

---

### Task 5: Devnet `simulate` verification (the safety gate)

**Files:**
- Create: `launcher/scripts/devnet-index-simulate.ts`

**Prerequisites:** a devnet RPC + a funded devnet wallet in `WALLET` (the project's `~/.config/solana/id.json` / `3cYp…`, used for the product-path devnet proof). This proves the 10% create+buy fits one ALT tx and the curve accepts it (`err: null`) before any mainnet spend.

- [ ] **Step 1: Create `launcher/scripts/devnet-index-simulate.ts`**

```ts
import { Connection, Keypair, PublicKey, TransactionMessage, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import BN from "bn.js";
import { createRequire } from "node:module";
import { join } from "node:path";
import { loadWallet } from "../src/wallet.js";
import { computeStaticLutAddresses, loadOrCreateLookupTable } from "../src/alt.js";
import { buildIndexItem, indexLaunchOpts, resolveIndexDevBuySol } from "../src/index-launch.js";

async function run() {
  const env = process.env;
  const conn = new Connection(env.RPC_URL!, "confirmed");
  const wallet = loadWallet(env);
  const { OnlinePumpSdk, PumpSdk } = createRequire(import.meta.url)("@pump-fun/pump-sdk") as typeof import("@pump-fun/pump-sdk");
  const pumpSdk = new PumpSdk();
  const global = await new OnlinePumpSdk(conn).fetchGlobal();
  const opts = indexLaunchOpts(Number(env.SLIPPAGE_BPS ?? "150"), resolveIndexDevBuySol(env), 200_000);
  const item = buildIndexItem("x"); // image not needed for simulate (no metadata upload)
  const mint = Keypair.generate();

  const staticAddrs = await computeStaticLutAddresses((m: Keypair) => pumpSdk.createV2AndBuyInstructions({
    global, mint: m.publicKey, name: item.name, symbol: item.symbol, uri: "https://pump.fun",
    creator: wallet.publicKey, user: wallet.publicKey,
    amount: new BN(opts.devBuyTokens.toString()), solAmount: new BN(opts.solCapLamports.toString()), mayhemMode: false,
  } as any), wallet.publicKey);
  const lut = await loadOrCreateLookupTable(conn, wallet, staticAddrs, join(process.cwd(), "..", "data", "launch-alt.json"));

  const ixs = await pumpSdk.createV2AndBuyInstructions({
    global, mint: mint.publicKey, name: item.name, symbol: item.symbol, uri: "https://pump.fun",
    creator: wallet.publicKey, user: wallet.publicKey,
    amount: new BN(opts.devBuyTokens.toString()), solAmount: new BN(opts.solCapLamports.toString()), mayhemMode: false,
  } as any);
  const { blockhash } = await conn.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: wallet.publicKey, recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), ...ixs],
  }).compileToV0Message([lut]);
  const tx = new VersionedTransaction(msg); tx.sign([wallet, mint]);
  console.log("serialized bytes:", tx.serialize().length);
  const sim = await conn.simulateTransaction(tx, { sigVerify: false });
  console.log("simulate err:", JSON.stringify(sim.value.err));
}
run().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the devnet simulate**

Run:
```bash
cd /home/hank/Documents/git/st/launcher && RPC_URL=https://api.devnet.solana.com WALLET="$(cat ~/.config/solana/id.json)" npx tsx scripts/devnet-index-simulate.ts
```
Expected: `serialized bytes: <≤1232>` and `simulate err: null` (the live devnet program ran the full atomic create_v2 + 10% dev-buy). If `err` is non-null with an insufficient-funds/`max_sol_cost` code, raise `INDEX_DEV_BUY_SOL` and/or fund the devnet wallet. If serialized bytes > 1232, the ALT did not attach — investigate before mainnet.

- [ ] **Step 3: Commit**

```bash
git -C /home/hank/Documents/git/st add launcher/scripts/devnet-index-simulate.ts
git -C /home/hank/Documents/git/st commit -m "test(launcher): devnet simulate harness for the index 10% create+buy"
```

---

### Task 6: Final verification

- [ ] **Step 1: Full typecheck + test suite**

Run: `cd /home/hank/Documents/git/st/launcher && npx tsc --noEmit && npx vitest run`
Expected: tsc clean; all tests PASS.

- [ ] **Step 2: Confirm no product-path regression (mixed/zero dev-buy preview still correct)**

Run: `cd /home/hank/Documents/git/st/launcher && npx vitest run test/cli.test.ts`
Expected: PASS (the product launcher is untouched).

---

## Mainnet operational gate (NOT part of the build — the user's deliberate, gated act)

Before the real index launch (after funding a mainnet wallet):
1. Set `INDEX_DEV_BUY_SOL` (default 3.5) and `MAX_TOTAL_SPEND_SOL` ≥ ~3.6 (else `runBatch` refuses to spend).
2. Run the **mainnet** `simulate` (Task 5 script, `RPC_URL=<mainnet>`) → require `simulate err: null` (devnet `Global` reserves can differ from mainnet). If it reverts on `max_sol_cost`, raise `INDEX_DEV_BUY_SOL`.
3. `npm run launch:index` (dry-run) → review → `npm run launch:index -- --confirm`.
4. Record the printed **$PUMPTANK mint**. THEN run the product batch (`npm run launch --confirm`).

---

## Self-review (against the spec)

- **Spec coverage:** standalone `launch:index` (Tasks 3-4) ✓; pump.fun coin SOL-paired ✓ (reuses `createV2AndBuy`); 10% = 1e14 (Task 2) ✓; launched first + prints mint (Task 3, op gate) ✓; own opts, no product-config inheritance (Task 2 `indexLaunchOpts`/`indexBatchOpts`) ✓; ALT reuse + index creates `launch-alt.json` (Task 3) ✓; PNG metadata path (Task 1) ✓; `runBatch` crash-safety + spend-cap-≥-cap (Task 3 `indexBatchOpts.devBuySol`, op gate) ✓; no fee-sharing config (nothing creates one — fees stay house) ✓; devnet+mainnet `simulate` gate (Task 5, op gate) ✓.
- **Deviation from spec rev 2 (intentional):** cost is NOT computed from `Global` field math (SOL-vs-USDC quote-reserve field/units are ambiguous and a 10% buy magnifies the risk). Instead `INDEX_DEV_BUY_SOL` is the `max_sol_cost` ceiling (over-estimating never overspends) and the real-curve `simulate` gate is the safety check — same intent, lower risk.
- **Placeholders:** none — every step has concrete code/commands/expected output.
- **Type consistency:** `LaunchOpts` {devBuyTokens, solCapLamports, priorityFeeMicroLamports}, `BatchOpts` {devBuySol, slippageBps, priorityFeeMicroLamports, pacingMs, maxTotalSpendSol, maxRetriesPerToken}, and `LaunchDeps` match `launch.ts`/`orchestrate.ts` as read.
