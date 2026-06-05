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
