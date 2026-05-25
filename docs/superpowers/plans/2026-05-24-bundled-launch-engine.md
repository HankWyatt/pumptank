# Launch Engine (one-shot pump.fun launcher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A one-shot TypeScript launcher (`launcher/`) that creates the 100 selected pump.fun tokens — atomic create + dev-buy per token from one wallet — crash-safely and behind hard safety gates, recording each mint.

**Architecture:** Small focused modules (config, products, ledger, mintstore, wallet, launch, recover, orchestrate, cli) over `pumpdotfun-repumped-sdk` + `@solana/web3.js`. **Default is dry-run** (no broadcast); broadcasting requires `--confirm`. A write-ahead `attempting` ledger + persisted per-id mint + on-chain recovery check make a crash mid-run impossible to double-launch. All unit tests mock the chain/SDK — nothing in CI ever broadcasts or spends.

**Tech Stack:** Node 18+ (global `fetch`/`Blob`), TypeScript (ESM), `pumpdotfun-repumped-sdk`, `@solana/web3.js`, `@coral-xyz/anchor`, `bs58`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-05-24-bundled-launch-engine-design.md`

**Guardrail:** ONE creator wallet, one tx per token, **no Jito/multi-wallet bundling**. Real spend is gated on `--confirm` + the legal/go-no-go review — building & testing this plan spends nothing.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `launcher/package.json`, `tsconfig.json`, `vitest.config.ts` | ESM TS project + pinned deps + test runner |
| `launcher/src/types.ts` | `LaunchItem`, `LedgerEntry`, `Config` types |
| `launcher/src/config.ts` | parse env+flags → validated `Config` (slippage cap, max-spend required, confirm gate) |
| `launcher/src/products.ts` | load `data/products.json` → `LaunchItem[]`; validate unique id/symbol + image exists |
| `launcher/src/ledger.ts` | read/write `data/launch-ledger.json` (fsync); `statusOf`, `record` |
| `launcher/src/mintstore.ts` | generate/persist/reload per-id mint `Keypair` in git-ignored `data/.mint-keys/` |
| `launcher/src/wallet.ts` | load creator `Keypair` from env; balance lookup |
| `launcher/src/launch.ts` | `launchOne` → `sdk.trade.createAndBuy` (bigint buy, pinned slippage) |
| `launcher/src/recover.ts` | on-chain existence check for an `attempting` mint |
| `launcher/src/orchestrate.ts` | the batch: preview, precheck, recover, write-ahead, launch, caps, pacing |
| `launcher/src/cli.ts` | arg parsing + gates; entrypoint |
| `launcher/test/*.test.ts` | vitest unit tests (chain/SDK mocked) |
| `.gitignore` | add `launcher/node_modules`, `launcher/dist`, `data/.mint-keys/`, `*.key`, `.env` |

---

### Task 1: Scaffold the `launcher/` project

**Files:** Create `launcher/package.json`, `launcher/tsconfig.json`, `launcher/vitest.config.ts`, `launcher/src/types.ts`, `launcher/test/smoke.test.ts`; modify root `.gitignore`.

- [ ] **Step 1: Create `launcher/package.json`**

```json
{
  "name": "pumptank-launcher",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "launch": "tsx src/cli.ts"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.30.1",
    "@solana/web3.js": "^1.95.3",
    "bs58": "^6.0.0",
    "pumpdotfun-repumped-sdk": "^1.4.2"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `launcher/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Create `launcher/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 4: Create `launcher/src/types.ts`**

```typescript
export interface LaunchItem {
  id: string;
  name: string;
  symbol: string;
  description: string;
  imagePath: string; // absolute path to the card PNG
}

export type LaunchStatus = "attempting" | "success" | "failed";

export interface LedgerEntry {
  id: string;
  mint: string;          // base58 pubkey (never a secret)
  signature?: string;
  status: LaunchStatus;
  error?: string;
  attempts: number;
  ts: string;
}

export interface Config {
  rpcUrl: string;
  devBuySol: number;
  slippageBps: number;
  priorityFeeMicroLamports: number;
  pacingMs: number;
  maxTotalSpendSol: number;
  maxRetriesPerToken: number;
  confirm: boolean;     // false => dry-run, never broadcast
  only?: string;
  limit?: number;
}
```

- [ ] **Step 5: Create `launcher/test/smoke.test.ts`**

```typescript
import { expect, test } from "vitest";
import type { LaunchItem } from "../src/types.js";

test("types module imports", () => {
  const item: LaunchItem = { id: "x", name: "X", symbol: "X", description: "d", imagePath: "/x.png" };
  expect(item.symbol).toBe("X");
});
```

- [ ] **Step 6: Update root `.gitignore`** — append:

```
launcher/node_modules/
launcher/dist/
data/.mint-keys/
*.key
.env
```

- [ ] **Step 7: Install + run**

Run: `cd launcher && npm install && npm test`
Expected: deps install; `1 passed`.

- [ ] **Step 8: Commit**

```bash
git add launcher/package.json launcher/package-lock.json launcher/tsconfig.json launcher/vitest.config.ts launcher/src/types.ts launcher/test/smoke.test.ts .gitignore
git commit -m "feat(launcher): scaffold TypeScript launch-engine project"
```

---

### Task 2: `config.ts` — parse + validate flags/env

**Files:** Create `launcher/src/config.ts`, `launcher/test/config.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test } from "vitest";
import { buildConfig, SLIPPAGE_BPS_CAP } from "../src/config.js";

const base = { RPC_URL: "https://rpc", MAX_TOTAL_SPEND_SOL: "45" };

test("defaults to dry-run (no confirm)", () => {
  const c = buildConfig([], base);
  expect(c.confirm).toBe(false);
  expect(c.devBuySol).toBeCloseTo(0.4306);
});

test("--confirm enables broadcast", () => {
  expect(buildConfig(["--confirm"], base).confirm).toBe(true);
});

test("rejects slippage over the cap", () => {
  expect(() => buildConfig([], { ...base, SLIPPAGE_BPS: String(SLIPPAGE_BPS_CAP + 1) }))
    .toThrow(/slippage/i);
});

test("requires MAX_TOTAL_SPEND_SOL", () => {
  expect(() => buildConfig([], { RPC_URL: "https://rpc" })).toThrow(/MAX_TOTAL_SPEND_SOL/);
});

test("parses --only and --limit", () => {
  const c = buildConfig(["--only", "s5e9p1-x", "--limit", "3"], base);
  expect(c.only).toBe("s5e9p1-x");
  expect(c.limit).toBe(3);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd launcher && npx vitest run test/config.test.ts`
Expected: FAIL (cannot find `../src/config.js`)

- [ ] **Step 3: Implement `launcher/src/config.ts`**

```typescript
import type { Config } from "./types.js";

export const SLIPPAGE_BPS_CAP = 300;        // hard upper bound (3%)
export const DEFAULT_DEV_BUY_SOL = 0.4306;  // ~1.5% of total supply at opening curve

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function buildConfig(argv: string[], env: Record<string, string | undefined>): Config {
  if (!env.MAX_TOTAL_SPEND_SOL) throw new Error("MAX_TOTAL_SPEND_SOL env var is required");
  if (!env.RPC_URL) throw new Error("RPC_URL env var is required");
  const slippageBps = Number(env.SLIPPAGE_BPS ?? "150");
  if (!Number.isFinite(slippageBps) || slippageBps <= 0 || slippageBps > SLIPPAGE_BPS_CAP) {
    throw new Error(`slippage ${slippageBps} bps outside (0, ${SLIPPAGE_BPS_CAP}]`);
  }
  const limit = flag(argv, "--limit");
  return {
    rpcUrl: env.RPC_URL,
    devBuySol: Number(env.DEV_BUY_SOL ?? DEFAULT_DEV_BUY_SOL),
    slippageBps,
    priorityFeeMicroLamports: Number(env.PRIORITY_FEE ?? "200000"),
    pacingMs: Number(env.PACING_MS ?? "1500"),
    maxTotalSpendSol: Number(env.MAX_TOTAL_SPEND_SOL),
    maxRetriesPerToken: Number(env.MAX_RETRIES ?? "2"),
    confirm: argv.includes("--confirm"),
    only: flag(argv, "--only"),
    limit: limit === undefined ? undefined : Number(limit),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd launcher && npx vitest run test/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add launcher/src/config.ts launcher/test/config.test.ts
git commit -m "feat(launcher): config parsing with slippage cap and confirm gate"
```

---

### Task 3: `products.ts` — load + validate the launch items

**Files:** Create `launcher/src/products.ts`, `launcher/test/products.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test } from "vitest";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLaunchItems } from "../src/products.js";

function fixture(records: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "prod-"));
  mkdirSync(join(dir, "token_images"));
  writeFileSync(join(dir, "token_images", "a.png"), "png");
  writeFileSync(join(dir, "products.json"), JSON.stringify(records));
  return dir;
}
const rec = (over: object = {}) => ({
  id: "s5e9p1-a", include: true,
  token: { name: "Acme", symbol: "ACME", description: "d", mint: null },
  media: { image_url: "token_images/a.png" }, ...over,
});

test("loads only included records as items", () => {
  const dir = fixture([rec(), rec({ include: false, id: "s5e9p2-b" })]);
  const items = loadLaunchItems(dir);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ id: "s5e9p1-a", symbol: "ACME" });
  expect(items[0].imagePath).toBe(join(dir, "token_images", "a.png"));
});

test("fails on duplicate id", () => {
  const dir = fixture([rec(), rec({ token: { name: "B", symbol: "B", description: "d", mint: null } })]);
  expect(() => loadLaunchItems(dir)).toThrow(/duplicate id/i);
});

test("fails on duplicate symbol", () => {
  const dir = fixture([rec(), rec({ id: "s5e9p2-b" })]);
  expect(() => loadLaunchItems(dir)).toThrow(/duplicate symbol/i);
});

test("fails on missing image file", () => {
  const dir = fixture([rec({ media: { image_url: "token_images/missing.png" } })]);
  expect(() => loadLaunchItems(dir)).toThrow(/image/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd launcher && npx vitest run test/products.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/products.ts`**

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LaunchItem } from "./types.js";

interface Record_ {
  id: string;
  include: boolean;
  token: { name: string; symbol: string; description: string } | null;
  media: { image_url: string | null };
}

export function loadLaunchItems(dataDir: string): LaunchItem[] {
  const records = JSON.parse(readFileSync(join(dataDir, "products.json"), "utf8")) as Record_[];
  const items: LaunchItem[] = [];
  const ids = new Set<string>();
  const symbols = new Set<string>();
  for (const r of records) {
    if (!r.include) continue;
    if (!r.token) throw new Error(`included record ${r.id} has no token`);
    if (ids.has(r.id)) throw new Error(`duplicate id: ${r.id}`);
    if (symbols.has(r.token.symbol)) throw new Error(`duplicate symbol: ${r.token.symbol}`);
    if (!r.media.image_url) throw new Error(`record ${r.id} has no image_url`);
    const imagePath = join(dataDir, r.media.image_url);
    if (!existsSync(imagePath)) throw new Error(`missing image file: ${imagePath}`);
    ids.add(r.id);
    symbols.add(r.token.symbol);
    items.push({ id: r.id, name: r.token.name, symbol: r.token.symbol, description: r.token.description, imagePath });
  }
  return items;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd launcher && npx vitest run test/products.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add launcher/src/products.ts launcher/test/products.test.ts
git commit -m "feat(launcher): load+validate launch items from products.json"
```

---

### Task 4: `ledger.ts` — durable status ledger

**Files:** Create `launcher/src/ledger.ts`, `launcher/test/ledger.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Ledger } from "../src/ledger.js";

const path = () => join(mkdtempSync(join(tmpdir(), "led-")), "launch-ledger.json");

test("records and reads back; statusOf reflects last write", () => {
  const p = path();
  const l = new Ledger(p);
  l.record({ id: "a", mint: "M", status: "attempting", attempts: 1, ts: "t" });
  expect(l.statusOf("a")).toBe("attempting");
  l.record({ id: "a", mint: "M", signature: "S", status: "success", attempts: 1, ts: "t" });
  expect(l.statusOf("a")).toBe("success");
  expect(new Ledger(p).statusOf("a")).toBe("success"); // persisted
});

test("statusOf is undefined for unknown id", () => {
  expect(new Ledger(path()).statusOf("nope")).toBeUndefined();
});

test("never stores a secret-looking field", () => {
  const p = path();
  const l = new Ledger(p);
  l.record({ id: "a", mint: "M", status: "success", attempts: 1, ts: "t" });
  const raw = JSON.stringify(JSON.parse(require("node:fs").readFileSync(p, "utf8")));
  expect(raw).not.toMatch(/secret|privateKey|secretKey/i);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd launcher && npx vitest run test/ledger.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/ledger.ts`**

```typescript
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, writeFileSync, writeSync } from "node:fs";
import type { LaunchStatus, LedgerEntry } from "./types.js";

export class Ledger {
  private data: Record<string, LedgerEntry> = {};
  constructor(private path: string) {
    if (existsSync(path)) this.data = JSON.parse(readFileSync(path, "utf8"));
  }
  statusOf(id: string): LaunchStatus | undefined {
    return this.data[id]?.status;
  }
  get(id: string): LedgerEntry | undefined {
    return this.data[id];
  }
  record(entry: LedgerEntry): void {
    this.data[entry.id] = entry;
    const fd = openSync(this.path, "w");
    try {
      writeSync(fd, JSON.stringify(this.data, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd launcher && npx vitest run test/ledger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add launcher/src/ledger.ts launcher/test/ledger.test.ts
git commit -m "feat(launcher): durable fsync'd launch ledger"
```

---

### Task 5: `mintstore.ts` — persisted per-id mint keypair

**Files:** Create `launcher/src/mintstore.ts`, `launcher/test/mintstore.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MintStore } from "../src/mintstore.js";

const dir = () => mkdtempSync(join(tmpdir(), "mint-"));

test("returns a stable keypair per id (same pubkey on reload)", () => {
  const d = dir();
  const kp1 = new MintStore(d).getOrCreate("a");
  const kp2 = new MintStore(d).getOrCreate("a"); // fresh instance reloads from disk
  expect(kp2.publicKey.toBase58()).toBe(kp1.publicKey.toBase58());
});

test("different ids get different mints", () => {
  const d = dir();
  const s = new MintStore(d);
  expect(s.getOrCreate("a").publicKey.toBase58()).not.toBe(s.getOrCreate("b").publicKey.toBase58());
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd launcher && npx vitest run test/mintstore.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/mintstore.ts`**

```typescript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair } from "@solana/web3.js";

// Persists per-id mint secret keys to a git-ignored dir so a retry reuses the
// SAME mint (a duplicate create is rejected on-chain -> never a second token).
export class MintStore {
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
  }
  getOrCreate(id: string): Keypair {
    const path = join(this.dir, `${id}.json`);
    if (existsSync(path)) {
      return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(path, "utf8"))));
    }
    const kp = Keypair.generate();
    writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)));
    return kp;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd launcher && npx vitest run test/mintstore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add launcher/src/mintstore.ts launcher/test/mintstore.test.ts
git commit -m "feat(launcher): persisted per-id mint keystore for safe retries"
```

---

### Task 6: `wallet.ts` — load the creator keypair + balance

**Files:** Create `launcher/src/wallet.ts`, `launcher/test/wallet.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test } from "vitest";
import { Keypair } from "@solana/web3.js";
import { loadWallet, hasSufficientBalance } from "../src/wallet.js";

test("loads a keypair from a JSON secret-array env", () => {
  const kp = Keypair.generate();
  const env = { WALLET: JSON.stringify(Array.from(kp.secretKey)) };
  expect(loadWallet(env).publicKey.toBase58()).toBe(kp.publicKey.toBase58());
});

test("throws when WALLET is missing", () => {
  expect(() => loadWallet({})).toThrow(/WALLET/);
});

test("balance check compares lamports to required SOL", async () => {
  const conn = { getBalance: async () => 50 * 1e9 } as any;
  expect(await hasSufficientBalance(conn, Keypair.generate().publicKey, 45)).toBe(true);
  expect(await hasSufficientBalance(conn, Keypair.generate().publicKey, 60)).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd launcher && npx vitest run test/wallet.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/wallet.ts`**

```typescript
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

export function loadWallet(env: Record<string, string | undefined>): Keypair {
  if (!env.WALLET) throw new Error("WALLET env var (JSON secret-key array) is required");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.WALLET)));
}

export async function hasSufficientBalance(
  conn: Connection, pubkey: PublicKey, requiredSol: number,
): Promise<boolean> {
  const lamports = await conn.getBalance(pubkey);
  return lamports >= requiredSol * LAMPORTS_PER_SOL;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd launcher && npx vitest run test/wallet.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add launcher/src/wallet.ts launcher/test/wallet.test.ts
git commit -m "feat(launcher): creator wallet loading + balance precheck"
```

---

### Task 7: `launch.ts` — the single-token create+dev-buy (SDK wrapper)

**Files:** Create `launcher/src/launch.ts`, `launcher/test/launch.test.ts`

**Context:** Thin wrapper over `sdk.trade.createAndBuy`. The SDK is injected (an object with `.trade.createAndBuy`) so the unit test mocks it — **no real chain call**. The buy amount MUST be a `bigint`. **Verify the real signature against `node_modules/pumpdotfun-repumped-sdk` types when wiring the real SDK in Task 9/CLI**; `tsc` must pass.

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test, vi } from "vitest";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { launchOne, devBuyLamports } from "../src/launch.js";

test("devBuyLamports returns a bigint", () => {
  const v = devBuyLamports(0.4306);
  expect(typeof v).toBe("bigint");
  expect(v).toBe(BigInt(Math.round(0.4306 * LAMPORTS_PER_SOL)));
});

test("launchOne calls createAndBuy with bigint amount + pinned slippage and returns mint+sig", async () => {
  const createAndBuy = vi.fn().mockResolvedValue({ success: true, signature: "SIG" });
  const sdk = { trade: { createAndBuy } } as any;
  const wallet = Keypair.generate();
  const mint = Keypair.generate();
  const item = { id: "a", name: "Acme", symbol: "ACME", description: "d", imagePath: __filename };
  const res = await launchOne(sdk, wallet, mint, item, { devBuySol: 0.4306, slippageBps: 150, priorityFeeMicroLamports: 200000 });
  expect(res).toEqual({ mint: mint.publicKey.toBase58(), signature: "SIG" });
  const args = createAndBuy.mock.calls[0];
  expect(typeof args[3]).toBe("bigint");          // buyAmountSol
  expect(args[4]).toBe(150n);                       // slippageBps as bigint
});

test("launchOne throws when the SDK reports failure", async () => {
  const sdk = { trade: { createAndBuy: vi.fn().mockResolvedValue({ success: false, error: "boom" }) } } as any;
  await expect(launchOne(sdk, Keypair.generate(), Keypair.generate(),
    { id: "a", name: "A", symbol: "A", description: "d", imagePath: __filename },
    { devBuySol: 0.4306, slippageBps: 150, priorityFeeMicroLamports: 200000 },
  )).rejects.toThrow(/boom/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd launcher && npx vitest run test/launch.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/launch.ts`**

```typescript
import { readFileSync } from "node:fs";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { LaunchItem } from "./types.js";

export function devBuyLamports(devBuySol: number): bigint {
  return BigInt(Math.round(devBuySol * LAMPORTS_PER_SOL));
}

export interface LaunchOpts {
  devBuySol: number;
  slippageBps: number;
  priorityFeeMicroLamports: number;
}

// `sdk` is a PumpFunSDK-shaped object; injected so tests mock it.
export async function launchOne(
  sdk: { trade: { createAndBuy: Function } },
  wallet: Keypair, mint: Keypair, item: LaunchItem, opts: LaunchOpts,
): Promise<{ mint: string; signature: string }> {
  const img = readFileSync(item.imagePath);
  const file = new Blob([img], { type: "image/png" });
  const res = await sdk.trade.createAndBuy(
    wallet, mint,
    { name: item.name, symbol: item.symbol, description: item.description, file },
    devBuyLamports(opts.devBuySol),
    BigInt(opts.slippageBps),
    { unitLimit: 300_000, unitPrice: opts.priorityFeeMicroLamports },
    "confirmed",
  );
  if (!res?.success) throw new Error(`createAndBuy failed: ${res?.error ?? "unknown"}`);
  return { mint: mint.publicKey.toBase58(), signature: res.signature };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd launcher && npx vitest run test/launch.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add launcher/src/launch.ts launcher/test/launch.test.ts
git commit -m "feat(launcher): single-token create+dev-buy wrapper (bigint amount)"
```

---

### Task 8: `recover.ts` — on-chain existence check

**Files:** Create `launcher/src/recover.ts`, `launcher/test/recover.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test } from "vitest";
import { PublicKey } from "@solana/web3.js";
import { mintExistsOnChain } from "../src/recover.js";

test("true when the mint account exists", async () => {
  const conn = { getAccountInfo: async () => ({ lamports: 1 }) } as any;
  expect(await mintExistsOnChain(conn, new PublicKey("11111111111111111111111111111111"))).toBe(true);
});

test("false when getAccountInfo returns null", async () => {
  const conn = { getAccountInfo: async () => null } as any;
  expect(await mintExistsOnChain(conn, new PublicKey("11111111111111111111111111111111"))).toBe(false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd launcher && npx vitest run test/recover.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/recover.ts`**

```typescript
import { Connection, PublicKey } from "@solana/web3.js";

// A pump.fun create leaves a mint account on-chain. If an `attempting` entry's
// mint exists, the create already landed -> recover (do NOT relaunch).
export async function mintExistsOnChain(conn: Connection, mint: PublicKey): Promise<boolean> {
  const info = await conn.getAccountInfo(mint, "confirmed");
  return info !== null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd launcher && npx vitest run test/recover.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add launcher/src/recover.ts launcher/test/recover.test.ts
git commit -m "feat(launcher): on-chain mint existence check for crash recovery"
```

---

### Task 9: `orchestrate.ts` — the crash-safe batch

**Files:** Create `launcher/src/orchestrate.ts`, `launcher/test/orchestrate.test.ts`

**Context:** Dependencies (ledger, mintstore, launchFn, recoverFn) are injected so the test runs with **no chain**. Sequence per item: skip if `success`; if `attempting`, recover (chain-check) → success or retry; else write-ahead `attempting` → `launchFn` → record `success`/`failed`. Enforce `maxTotalSpendSol` (vs cumulative confirmed dev-buys) and `maxRetriesPerToken`; pace between launches; a thrown launch records `failed` and continues.

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test, vi } from "vitest";
import { runBatch } from "../src/orchestrate.js";
import type { LaunchItem } from "../src/types.js";

const item = (id: string, symbol: string): LaunchItem =>
  ({ id, name: id, symbol, description: "d", imagePath: "/x.png" });

function fakeLedger() {
  const data: Record<string, any> = {};
  return {
    statusOf: (id: string) => data[id]?.status,
    get: (id: string) => data[id],
    record: (e: any) => { data[id_(e)] = e; },
    data,
  };
  function id_(e: any) { return e.id; }
}
const mintstore = { getOrCreate: (id: string) => ({ publicKey: { toBase58: () => `MINT_${id}` } }) } as any;
const opts = { devBuySol: 1, slippageBps: 150, priorityFeeMicroLamports: 1, pacingMs: 0, maxTotalSpendSol: 10, maxRetriesPerToken: 2 };

test("launches each item once, writing attempting before success", async () => {
  const led = fakeLedger();
  const order: string[] = [];
  const launchFn = vi.fn(async (_m: any, it: LaunchItem) => { order.push(it.id); return { mint: `MINT_${it.id}`, signature: "S" }; });
  await runBatch([item("a", "A"), item("b", "B")], led as any, mintstore, launchFn, async () => false, opts);
  expect(led.statusOf("a")).toBe("success");
  expect(led.statusOf("b")).toBe("success");
  expect(launchFn).toHaveBeenCalledTimes(2);
});

test("skips already-successful items", async () => {
  const led = fakeLedger();
  led.record({ id: "a", mint: "MINT_a", status: "success", attempts: 1, ts: "t" });
  const launchFn = vi.fn(async () => ({ mint: "x", signature: "S" }));
  await runBatch([item("a", "A")], led as any, mintstore, launchFn, async () => false, opts);
  expect(launchFn).not.toHaveBeenCalled();
});

test("recovers an attempting item whose mint already exists (no relaunch)", async () => {
  const led = fakeLedger();
  led.record({ id: "a", mint: "MINT_a", status: "attempting", attempts: 1, ts: "t" });
  const launchFn = vi.fn(async () => ({ mint: "x", signature: "S" }));
  await runBatch([item("a", "A")], led as any, mintstore, launchFn, async () => true, opts);
  expect(launchFn).not.toHaveBeenCalled();
  expect(led.statusOf("a")).toBe("success");
});

test("a thrown launch records failed and continues", async () => {
  const led = fakeLedger();
  const launchFn = vi.fn()
    .mockRejectedValueOnce(new Error("boom"))   // a fails (after retries)
    .mockResolvedValue({ mint: "MINT_b", signature: "S" });
  await runBatch([item("a", "A"), item("b", "B")], led as any, mintstore, launchFn, async () => false,
    { ...opts, maxRetriesPerToken: 1 });
  expect(led.statusOf("a")).toBe("failed");
  expect(led.statusOf("b")).toBe("success");
});

test("aborts when cumulative spend would exceed the cap", async () => {
  const led = fakeLedger();
  const launchFn = vi.fn(async (_m: any, it: LaunchItem) => ({ mint: `MINT_${it.id}`, signature: "S" }));
  // devBuySol=1, cap=1 -> first item launches, second trips the cap and throws
  await expect(runBatch([item("a", "A"), item("b", "B")], led as any, mintstore, launchFn, async () => false,
    { ...opts, maxTotalSpendSol: 1 })).rejects.toThrow(/spend cap/i);
  expect(launchFn).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd launcher && npx vitest run test/orchestrate.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/orchestrate.ts`**

```typescript
import type { LaunchItem, LedgerEntry } from "./types.js";

export interface BatchOpts {
  devBuySol: number; slippageBps: number; priorityFeeMicroLamports: number;
  pacingMs: number; maxTotalSpendSol: number; maxRetriesPerToken: number;
}
interface LedgerLike {
  statusOf(id: string): string | undefined;
  get(id: string): LedgerEntry | undefined;
  record(e: LedgerEntry): void;
}
type LaunchFn = (mint: any, item: LaunchItem) => Promise<{ mint: string; signature: string }>;
type MintExistsFn = (mintBase58: string) => Promise<boolean>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

export async function runBatch(
  items: LaunchItem[], ledger: LedgerLike, mintstore: { getOrCreate(id: string): any },
  launchFn: LaunchFn, mintExists: MintExistsFn, opts: BatchOpts,
): Promise<{ succeeded: number; failed: number; skipped: number }> {
  let spent = 0, succeeded = 0, failed = 0, skipped = 0;
  for (const item of items) {
    if (ledger.statusOf(item.id) === "success") { skipped++; continue; }
    const mint = mintstore.getOrCreate(item.id);
    const mintB58 = mint.publicKey.toBase58();

    // crash recovery: an attempting entry whose mint already landed -> recover
    if (ledger.statusOf(item.id) === "attempting") {
      const prev = ledger.get(item.id)!;
      if (await mintExists(prev.mint)) {
        ledger.record({ ...prev, status: "success", ts: now() });
        succeeded++; continue;
      }
    }
    if (spent + opts.devBuySol > opts.maxTotalSpendSol) {
      throw new Error(`spend cap reached: ${spent}+${opts.devBuySol} > ${opts.maxTotalSpendSol} SOL`);
    }

    let launched = false, lastErr = "";
    for (let attempt = 1; attempt <= opts.maxRetriesPerToken; attempt++) {
      // write-ahead: record the intent + mint pubkey BEFORE broadcasting
      ledger.record({ id: item.id, mint: mintB58, status: "attempting", attempts: attempt, ts: now() });
      try {
        const { signature } = await launchFn(mint, item);
        ledger.record({ id: item.id, mint: mintB58, signature, status: "success", attempts: attempt, ts: now() });
        spent += opts.devBuySol; succeeded++; launched = true;
        break;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        ledger.record({ id: item.id, mint: mintB58, status: "failed", error: lastErr, attempts: attempt, ts: now() });
        if (attempt < opts.maxRetriesPerToken) await sleep(opts.pacingMs);
      }
    }
    if (!launched) failed++;
    await sleep(opts.pacingMs);
  }
  return { succeeded, failed, skipped };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd launcher && npx vitest run test/orchestrate.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add launcher/src/orchestrate.ts launcher/test/orchestrate.test.ts
git commit -m "feat(launcher): crash-safe batch orchestrator with spend+retry caps"
```

---

### Task 10: `cli.ts` — wire it together behind the gates

**Files:** Create `launcher/src/cli.ts`, `launcher/test/cli.test.ts`

**Context:** `cli.ts` exposes a pure `preview(items, cfg)` (cost preview string + total SOL) tested in isolation, and a `main()` that wires real modules (config → products → wallet → SDK → orchestrate). `main()` refuses to broadcast unless `cfg.confirm`. The real `PumpFunSDK`/`Connection` wiring lives only in `main()` (not unit-tested; exercised by the runbook). **Verify the `PumpFunSDK`/`AnchorProvider` construction against the installed SDK types; `npm run build` must pass.**

- [ ] **Step 1: Write the failing tests**

```typescript
import { expect, test } from "vitest";
import { preview, assertCanBroadcast } from "../src/cli.js";

const items = Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, name: "N", symbol: `S${i}`, description: "d", imagePath: "/x.png" }));

test("preview totals dev-buys", () => {
  const { totalSol, line } = preview(items, { devBuySol: 0.4306 } as any);
  expect(totalSol).toBeCloseTo(43.06, 1);
  expect(line).toMatch(/100/);
});

test("assertCanBroadcast throws without --confirm", () => {
  expect(() => assertCanBroadcast({ confirm: false } as any)).toThrow(/confirm/i);
});

test("assertCanBroadcast passes with --confirm", () => {
  expect(() => assertCanBroadcast({ confirm: true } as any)).not.toThrow();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd launcher && npx vitest run test/cli.test.ts`
Expected: FAIL (cannot find module)

- [ ] **Step 3: Implement `launcher/src/cli.ts`**

```typescript
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import { PumpFunSDK } from "pumpdotfun-repumped-sdk";
import { join } from "node:path";
import type { Config, LaunchItem } from "./types.js";
import { buildConfig } from "./config.js";
import { loadLaunchItems } from "./products.js";
import { Ledger } from "./ledger.js";
import { MintStore } from "./mintstore.js";
import { loadWallet, hasSufficientBalance } from "./wallet.js";
import { launchOne } from "./launch.js";
import { mintExistsOnChain } from "./recover.js";
import { runBatch } from "./orchestrate.js";

export function preview(items: LaunchItem[], cfg: Config): { totalSol: number; line: string } {
  const totalSol = items.length * cfg.devBuySol;
  return { totalSol, line: `Would launch ${items.length} tokens; dev-buys ≈ ${totalSol.toFixed(2)} SOL (+ ~1.25% trading fee, rent, priority fees)` };
}

export function assertCanBroadcast(cfg: Config): void {
  if (!cfg.confirm) throw new Error("refusing to broadcast: pass --confirm to spend real SOL (default is dry-run)");
}

export async function main(argv: string[], env: Record<string, string | undefined>): Promise<void> {
  const cfg = buildConfig(argv, env);
  const dataDir = join(process.cwd(), "..", "data");
  let items = loadLaunchItems(dataDir);
  if (cfg.only) items = items.filter((i) => i.id === cfg.only);
  if (cfg.limit !== undefined) items = items.slice(0, cfg.limit);

  const { line } = preview(items, cfg);
  console.log(line);
  if (!cfg.confirm) { console.log("DRY RUN — no transactions broadcast. Re-run with --confirm to launch."); return; }
  assertCanBroadcast(cfg);

  const wallet = loadWallet(env);
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  const required = items.length * cfg.devBuySol * 1.05; // headroom for fees
  if (!(await hasSufficientBalance(conn, wallet.publicKey, required))) {
    throw new Error(`wallet balance below required ~${required.toFixed(2)} SOL`);
  }
  const sdk = new PumpFunSDK(new AnchorProvider(conn, new Wallet(wallet), { commitment: "confirmed" }));
  const ledger = new Ledger(join(dataDir, "launch-ledger.json"));
  const mintstore = new MintStore(join(dataDir, ".mint-keys"));
  const result = await runBatch(
    items, ledger, mintstore,
    (mint, item) => launchOne(sdk, wallet, mint, item, cfg),
    (mintB58) => mintExistsOnChain(conn, new PublicKey(mintB58)),
    cfg,
  );
  console.log(`Done: ${result.succeeded} launched, ${result.failed} failed, ${result.skipped} skipped`);
}

// entrypoint
main(process.argv.slice(2), process.env).catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Run tests + build**

Run: `cd launcher && npx vitest run test/cli.test.ts && npm run build`
Expected: tests PASS; `tsc` build succeeds (fix any SDK type mismatches surfaced here — e.g. `PumpFunSDK`/`createAndBuy` signature — against the installed `pumpdotfun-repumped-sdk`).

- [ ] **Step 5: Commit**

```bash
git add launcher/src/cli.ts launcher/test/cli.test.ts
git commit -m "feat(launcher): CLI wiring with dry-run default and --confirm broadcast gate"
```

---

### Task 11: Full suite + dry-run on real data

**Files:** none (verification only)

- [ ] **Step 1: Run the whole suite + build**

Run: `cd launcher && npm test && npm run build`
Expected: all tests pass; build clean.

- [ ] **Step 2: Dry-run against the real `products.json` (no network, no spend)**

Run: `cd launcher && RPC_URL=https://api.mainnet-beta.solana.com MAX_TOTAL_SPEND_SOL=45 npm run launch`
Expected: prints `Would launch 100 tokens; dev-buys ≈ 43.06 SOL ...` then `DRY RUN — no transactions broadcast.` and exits 0 **without** loading the wallet or hitting the chain. (Confirms the gate: no `--confirm` ⇒ no network/secret access.)

- [ ] **Step 3: Commit (if any incidental fixes)**

```bash
git add -A launcher/
git commit -m "chore(launcher): verify suite + dry-run on real products.json"
```

*(Mainnet broadcast — `--confirm`, the single test launch, and the full run — is the launch-day runbook in the spec, gated on legal sign-off + go/no-go. Not part of implementation.)*

---

## Self-Review

- **Spec coverage:** single-wallet create+dev-buy via `createAndBuy` (Task 7) ✓; bigint buy amount (Task 7) ✓; IPFS handled inside `createAndBuy` ✓; one tx per token, no bundling (Tasks 7/9 — no Jito path) ✓; resumable ledger + write-ahead `attempting` + recovery (Tasks 4, 8, 9) ✓; persisted per-id mint for safe retry (Task 5) ✓; dry-run default + `--confirm` gate (Tasks 2, 10) ✓; cost preview + balance precheck + `MAX_TOTAL_SPEND_SOL` + retry cap + pinned slippage (Tasks 2, 9, 10) ✓; unique id/symbol + image validation (Task 3) ✓; key/secret hygiene — secrets only in git-ignored mint-keys/env, ledger pubkeys-only (Tasks 1, 4, 5) ✓; `--only`/`--limit` for the test launch (Tasks 2, 10) ✓.
- **Placeholder scan:** none — complete code + commands per step. The two "verify against installed SDK types" notes (Tasks 7, 10) are legitimate external-dependency checks enforced by `tsc`, not deferred work; the mocked-SDK unit tests fully specify behavior.
- **Type consistency:** `LaunchItem`/`LedgerEntry`/`Config` (Task 1) used verbatim across tasks; `launchOne(sdk, wallet, mint, item, opts)`, `runBatch(items, ledger, mintstore, launchFn, mintExists, opts)`, `mintExistsOnChain(conn, pubkey)`, `Ledger.statusOf/get/record`, `MintStore.getOrCreate` consistent between definitions, callers (Task 10), and tests.
- **On-chain code untested in CI by design:** every chain/SDK touch is injected + mocked; the real path is exercised only by the spec's gated mainnet runbook.
