import { expect, test, vi } from "vitest";
import { Keypair, PublicKey, TransactionInstruction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import {
  creatorVaultPda,
  getCreatorVaultClaimable,
  buildCollectHouseFeesInstructions,
  PUMP_PROGRAM_ID,
} from "../src/collect.js";

test("PUMP_PROGRAM_ID is the canonical pump program", () => {
  expect(PUMP_PROGRAM_ID.toBase58()).toBe("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
});

test("creatorVaultPda derives a deterministic [creator-vault, creator] PDA under the pump program", () => {
  const creator = Keypair.generate().publicKey;
  const a = creatorVaultPda(creator);
  const b = creatorVaultPda(creator);
  expect(a.equals(b)).toBe(true);
  expect(a).toBeInstanceOf(PublicKey);
  // Re-derive the PDA independently and assert it matches.
  const [expected] = PublicKey.findProgramAddressSync(
    [Buffer.from("creator-vault"), creator.toBuffer()],
    PUMP_PROGRAM_ID,
  );
  expect(a.equals(expected)).toBe(true);
});

test("getCreatorVaultClaimable returns the vault lamport balance as bigint", async () => {
  const conn = { getBalance: async () => 12345 } as any;
  expect(await getCreatorVaultClaimable(conn, Keypair.generate().publicKey)).toBe(12345n);
});

test("buildCollectHouseFeesInstructions builds collect_creator_fee_v2 for the house creator vault", async () => {
  const house = Keypair.generate().publicKey;
  const fakeIx = new TransactionInstruction({ keys: [], programId: PUMP_PROGRAM_ID, data: Buffer.from([1]) });

  // Capture the accounts the builder is handed, and return a sentinel instruction.
  const accountsPartial = vi.fn().mockReturnValue({ instruction: vi.fn().mockResolvedValue(fakeIx) });
  const collectCreatorFeeV2 = vi.fn().mockReturnValue({ accountsPartial });
  const program = { methods: { collectCreatorFeeV2 } };

  const conn = {} as any;
  const ixs = await buildCollectHouseFeesInstructions(conn, house, {
    getProgram: () => program as any,
  });

  expect(ixs).toEqual([fakeIx]);
  expect(collectCreatorFeeV2).toHaveBeenCalledOnce();

  // Assert the account derivations passed to the anchor builder.
  const accounts = accountsPartial.mock.calls[0][0];
  const vault = creatorVaultPda(house);
  expect(accounts.creator.equals(house)).toBe(true);
  expect(accounts.creatorVault.equals(vault)).toBe(true);
  expect(accounts.quoteMint.equals(NATIVE_MINT)).toBe(true);
  expect(accounts.quoteTokenProgram.equals(TOKEN_PROGRAM_ID)).toBe(true);
  // creator_token_account = ATA(house, NATIVE_MINT) ; creator_vault_token_account = ATA(vault, NATIVE_MINT)
  expect(accounts.creatorTokenAccount.equals(
    getAssociatedTokenAddressSync(NATIVE_MINT, house, true, TOKEN_PROGRAM_ID),
  )).toBe(true);
  expect(accounts.creatorVaultTokenAccount.equals(
    getAssociatedTokenAddressSync(NATIVE_MINT, vault, true, TOKEN_PROGRAM_ID),
  )).toBe(true);
});
