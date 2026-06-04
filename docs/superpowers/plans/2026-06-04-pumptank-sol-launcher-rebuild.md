# PUMPTANK SOL Launcher Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `launcher/` to launch SOL-paired pump.fun coins via the current official `@pump-fun/pump-sdk` `create_v2` + atomic dev-buy, replacing the dead `pumpdotfun-repumped-sdk@1.4.2` (which emits the broken legacy `create`).

**Architecture:** Surgical migration. The old launcher was already SOL-based, so the crash-safe ledger / orchestration / recovery / wallet / products modules are preserved unchanged. We swap the SDK, rewrite the create+buy call to `createV2AndBuyInstructions` (assembled into one tx we sign+send), add IPFS metadata upload, and pin the dev-buy to token base units. SOL fits one legacy tx — no Address Lookup Table.

**Tech Stack:** TypeScript (ESM, `tsx`/`tsc`), `@pump-fun/pump-sdk@^1.36.0`, `@solana/web3.js@^1.98`, `@solana/spl-token@^0.4`, `@coral-xyz/anchor@^0.31`, `bn.js`, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-pumptank-sol-launcher-rebuild-design.md`. Work dir: `launcher/` (run all commands from there). Guardrails preserved: one wallet, one atomic tx, 1.5% dev-buy, dry-run default + `--confirm`, spend cap, crash-safe ledger.

---

## File Structure

- `launcher/src/metadata.ts` (NEW) — `uploadTokenMetadata(item, fetchImpl?)`: upload image+text to pump.fun IPFS, return the metadata `uri`. One responsibility: metadata → uri.
- `launcher/src/launch.ts` (REWRITE) — `launchOne(deps, wallet, mint, item, opts)`: build `create_v2`+dev-buy instructions, assemble one tx, sign `[wallet, mint]`, send, confirm. SDK injected structurally for tests.
- `launcher/src/config.ts` (MODIFY) — add `DEV_BUY_TOKENS`; keep `devBuySol` as the per-token SOL budget/cap + estimate.
- `launcher/src/cli.ts` (MODIFY) — swap SDK init (`PumpFunSDK` → `OnlinePumpSdk`+`PumpSdk`), wire `launchOne` deps + metadata, widen the funding buffer for Token-2022 rent.
- `launcher/package.json` (MODIFY) — drop dead SDK, add official SDK + spl-token + bn.js, bump anchor/web3.
- `launcher/src/types.ts` (MODIFY) — add `devBuyTokens` to `Config`.
- Tests: `launcher/test/{metadata,launch,config,cli}.test.ts`.
- UNCHANGED: `ledger.ts`, `mintstore.ts`, `recover.ts` (owner-agnostic existence check works for Token-2022), `orchestrate.ts`, `wallet.ts`, `products.ts`, and all fee modules (`collect/feeconfig/feescli.ts` — sub-project B).

Conventions: `npm test` = `vitest run`; `npm run build` = `tsc`. ESM (`.js` import suffixes). Commit per task.

---

### Task 1: `metadata.ts` — IPFS metadata upload

**Files:**
- Create: `launcher/src/metadata.ts`
- Test: `launcher/test/metadata.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// launcher/test/metadata.test.ts
import { expect, test, vi } from "vitest";
import { uploadTokenMetadata } from "../src/metadata.js";

const item = { id: "a", name: "Acme", symbol: "ACME", description: "no deal", imagePath: __filename };

test("posts multipart to the pump.fun IPFS endpoint and returns metadataUri", async () => {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ metadataUri: "https://ipfs.io/ipfs/CID" }),
  });
  const uri = await uploadTokenMetadata(item, fetchImpl as any);
  expect(uri).toBe("https://ipfs.io/ipfs/CID");
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://pump.fun/api/ipfs");
  expect(init.method).toBe("POST");
  expect(init.body).toBeInstanceOf(FormData);
});

test("throws on a non-OK response", async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" });
  await expect(uploadTokenMetadata(item, fetchImpl as any)).rejects.toThrow(/ipfs upload failed: 503/i);
});

test("throws if the returned uri exceeds 200 chars", async () => {
  const long = "https://ipfs.io/ipfs/" + "x".repeat(200);
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ metadataUri: long }) });
  await expect(uploadTokenMetadata(item, fetchImpl as any)).rejects.toThrow(/uri too long/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/metadata.test.ts`
Expected: FAIL — cannot find module `../src/metadata.js`.

- [ ] **Step 3: Implement `launcher/src/metadata.ts`**

```ts
import { readFileSync } from "node:fs";
import type { LaunchItem } from "./types.js";

const PUMP_IPFS_URL = "https://pump.fun/api/ipfs";

/**
 * Upload a token's image + text metadata to pump.fun's IPFS endpoint and return
 * the metadata `uri` that create_v2 needs (must be <= 200 chars). `fetchImpl` is
 * injectable for tests; defaults to global fetch.
 */
export async function uploadTokenMetadata(
  item: LaunchItem,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const img = readFileSync(item.imagePath);
  const form = new FormData();
  form.append("file", new Blob([img], { type: "image/png" }), `${item.symbol}.png`);
  form.append("name", item.name);
  form.append("symbol", item.symbol);
  form.append("description", item.description);
  form.append("showName", "true");
  const res = await fetchImpl(PUMP_IPFS_URL, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`IPFS upload failed: ${res.status} ${body}`);
  }
  const json: any = await res.json();
  const uri: string | undefined = json.metadataUri ?? json.metadata?.uri ?? json.uri;
  if (!uri) throw new Error(`IPFS upload returned no metadataUri: ${JSON.stringify(json).slice(0, 200)}`);
  if (uri.length > 200) throw new Error(`metadata uri too long (${uri.length} > 200): ${uri}`);
  return uri;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/metadata.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/metadata.ts test/metadata.test.ts
git commit -m "feat(launcher): add pump.fun IPFS metadata upload"
```

---

### Task 2: `config.ts` + `types.ts` — token-pinned dev-buy

**Files:**
- Modify: `launcher/src/config.ts`, `launcher/src/types.ts`
- Test: `launcher/test/config.test.ts`

- [ ] **Step 1: Add the failing test** (append to `launcher/test/config.test.ts`)

```ts
test("exposes the token-pinned dev-buy amount (1.5% of supply)", () => {
  const c = buildConfig([], base);
  expect(c.devBuyTokens).toBe(15_000_000_000_000n); // 1.5% of 1e15 (Token-2022, 6dp)
  expect(c.devBuySol).toBeCloseTo(0.4306); // SOL budget/cap estimate per token
});
```
(Reuse the existing `base`/imports already at the top of the file.)

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL — `c.devBuyTokens` is `undefined`.

- [ ] **Step 3: Implement**

In `launcher/src/config.ts`, add the constant (below `DEFAULT_DEV_BUY_SOL`):
```ts
export const DEV_BUY_TOKENS = 15_000_000_000_000n; // 1.5% of 1e15 total supply (Token-2022, 6 decimals)
```
and add to the returned object in `buildConfig` (after `devBuySol`):
```ts
    devBuyTokens: DEV_BUY_TOKENS,
```
In `launcher/src/types.ts`, add to the `Config` interface (after `devBuySol: number;`):
```ts
  devBuyTokens: bigint;   // token base units to buy per coin (1.5% of supply)
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/config.test.ts`
Expected: PASS (all config tests, incl. the new one).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/types.ts test/config.test.ts
git commit -m "feat(launcher): pin dev-buy to token base units (1.5%)"
```

---

### Task 3: `launch.ts` — create_v2 + atomic dev-buy via instructions

**Files:**
- Modify (rewrite): `launcher/src/launch.ts`
- Test (rewrite): `launcher/test/launch.test.ts`

The SDK builder, connection, global, and metadata uploader are injected via a `LaunchDeps` object (structural types — no real `@pump-fun/pump-sdk` import here, so this task needs no dep changes and stays unit-testable offline).

- [ ] **Step 1: Rewrite the test**

```ts
// launcher/test/launch.test.ts
import { expect, test, vi } from "vitest";
import {
  Keypair, PublicKey, SystemProgram, TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import { launchOne, type LaunchDeps } from "../src/launch.js";

function mockDeps(over: Partial<LaunchDeps> = {}) {
  const sent: Uint8Array[] = [];
  const deps: LaunchDeps = {
    global: { tag: "GLOBAL" },
    uploadMetadata: vi.fn().mockResolvedValue("https://ipfs.io/ipfs/CID"),
    buildCreateAndBuy: vi.fn(async ({ mint, user }) => [
      // an instruction that requires BOTH user and mint as signers, so the
      // compiled tx needs the [wallet, mint] signatures launchOne provides.
      new TransactionInstruction({
        programId: SystemProgram.programId,
        keys: [
          { pubkey: user, isSigner: true, isWritable: true },
          { pubkey: mint.publicKey, isSigner: true, isWritable: true },
        ],
        data: Buffer.alloc(0),
      }),
    ]),
    connection: {
      getLatestBlockhash: vi.fn().mockResolvedValue({ blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 }),
      sendRawTransaction: vi.fn(async (b: Uint8Array) => { sent.push(b); return "SIG"; }),
      confirmTransaction: vi.fn().mockResolvedValue({}),
    },
    ...over,
  };
  return { deps, sent };
}

const item = { id: "a", name: "Acme", symbol: "ACME", description: "d", imagePath: __filename };
const opts = { devBuyTokens: 15_000_000_000_000n, solCapLamports: 437000000n, priorityFeeMicroLamports: 200000 };

test("uploads metadata, builds create_v2+buy with token amount + SOL cap (native), sends one tx", async () => {
  const { deps, sent } = mockDeps();
  const wallet = Keypair.generate();
  const mint = Keypair.generate();
  const res = await launchOne(deps, wallet, mint, item, opts);
  expect(res).toEqual({ mint: mint.publicKey.toBase58(), signature: "SIG" });
  expect(deps.uploadMetadata).toHaveBeenCalledWith(item);
  const args = (deps.buildCreateAndBuy as any).mock.calls[0][0];
  expect(args.uri).toBe("https://ipfs.io/ipfs/CID");
  expect(args.amount.toString()).toBe("15000000000000"); // token base units
  expect(args.solAmount.toString()).toBe("437000000");    // SOL cap (lamports)
  expect(args.mayhemMode).toBe(false);
  expect("quoteMint" in args).toBe(false);                 // native/SOL
  expect(args.creator.equals(wallet.publicKey)).toBe(true);
  expect(sent.length).toBe(1);                             // exactly one tx broadcast
});

test("propagates a build error", async () => {
  const { deps } = mockDeps({ buildCreateAndBuy: vi.fn().mockRejectedValue(new Error("boom")) });
  await expect(launchOne(deps, Keypair.generate(), Keypair.generate(), item, opts)).rejects.toThrow(/boom/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/launch.test.ts`
Expected: FAIL — `launchOne`/`LaunchDeps` new shape not defined (old export mismatch).

- [ ] **Step 3: Rewrite `launcher/src/launch.ts`**

```ts
import {
  ComputeBudgetProgram, Keypair, PublicKey, TransactionInstruction,
  TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import type { LaunchItem } from "./types.js";

export interface LaunchOpts {
  devBuyTokens: bigint;   // token base units to buy (1.5% of supply)
  solCapLamports: bigint; // max SOL cost (cap)
  priorityFeeMicroLamports: number;
}

/** Args passed to the SDK's createV2AndBuyInstructions (SOL/native: no quoteMint). */
export interface CreateAndBuyArgs {
  global: unknown;
  mint: Keypair;
  name: string;
  symbol: string;
  uri: string;
  creator: PublicKey;
  user: PublicKey;
  amount: BN;
  solAmount: BN;
  mayhemMode: boolean;
}

/** Injected dependencies so launchOne is unit-testable offline. */
export interface LaunchDeps {
  global: unknown;
  uploadMetadata(item: LaunchItem): Promise<string>;
  buildCreateAndBuy(args: CreateAndBuyArgs): Promise<TransactionInstruction[]>;
  connection: {
    getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }>;
    sendRawTransaction(raw: Uint8Array): Promise<string>;
    confirmTransaction(
      strategy: { signature: string; blockhash: string; lastValidBlockHeight: number },
      commitment: string,
    ): Promise<unknown>;
  };
}

export async function launchOne(
  deps: LaunchDeps, wallet: Keypair, mint: Keypair, item: LaunchItem, opts: LaunchOpts,
): Promise<{ mint: string; signature: string }> {
  const uri = await deps.uploadMetadata(item);
  const ixs = await deps.buildCreateAndBuy({
    global: deps.global,
    mint,
    name: item.name,
    symbol: item.symbol,
    uri,
    creator: wallet.publicKey,
    user: wallet.publicKey,
    amount: new BN(opts.devBuyTokens.toString()),
    solAmount: new BN(opts.solCapLamports.toString()),
    mayhemMode: false,
  });
  const { blockhash, lastValidBlockHeight } = await deps.connection.getLatestBlockhash();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: opts.priorityFeeMicroLamports }),
      ...ixs,
    ],
  }).compileToV0Message();
  const tx = new VersionedTransaction(message);
  tx.sign([wallet, mint]);
  const signature = await deps.connection.sendRawTransaction(tx.serialize());
  await deps.connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { mint: mint.publicKey.toBase58(), signature };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/launch.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/launch.ts test/launch.test.ts
git commit -m "feat(launcher): build create_v2 + atomic dev-buy via instructions (one tx, one wallet)"
```

---

### Task 4: deps swap + `cli.ts` wiring

**Files:**
- Modify: `launcher/package.json`, `launcher/src/cli.ts`
- Test: `launcher/test/cli.test.ts`

- [ ] **Step 1: Swap dependencies**

Edit `launcher/package.json` `dependencies` to:
```json
  "dependencies": {
    "@coral-xyz/anchor": "^0.31.1",
    "@pump-fun/pump-sdk": "^1.36.0",
    "@solana/spl-token": "^0.4.13",
    "@solana/web3.js": "^1.98.2",
    "bn.js": "^5.2.1",
    "bs58": "^6.0.0"
  }
```
and add to `devDependencies`: `"@types/bn.js": "^5.1.5"`. Then:
Run: `npm install`
Expected: installs cleanly; `pumpdotfun-repumped-sdk` removed.

- [ ] **Step 2: Update the failing cli test** (append to `launcher/test/cli.test.ts`)

```ts
import { Keypair } from "@solana/web3.js";
test("preview reports token count + SOL estimate", () => {
  const items = [{ id: "a", name: "A", symbol: "A", description: "d", imagePath: "x" }];
  const { totalSol, line } = preview(items as any, { devBuySol: 0.4306 } as any);
  expect(totalSol).toBeCloseTo(0.4306);
  expect(line).toMatch(/1 tokens/);
});
```
(Keep the existing cli.test.ts content; this just confirms `preview` still works after the wiring change. If the existing test already covers `preview`, skip duplicating.)

- [ ] **Step 3: Run to verify current state**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL to import — `cli.ts` still imports the removed `pumpdotfun-repumped-sdk`.

- [ ] **Step 4: Rewrite the SDK wiring in `launcher/src/cli.ts`**

Replace the import line 3 (`import { PumpFunSDK } from "pumpdotfun-repumped-sdk";`) with:
```ts
import { OnlinePumpSdk, PumpSdk } from "@pump-fun/pump-sdk";
```
Remove the now-unused `AnchorProvider, Wallet` import (line 2) if nothing else uses them (check; `cli.ts` only used them to build `PumpFunSDK`). Add to the imports:
```ts
import { uploadTokenMetadata } from "./metadata.js";
import type { LaunchDeps } from "./launch.js";
```
Replace the SDK construction + launch wiring (current lines 41-53). New body for that section of `main`:
```ts
  const required = items.length * cfg.devBuySol * 1.08 + items.length * 0.015; // dev-buys + ~rent/fee buffer
  if (!(await hasSufficientBalance(conn, wallet.publicKey, required))) {
    throw new Error(`wallet balance below required ~${required.toFixed(2)} SOL`);
  }
  const onlineSdk = new OnlinePumpSdk(conn);
  const pumpSdk = new PumpSdk();
  const global = await onlineSdk.fetchGlobal();
  const solCapLamports = BigInt(Math.ceil(cfg.devBuySol * (1 + cfg.slippageBps / 10_000) * 1e9));
  const deps: LaunchDeps = {
    global,
    uploadMetadata: (item) => uploadTokenMetadata(item),
    buildCreateAndBuy: (args) => pumpSdk.createV2AndBuyInstructions(args as any),
    connection: conn,
  };
  const ledger = new Ledger(join(dataDir, "launch-ledger.json"));
  const mintstore = new MintStore(join(dataDir, ".mint-keys"));
  const result = await runBatch(
    items, ledger, mintstore,
    (mint, item) => launchOne(deps, wallet, mint, item, {
      devBuyTokens: cfg.devBuyTokens,
      solCapLamports,
      priorityFeeMicroLamports: cfg.priorityFeeMicroLamports,
    }),
    (mintB58) => mintExistsOnChain(conn, new PublicKey(mintB58)),
    cfg,
  );
```
Notes for the implementer: confirm against the installed `@pump-fun/pump-sdk@1.36.0` that `PumpSdk.createV2AndBuyInstructions` exists and takes `{ global, mint, name, symbol, uri, creator, user, amount, solAmount, mayhemMode }` (it does — verified in the spec). If `OnlinePumpSdk` exposes its own `createV2AndBuyInstructions` that fetches `global` internally, you MAY use that instead and drop the explicit `fetchGlobal`/`PumpSdk`; either is fine as long as the `launchOne` deps contract holds and the SOL path (no `quoteMint`) is used. `Connection` satisfies the structural `LaunchDeps.connection` type.

- [ ] **Step 5: Run tests + typecheck**

Run: `npx vitest run && npm run build`
Expected: all launcher suites PASS; `tsc` clean (no reference to the removed SDK).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/cli.ts test/cli.test.ts
git commit -m "feat(launcher): adopt @pump-fun/pump-sdk; wire create_v2 dev-buy + metadata"
```

---

### Task 5: full verification + dry-run

**Files:** none (verification).

- [ ] **Step 1: Confirm `recover.ts` works for Token-2022**

Read `src/recover.ts`: `mintExistsOnChain` returns `getAccountInfo(mint) !== null` — owner-agnostic, so it detects a Token-2022 mint just as well. No change needed. Run: `npx vitest run test/recover.test.ts` → PASS.

- [ ] **Step 2: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: ALL launcher suites green (incl. the untouched fee/ledger/orchestrate tests); `tsc` clean.

- [ ] **Step 3: Dry-run on the real dataset (no broadcast, no SDK calls beyond preview)**

Run: `MAX_TOTAL_SPEND_SOL=45 RPC_URL=https://api.mainnet-beta.solana.com npm run launch -- --limit 3`
Expected: prints "Would launch 3 tokens; dev-buys ~= 1.29 SOL ..." then "DRY RUN -- no transactions broadcast." and exits 0 (dry-run returns before any wallet/SDK use).

- [ ] **Step 4: Commit any doc/verification note (if changed); otherwise no-op**

```bash
git commit --allow-empty -m "chore(launcher): SOL create_v2 rebuild verified (dry-run, build, suite green)"
```

---

## Self-Review

- **Spec coverage:** SDK swap → T4; metadata/IPFS → T1; create_v2+dev-buy one-tx → T3; token-pinned dev-buy → T2; funding buffer + SDK init → T4; recover Token-2022 → T5; tests/dry-run → T1-T5. Fee routing (B) + website (C) explicitly out of scope. ✔
- **Placeholder scan:** every step has real code/commands. The one judgment call (OnlinePumpSdk vs PumpSdk for create+buy) is stated with both concrete options + the verified default. No TBDs.
- **Type consistency:** `devBuyTokens: bigint` (config/types/opts), `LaunchDeps`/`CreateAndBuyArgs` (launch.ts) consumed identically in cli.ts; `solCapLamports: bigint`; `amount`/`solAmount` are `BN` in the SDK call; preview/spend-cap keep `devBuySol: number`. Consistent across tasks.
