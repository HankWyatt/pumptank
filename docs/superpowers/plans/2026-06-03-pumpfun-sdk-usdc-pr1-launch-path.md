# pump-sdk USDC — PR1 (Launch Path: create_v2 + buy_v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add USDC (non-native quote-mint) support to the launch path of `@nirholas/pump-sdk` — `createV2Instruction`, a new `buyV2` builder, and `createV2AndBuyInstructions` — via additive optional `quoteMint`/`quoteTokenProgram` params, then open PR1 against `nirholas/pump-fun-sdk` from the `HankWyatt` fork.

**Architecture:** Approach A — optional params default to wSOL + SPL Token, so existing SOL callers are byte-identical. Non-native appends `create_v2`'s 3 quote remaining-accounts and routes the buy leg to a new `buy_v2` builder (27 accounts, 2 args). The base mint is always Token-2022; the quote side is SPL Token even for USDC. The bundled IDL is missing `buy_v2`, so we sync it from the official IDL. `bondingCurve.ts` is untouched (reserve-driven math).

**Tech Stack:** TypeScript, `@coral-xyz/anchor` 0.31, `@solana/web3.js` 1.98, `@solana/spl-token` 0.4, Jest (offline, fixture-based), `tsup` build.

**Source of truth for layouts:** official IDL at `/tmp/pump-public-docs/idl/pump.json` and `/tmp/pump-public-docs/docs/instructions/{COIN_CREATION,BUY}.md`, `/tmp/pump-public-docs/docs/FEE_RECIPIENTS.md`. Spec: `docs/superpowers/specs/2026-06-03-pumpfun-sdk-usdc-support-design.md`.

---

## File Structure

- **Create** `src/quoteMints.ts` — `USDC_MINT` + `QUOTE_MINTS` registry (single source of truth for quote-mint metadata; today `USDC_MINT` lives only in `channel-bot`).
- **Modify** `src/idl/pump.json` + `src/idl/pump.ts` — add the `buy_v2` instruction node + its typed mirror (bundled IDL currently lacks it).
- **Modify** `src/fees.ts` — add `BUYBACK_FEE_RECIPIENTS` alias + `pickBuybackFeeRecipient()` (clarity; the 8 addresses already exist as `BREAKING_FEE_RECIPIENTS`).
- **Modify** `src/sdk.ts` — `createV2Instruction` (quote remaining-accounts), new `buyV2` builder, route `buyInstructions`/`getBuyInstructionRaw`/`buyInstruction`/`getBuyInstructionInternal`, `createV2AndBuyInstructions` forwarding + `quoteAmount`.
- **Modify** `src/index.ts` — re-export `quoteMints` + new fees helpers.
- **Create** `src/__tests__/usdc.test.ts` — all PR1 USDC + SOL-byte-identity unit tests.
- **Create** `scripts/devnet-usdc-smoke.ts` — `simulateTransaction` + opt-in devnet broadcast (verification bar; not in CI).

Conventions (`CONTRIBUTING.md`): branch `feat/…`, conventional commits, squash-merge, `npm test` (Jest) green, `bondingCurve.ts` coverage ≥ 90/90/80, no direct `src/idl` imports in new app code.

---

### Task 0: Fork setup & green baseline

**Files:** none (environment).

- [ ] **Step 1: Clone the fork and add upstream**

```bash
git clone https://github.com/HankWyatt/pump-fun-sdk ~/Documents/git/pump-fun-sdk
cd ~/Documents/git/pump-fun-sdk
git remote add upstream https://github.com/nirholas/pump-fun-sdk
git fetch upstream
git checkout main && git merge --ff-only upstream/main
```
Expected: fork `main` fast-forwarded to upstream `main` (or already current).

- [ ] **Step 2: Branch for PR1**

```bash
git checkout -b feat/usdc-create-buy-v2
```

- [ ] **Step 3: Install and confirm a green baseline**

Run: `npm ci && npm test`
Expected: all existing Jest suites PASS (this is the no-regression baseline we protect).

- [ ] **Step 4: Confirm the build is clean**

Run: `npm run build`
Expected: `tsup` emits `dist/` with no type errors.

- [ ] **Step 5: Commit the branch point (no-op marker)**

```bash
git commit --allow-empty -m "chore: start feat/usdc-create-buy-v2 (PR1: USDC launch path)"
```

---

### Task 1: `src/quoteMints.ts` — quote-mint registry

**Files:**
- Create: `src/quoteMints.ts`
- Modify: `src/index.ts`
- Test: `src/__tests__/usdc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/usdc.test.ts
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { USDC_MINT, QUOTE_MINTS } from "../quoteMints";

describe("quoteMints", () => {
  it("exposes the canonical mainnet USDC mint (6 decimals, SPL Token program)", () => {
    expect(USDC_MINT.toBase58()).toBe(
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    );
    expect(QUOTE_MINTS.USDC.mint.equals(USDC_MINT)).toBe(true);
    expect(QUOTE_MINTS.USDC.decimals).toBe(6);
    expect(QUOTE_MINTS.USDC.tokenProgram.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(QUOTE_MINTS.USDC.tokenProgram.equals(NATIVE_MINT)).toBe(false);
  });

  it("models wSOL with 9 decimals under the SPL Token program", () => {
    expect(QUOTE_MINTS.wSOL.mint.equals(NATIVE_MINT)).toBe(true);
    expect(QUOTE_MINTS.wSOL.decimals).toBe(9);
    expect(QUOTE_MINTS.wSOL.tokenProgram.equals(TOKEN_PROGRAM_ID)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest src/__tests__/usdc.test.ts -t quoteMints`
Expected: FAIL — `Cannot find module '../quoteMints'`.

- [ ] **Step 3: Implement `src/quoteMints.ts`**

```ts
// src/quoteMints.ts
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

/** Canonical mainnet USDC mint (legacy SPL Token, 6 decimals). */
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
);

export interface QuoteMintInfo {
  mint: PublicKey;
  decimals: number;
  /** Token program that owns the quote mint. Both wSOL and USDC use the legacy SPL Token program. */
  tokenProgram: PublicKey;
  ticker: string;
}

/** Supported quote mints. `quoteMint`/`quoteTokenProgram` SDK params default to wSOL. */
export const QUOTE_MINTS: Record<"wSOL" | "USDC", QuoteMintInfo> = {
  wSOL: { mint: NATIVE_MINT, decimals: 9, tokenProgram: TOKEN_PROGRAM_ID, ticker: "SOL" },
  USDC: { mint: USDC_MINT, decimals: 6, tokenProgram: TOKEN_PROGRAM_ID, ticker: "USDC" },
};

/** True when a quote mint is native SOL (wrapped SOL), i.e. the legacy/default path. */
export function isNativeQuote(quoteMint: PublicKey): boolean {
  return quoteMint.equals(NATIVE_MINT);
}
```

- [ ] **Step 4: Re-export from `src/index.ts`**

Add near the other `export * from "./…"` lines:
```ts
export * from "./quoteMints";
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx jest src/__tests__/usdc.test.ts -t quoteMints`
Expected: PASS (both cases).

- [ ] **Step 6: Commit**

```bash
git add src/quoteMints.ts src/index.ts src/__tests__/usdc.test.ts
git commit -m "feat(quote): add USDC_MINT + QUOTE_MINTS registry"
```

---

### Task 2: Sync `buy_v2` into the bundled IDL

**Files:**
- Modify: `src/idl/pump.json` (add the `buy_v2` instruction object)
- Modify: `src/idl/pump.ts` (add the matching typed entry)
- Test: `src/__tests__/usdc.test.ts`

`buy_v2` is **absent** from the bundled IDL (verified) but present in the official IDL. Anchor's `Program` keys methods off the IDL, so `.buyV2(...)` won't exist until the node is added.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/__tests__/usdc.test.ts
import { Connection } from "@solana/web3.js";
import { getPumpProgram } from "../sdk";

describe("bundled IDL: buy_v2", () => {
  const program = getPumpProgram(new Connection("http://localhost:8899"));
  it("includes buy_v2 with the official discriminator and exactly 2 args", () => {
    const ix = (program.idl.instructions as any[]).find((i) => i.name === "buy_v2");
    expect(ix).toBeDefined();
    expect(ix.discriminator).toEqual([184, 23, 238, 97, 103, 197, 211, 61]);
    expect(ix.args.map((a: any) => a.name)).toEqual(["amount", "max_sol_cost"]);
    expect(ix.accounts).toHaveLength(27);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest src/__tests__/usdc.test.ts -t "buy_v2"`
Expected: FAIL — `ix` is `undefined`.

- [ ] **Step 3: Copy the `buy_v2` instruction node into `src/idl/pump.json`**

From `/tmp/pump-public-docs/idl/pump.json`, copy the entire object in `instructions[]` whose `"name": "buy_v2"` (discriminator `[184,23,238,97,103,197,211,61]`, 27 accounts, args `amount`+`max_sol_cost`) and insert it into `src/idl/pump.json`'s `instructions` array, immediately after the existing `buy` node. Copy the node verbatim — it carries the exact account `pda.seeds`/`address` definitions Anchor needs for offline resolution. Do not edit any field.

- [ ] **Step 4: Add the matching typed entry to `src/idl/pump.ts`**

`src/idl/pump.ts` is a hand-maintained `export interface Pump = { …, instructions: [ … ] }` mirror of the JSON. Copy the camelCase `buyV2` instruction entry from `/tmp/pump-public-docs/idl/pump.ts` (same `instructions` array) into `src/idl/pump.ts`, in the same position (after `buy`). The JSON and TS instruction arrays must stay 1:1, or the `Program<Pump>` type will mis-resolve.

- [ ] **Step 5: Run the test to confirm it passes; confirm no type regressions**

Run: `npx jest src/__tests__/usdc.test.ts -t "buy_v2" && npm run build`
Expected: test PASS; `tsup` build clean.

- [ ] **Step 6: Commit (IDL chore, separate from logic per spec)**

```bash
git add src/idl/pump.json src/idl/pump.ts src/__tests__/usdc.test.ts
git commit -m "chore(idl): add buy_v2 to bundled pump IDL (json + ts)"
```

---

### Task 3: `pickBuybackFeeRecipient()` clarity alias

**Files:**
- Modify: `src/fees.ts`
- Modify: `src/index.ts`
- Test: `src/__tests__/usdc.test.ts`

Nich's `BREAKING_FEE_RECIPIENTS` are byte-for-byte the **buyback** recipients from the official `FEE_RECIPIENTS.md`. We add a correctly-named alias so the `buy_v2` builder reads clearly; we do **not** add a second list.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/__tests__/usdc.test.ts
import {
  BUYBACK_FEE_RECIPIENTS,
  pickBuybackFeeRecipient,
  BREAKING_FEE_RECIPIENTS,
} from "../fees";

describe("buyback fee recipients", () => {
  it("are the 8 official buyback recipients (same set as BREAKING_FEE_RECIPIENTS)", () => {
    expect(BUYBACK_FEE_RECIPIENTS.map((p) => p.toBase58())).toEqual(
      BREAKING_FEE_RECIPIENTS.map((p) => p.toBase58()),
    );
    expect(BUYBACK_FEE_RECIPIENTS).toHaveLength(8);
    expect(BUYBACK_FEE_RECIPIENTS[0]!.toBase58()).toBe(
      "5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD",
    );
  });

  it("pickBuybackFeeRecipient returns one of the set", () => {
    expect(
      BUYBACK_FEE_RECIPIENTS.some((p) => p.equals(pickBuybackFeeRecipient())),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest src/__tests__/usdc.test.ts -t "buyback fee recipients"`
Expected: FAIL — `BUYBACK_FEE_RECIPIENTS`/`pickBuybackFeeRecipient` not exported.

- [ ] **Step 3: Add the alias to `src/fees.ts`** (just below `pickBreakingFeeRecipient`, ~line 177)

```ts
/**
 * The 8 buyback fee recipients (official `FEE_RECIPIENTS.md`). `buy_v2`/`sell_v2`
 * take a `buybackFeeRecipient` from this set. These are the same 8 addresses that
 * the 2026-04-28 upgrade appends to legacy buy/sell (a.k.a. {@link BREAKING_FEE_RECIPIENTS}).
 */
export const BUYBACK_FEE_RECIPIENTS = BREAKING_FEE_RECIPIENTS;

/** Pick one of the 8 buyback fee recipients at random (for `buy_v2`/`sell_v2`). */
export function pickBuybackFeeRecipient(): PublicKey {
  return pickBreakingFeeRecipient();
}
```

- [ ] **Step 4: Re-export from `src/index.ts`** (add to the existing `from "./fees"` export block)

```ts
  BUYBACK_FEE_RECIPIENTS,
  pickBuybackFeeRecipient,
```

- [ ] **Step 5: Run the test to confirm it passes**

Run: `npx jest src/__tests__/usdc.test.ts -t "buyback fee recipients"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/fees.ts src/index.ts src/__tests__/usdc.test.ts
git commit -m "feat(fees): add pickBuybackFeeRecipient alias for buy_v2/sell_v2"
```

---

### Task 4: `createV2Instruction` — optional quote mint

**Files:**
- Modify: `src/sdk.ts:338-370`
- Test: `src/__tests__/usdc.test.ts`

- [ ] **Step 1: Write the failing tests (SOL byte-identity + USDC remaining accounts)**

```ts
// append to src/__tests__/usdc.test.ts
import { Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { PUMP_SDK } from "../sdk";
import { bondingCurvePda } from "../pda";

const mint = new Keypair().publicKey;
const creator = new Keypair().publicKey;
const user = new Keypair().publicKey;
const baseArgs = { mint, name: "n", symbol: "n", uri: "u", creator, user, mayhemMode: false };

describe("createV2Instruction quote mint", () => {
  it("SOL (default): exactly 16 accounts, no remaining accounts appended", async () => {
    const ix = await PUMP_SDK.createV2Instruction(baseArgs);
    expect(ix.keys).toHaveLength(16);
  });

  it("explicit NATIVE_MINT behaves like SOL (16 accounts)", async () => {
    const ix = await PUMP_SDK.createV2Instruction({ ...baseArgs, quoteMint: NATIVE_MINT });
    expect(ix.keys).toHaveLength(16);
  });

  it("USDC: appends exactly the 3 quote remaining accounts in order", async () => {
    const ix = await PUMP_SDK.createV2Instruction({ ...baseArgs, quoteMint: USDC_MINT });
    expect(ix.keys).toHaveLength(19);
    const [r0, r1, r2] = ix.keys.slice(16);
    expect(r0!.pubkey.equals(USDC_MINT)).toBe(true);
    expect(r0!.isWritable).toBe(false);
    expect(
      r1!.pubkey.equals(
        getAssociatedTokenAddressSync(USDC_MINT, bondingCurvePda(mint), true, TOKEN_PROGRAM_ID),
      ),
    ).toBe(true);
    expect(r1!.isWritable).toBe(true);
    expect(r2!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(r2!.isWritable).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest src/__tests__/usdc.test.ts -t "createV2Instruction quote mint"`
Expected: USDC case FAILs (`keys` length 16, not 19); SOL cases pass.

- [ ] **Step 3: Implement (`src/sdk.ts:338-370`)**

Add params to the destructure + type, and append remaining accounts conditionally before `.instruction()`:

```ts
  async createV2Instruction({
    mint, name, symbol, uri, creator, user, mayhemMode, cashback = false,
    quoteMint = NATIVE_MINT,
    quoteTokenProgram = TOKEN_PROGRAM_ID,
  }: {
    mint: PublicKey; name: string; symbol: string; uri: string;
    creator: PublicKey; user: PublicKey; mayhemMode: boolean; cashback?: boolean;
    quoteMint?: PublicKey; quoteTokenProgram?: PublicKey;
  }): Promise<TransactionInstruction> {
    const remaining = quoteMint.equals(NATIVE_MINT)
      ? []
      : [
          { pubkey: quoteMint, isWritable: false, isSigner: false },
          {
            pubkey: getAssociatedTokenAddressSync(quoteMint, bondingCurvePda(mint), true, quoteTokenProgram),
            isWritable: true, isSigner: false,
          },
          { pubkey: quoteTokenProgram, isWritable: false, isSigner: false },
        ];
    return await this.offlinePumpProgram.methods
      .createV2(name, symbol, uri, creator, mayhemMode, [cashback ?? false])
      .accountsPartial({
        mint, user,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        mayhemProgramId: MAYHEM_PROGRAM_ID,
        globalParams: getGlobalParamsPda(),
        solVault: getSolVaultPda(),
        mayhemState: getMayhemStatePda(mint),
        mayhemTokenVault: getTokenVaultPda(mint),
      })
      .remainingAccounts(remaining)
      .instruction();
  }
```
(`getAssociatedTokenAddressSync`, `NATIVE_MINT`, `TOKEN_PROGRAM_ID`, `TOKEN_2022_PROGRAM_ID`, `bondingCurvePda` are already imported — see sdk.ts:1-60.)

- [ ] **Step 4: Run to confirm pass**

Run: `npx jest src/__tests__/usdc.test.ts -t "createV2Instruction quote mint"`
Expected: all 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sdk.ts src/__tests__/usdc.test.ts
git commit -m "feat(create): optional quoteMint on createV2Instruction (USDC remaining accounts)"
```

---

### Task 5: `buyV2` builder

**Files:**
- Modify: `src/sdk.ts` (new public method near `getBuyInstructionRaw`, ~line 846)
- Test: `src/__tests__/usdc.test.ts`

The test pins the on-chain contract (27 keys + 2 args). The implementation supplies `accountsPartial` and lets Anchor resolve PDAs/ATAs from the bundled IDL seeds; **add any account Anchor cannot resolve offline (those seeded by `creator`) explicitly until the test's key assertions pass.**

- [ ] **Step 1: Write the failing test**

```ts
// append to src/__tests__/usdc.test.ts
import { creatorVaultPda } from "../pda";
import { pickBuybackFeeRecipient, getFeeRecipient } from "../fees";
import { makeGlobal } from "./fixtures";
import BN from "bn.js";

describe("buyV2 builder (USDC)", () => {
  it("builds buy_v2 with 27 accounts, 2-arg data, USDC quote wiring", async () => {
    const ix = await PUMP_SDK.buyV2({
      user, mint, creator,
      amount: new BN("15000000000000"),   // 1.5% of supply, base units
      quoteAmount: new BN("15000000"),     // max quote cost, USDC base units (6dp)
      quoteMint: USDC_MINT,
      quoteTokenProgram: TOKEN_PROGRAM_ID,
      feeRecipient: getFeeRecipient(makeGlobal(), false),
      buybackFeeRecipient: pickBuybackFeeRecipient(),
    });
    expect(ix.keys).toHaveLength(27);
    expect(ix.keys[2]!.pubkey.equals(USDC_MINT)).toBe(true);            // quote_mint
    expect(ix.keys[3]!.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true); // base_token_program
    expect(ix.keys[4]!.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);     // quote_token_program
    expect(ix.keys[13]!.isSigner).toBe(true);                          // user
    expect(
      ix.keys[12]!.pubkey.equals(
        getAssociatedTokenAddressSync(USDC_MINT, bondingCurvePda(mint), true, TOKEN_PROGRAM_ID),
      ),
    ).toBe(true);                                                       // associated_quote_bonding_curve
    // discriminator (8) + 2 u64 (16) = 24 bytes; NO third (track_volume) arg
    expect(ix.data).toHaveLength(24);
    expect([...ix.data.slice(0, 8)]).toEqual([184, 23, 238, 97, 103, 197, 211, 61]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest src/__tests__/usdc.test.ts -t "buyV2 builder"`
Expected: FAIL — `PUMP_SDK.buyV2 is not a function`.

- [ ] **Step 3: Implement `buyV2` (`src/sdk.ts`, near line 846)**

```ts
  /**
   * Build a `buy_v2` instruction (the V2 buy that supports non-native quote
   * mints, e.g. USDC). For SOL-paired coins prefer the legacy `buy` path.
   * `quoteAmount` is the max QUOTE cost in the quote mint's base units
   * (USDC = 6dp), NOT lamports.
   */
  async buyV2({
    user, mint, creator, amount, quoteAmount,
    quoteMint = NATIVE_MINT,
    quoteTokenProgram = TOKEN_PROGRAM_ID,
    baseTokenProgram = TOKEN_2022_PROGRAM_ID,
    feeRecipient,
    buybackFeeRecipient = pickBuybackFeeRecipient(),
  }: {
    user: PublicKey; mint: PublicKey; creator: PublicKey;
    amount: BN; quoteAmount: BN;
    quoteMint?: PublicKey; quoteTokenProgram?: PublicKey; baseTokenProgram?: PublicKey;
    feeRecipient: PublicKey; buybackFeeRecipient?: PublicKey;
  }): Promise<TransactionInstruction> {
    return await this.offlinePumpProgram.methods
      .buyV2(amount, quoteAmount)
      .accountsPartial({
        baseMint: mint,
        quoteMint,
        baseTokenProgram,
        quoteTokenProgram,
        feeRecipient,
        buybackFeeRecipient,
        user,
        creatorVault: creatorVaultPda(creator),
      })
      .instruction();
  }
```
Note: if the offline Anchor resolver cannot derive `associated_creator_vault` (seeded by `creator_vault`) or `creator_vault`'s ATA, pass them explicitly too — e.g. `associatedCreatorVault: getAssociatedTokenAddressSync(creatorVaultPda(creator), quoteMint, true, quoteTokenProgram)`. The Step-1 test (27-key assertion) is the contract; iterate `accountsPartial` until it passes. `creatorVaultPda` is already imported (sdk.ts:49).

- [ ] **Step 4: Run to confirm pass**

Run: `npx jest src/__tests__/usdc.test.ts -t "buyV2 builder"`
Expected: PASS (27 keys, correct quote wiring, 24-byte data).

- [ ] **Step 5: Commit**

```bash
git add src/sdk.ts src/__tests__/usdc.test.ts
git commit -m "feat(buy): add buyV2 builder for non-native (USDC) quote mints"
```

---

### Task 6: Route the buy methods by quote mint

**Files:**
- Modify: `src/sdk.ts` — `getBuyInstructionRaw` (846), `getBuyInstructionInternal` (879), `buyInstruction` (563), `buyInstructions` (372)
- Test: `src/__tests__/usdc.test.ts`

- [ ] **Step 1: Write the failing tests (SOL unchanged + USDC routes to buy_v2)**

```ts
// append to src/__tests__/usdc.test.ts
describe("getBuyInstructionRaw routing", () => {
  it("SOL (default): emits legacy buy (disc 0x66063d12), unchanged", async () => {
    const ix = await PUMP_SDK.getBuyInstructionRaw({
      user, mint, creator, amount: new BN(1), solAmount: new BN(1),
      feeRecipient: getFeeRecipient(makeGlobal(), false),
    });
    expect([...ix.data.slice(0, 8)]).toEqual([102, 6, 61, 18, 1, 218, 235, 234]);
    expect(ix.keys.at(-1)!.isWritable).toBe(true); // breaking fee recipient
  });

  it("USDC: routes to buy_v2 (disc 0xb817ee…)", async () => {
    const ix = await PUMP_SDK.getBuyInstructionRaw({
      user, mint, creator, amount: new BN("15000000000000"), solAmount: new BN("15000000"),
      feeRecipient: getFeeRecipient(makeGlobal(), false),
      quoteMint: USDC_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID,
    });
    expect([...ix.data.slice(0, 8)]).toEqual([184, 23, 238, 97, 103, 197, 211, 61]);
    expect(ix.keys).toHaveLength(27);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest src/__tests__/usdc.test.ts -t "getBuyInstructionRaw routing"`
Expected: USDC case FAILs (still emits legacy buy / unknown param).

- [ ] **Step 3: Implement routing**

In `getBuyInstructionRaw` (846) add `quoteMint = NATIVE_MINT` + `quoteTokenProgram = TOKEN_PROGRAM_ID` params, and at the top:
```ts
    if (!quoteMint.equals(NATIVE_MINT)) {
      return await this.buyV2({
        user, mint, creator, amount, quoteAmount: solAmount,
        quoteMint, quoteTokenProgram, feeRecipient,
      });
    }
```
then fall through to the existing legacy call. Do the same guard in `buyInstruction` (563) and `buyInstructions` (372) — thread `quoteMint`/`quoteTokenProgram` through and, when non-native, build via `buyV2` (using `bondingCurve.creator` for `creator`). Leave `getBuyInstructionInternal` (the legacy builder) untouched; only its callers branch. SOL callers pass nothing ⇒ unchanged.

- [ ] **Step 4: Run to confirm pass + full no-regression**

Run: `npx jest src/__tests__/usdc.test.ts && npm test`
Expected: new routing tests PASS; **entire existing suite still PASS** (SOL byte-identity preserved).

- [ ] **Step 5: Commit**

```bash
git add src/sdk.ts src/__tests__/usdc.test.ts
git commit -m "feat(buy): route buy builders to buy_v2 for non-native quote mints"
```

---

### Task 7: `createV2AndBuyInstructions` — USDC end-to-end

**Files:**
- Modify: `src/sdk.ts:443-509`
- Test: `src/__tests__/usdc.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// append to src/__tests__/usdc.test.ts
describe("createV2AndBuyInstructions", () => {
  const common = {
    global: makeGlobal(), mint, name: "n", symbol: "n", uri: "u",
    creator, user, amount: new BN("15000000000000"), mayhemMode: false,
  };

  it("SOL: 4 instructions, create_v2 has 16 keys, buy leg is legacy buy", async () => {
    const ixs = await PUMP_SDK.createV2AndBuyInstructions({ ...common, solAmount: new BN("430000000") });
    expect(ixs).toHaveLength(4);
    expect(ixs[0]!.keys).toHaveLength(16); // create_v2, SOL
    expect([...ixs[3]!.data.slice(0, 8)]).toEqual([102, 6, 61, 18, 1, 218, 235, 234]); // legacy buy
  });

  it("USDC: create_v2 has 19 keys; buy leg is buy_v2 capped by quoteAmount", async () => {
    const ixs = await PUMP_SDK.createV2AndBuyInstructions({
      ...common, solAmount: new BN(0),
      quoteMint: USDC_MINT, quoteTokenProgram: TOKEN_PROGRAM_ID, quoteAmount: new BN("15000000"),
    });
    expect(ixs[0]!.keys).toHaveLength(19); // create_v2 + 3 quote remaining accounts
    const buyLeg = ixs.at(-1)!;
    expect([...buyLeg.data.slice(0, 8)]).toEqual([184, 23, 238, 97, 103, 197, 211, 61]); // buy_v2
    expect(buyLeg.keys).toHaveLength(27);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx jest src/__tests__/usdc.test.ts -t "createV2AndBuyInstructions"`
Expected: USDC case FAILs.

- [ ] **Step 3: Implement (`src/sdk.ts:443-509`)**

Add `quoteMint = NATIVE_MINT`, `quoteTokenProgram = TOKEN_PROGRAM_ID`, and optional `quoteAmount?: BN` to the destructure/type. Forward `quoteMint`/`quoteTokenProgram` into the nested `createV2Instruction` call. The base side stays Token-2022 (`associatedUser` ATA + idempotent create unchanged). Replace the final `buyInstruction` leg with:
```ts
      !quoteMint.equals(NATIVE_MINT)
        ? await this.buyV2({
            user, mint, creator, amount,
            quoteAmount: quoteAmount ?? solAmount, // explicit cap preferred for USDC
            quoteMint, quoteTokenProgram,
            feeRecipient: getFeeRecipient(global, mayhemMode),
          })
        : await this.buyInstruction({
            global, mint, creator, user, associatedUser,
            amount, solAmount, slippage: 1, tokenProgram: TOKEN_2022_PROGRAM_ID, mayhemMode,
          }),
```
(`getFeeRecipient` is already imported, sdk.ts:33.)

- [ ] **Step 4: Run to confirm pass + full suite**

Run: `npx jest src/__tests__/usdc.test.ts && npm test`
Expected: all PASS, full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/sdk.ts src/__tests__/usdc.test.ts
git commit -m "feat(create): USDC support in createV2AndBuyInstructions"
```

---

### Task 8: Verification — simulate + devnet smoke (no CI)

**Files:**
- Create: `scripts/devnet-usdc-smoke.ts`

Verification bar (spec decision 6): `simulateTransaction` (no broadcast) + an opt-in devnet broadcast. Run manually; not part of `npm test`.

- [ ] **Step 1: Write the smoke script**

```ts
// scripts/devnet-usdc-smoke.ts
// Usage:
//   RPC_URL=<mainnet> npx tsx scripts/devnet-usdc-smoke.ts            # simulate only (no broadcast)
//   RPC_URL=<devnet>  DEVNET_BROADCAST=1 KEYPAIR=~/.config/solana/id.json npx tsx scripts/devnet-usdc-smoke.ts
import { readFileSync } from "node:fs";
import {
  Connection, Keypair, PublicKey, ComputeBudgetProgram,
  TransactionMessage, VersionedTransaction,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import BN from "bn.js";
import { OnlinePumpSdk } from "../src/onlineSdk";
import { USDC_MINT } from "../src/quoteMints";

async function main() {
  const connection = new Connection(process.env.RPC_URL!, "confirmed");
  const sdk = new OnlinePumpSdk(connection);
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(process.env.KEYPAIR ?? "/dev/stdin", "utf8"))),
  );
  const mint = Keypair.generate();
  const quoteMint = process.env.DEVNET_QUOTE_MINT ? new PublicKey(process.env.DEVNET_QUOTE_MINT) : USDC_MINT;

  const global = await sdk.fetchGlobal();
  const ixs = await sdk.createV2AndBuyInstructions({
    global, mint: mint.publicKey, name: "SMOKE", symbol: "SMOKE",
    uri: "https://example.com/smoke.json", creator: payer.publicKey, user: payer.publicKey,
    amount: new BN("15000000000000"), solAmount: new BN(0), mayhemMode: false,
    quoteMint, quoteTokenProgram: TOKEN_PROGRAM_ID, quoteAmount: new BN("15000000"),
  });

  const { blockhash } = await connection.getLatestBlockhash();
  const msg = new TransactionMessage({
    payerKey: payer.publicKey, recentBlockhash: blockhash,
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }), ...ixs],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  tx.sign([payer, mint]);

  const sim = await connection.simulateTransaction(tx, { sigVerify: false });
  console.log("simulate err:", sim.value.err);
  console.log((sim.value.logs ?? []).join("\n"));
  if (sim.value.err) throw new Error("simulation failed — do NOT broadcast");

  if (process.env.DEVNET_BROADCAST === "1") {
    const sig = await connection.sendTransaction(tx);
    console.log("devnet broadcast sig:", sig);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Resolve the devnet quote mint**

Run (devnet): `RPC_URL=https://api.devnet.solana.com npx tsx -e "import {OnlinePumpSdk} from './src/onlineSdk'; new OnlinePumpSdk(new (require('@solana/web3.js').Connection)('https://api.devnet.solana.com')).fetchGlobal().then(g=>console.log(g.whitelistedQuoteMints ?? 'field-not-decoded'))"`
Expected: the devnet `Global` whitelisted quote mints. If USDC isn't whitelisted on devnet, set `DEVNET_QUOTE_MINT` to a whitelisted mint to exercise the non-native path; rely on mainnet simulate for USDC-account correctness.

- [ ] **Step 3: Simulate against mainnet (no broadcast)**

Run: `RPC_URL=<mainnet-rpc> KEYPAIR=<path> npx tsx scripts/devnet-usdc-smoke.ts`
Expected: `simulate err: null` and pump-program success logs. A non-null err must block any broadcast.

- [ ] **Step 4: Broadcast once on devnet**

Run: `RPC_URL=https://api.devnet.solana.com DEVNET_BROADCAST=1 DEVNET_QUOTE_MINT=<whitelisted> KEYPAIR=<devnet-funded> npx tsx scripts/devnet-usdc-smoke.ts`
Expected: a devnet signature; inspect on Solscan (devnet) — a Token-2022 mint created + a `buy_v2` that succeeded.

- [ ] **Step 5: Commit**

```bash
git add scripts/devnet-usdc-smoke.ts
git commit -m "test(usdc): add simulate + devnet smoke script for the launch path"
```

---

### Task 9: PR1 finalization

**Files:**
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Add a CHANGELOG entry**

```md
### Added
- USDC (non-native quote-mint) support for the launch path: optional `quoteMint`/`quoteTokenProgram` on `createV2Instruction` and `createV2AndBuyInstructions`, a new `buyV2` builder, `USDC_MINT`/`QUOTE_MINTS`, and `pickBuybackFeeRecipient`. SOL behavior unchanged.
```

- [ ] **Step 2: Full gate**

Run: `npm test && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 3: Commit + push + open PR**

```bash
git add CHANGELOG.md && git commit -m "docs(changelog): USDC launch-path support"
git push -u origin feat/usdc-create-buy-v2
gh pr create --repo nirholas/pump-fun-sdk --head HankWyatt:feat/usdc-create-buy-v2 \
  --title "feat: USDC quote-mint support for the launch path (create_v2 + buy_v2)" \
  --body "Additive optional quoteMint/quoteTokenProgram; SOL paths byte-identical; adds buy_v2 to the bundled IDL; offline tests + devnet smoke. See spec for account layouts."
```
Expected: PR opened against upstream from the fork branch.

---

## Self-Review

- **Spec coverage:** create_v2 USDC ✔ (T4); buy_v2 + bundled-IDL sync ✔ (T2, T5); buyback recipient ✔ (T3, corrected: reuse existing set); createV2AndBuy + explicit quoteAmount cap ✔ (T7); quoteMints constants ✔ (T1); bondingCurve no-change ✔ (untouched); backward-compat SOL byte-identity ✔ (T4/T6/T7 + full-suite gate); verification simulate+devnet ✔ (T8). PR2 (fee path) is a separate plan.
- **Placeholders:** none — every step has real code/commands; buy_v2 IDL node is "copy this exact object from <path>" (concrete), and the buyV2 27-key layout is pinned by the Step-1 test as the contract.
- **Type/name consistency:** `quoteMint`/`quoteTokenProgram`/`quoteAmount` used identically across T4–T7; `buyV2`, `USDC_MINT`, `QUOTE_MINTS`, `pickBuybackFeeRecipient` named consistently; disc bytes match the official IDL (create/buy/buy_v2).
- **Correction vs spec:** the spec's "add `pickBuybackFeeRecipient()`" is implemented as an alias over the existing `BREAKING_FEE_RECIPIENTS` (verified identical to the official buyback set), not a new address list. The spec's risk "missing buyback helper" is thereby resolved without new data.
