// Precompute each launched token's pump.fun bonding-curve PDA so the web service can
// batch-read them via Helius getMultipleAccounts WITHOUT bundling @solana/web3.js.
// PDA = findProgramAddress(["bonding-curve", mint], pumpProgram). Deterministic; re-run
// if products.json gains tokens. Run: NODE_PATH=launcher/node_modules node scripts/build-curve-pdas.cjs
const fs = require("fs");
const path = require("path");
const { PublicKey } = require("@solana/web3.js");

const ROOT = path.resolve(__dirname, "..");
const PROGRAM = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const products = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "products.json"), "utf8"));

const out = {};
for (const r of products) {
  const mint = r.token && r.token.mint;
  if (!(r.include && mint)) continue;
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), new PublicKey(mint).toBuffer()],
    PROGRAM
  );
  out[mint] = pda.toBase58();
}
fs.writeFileSync(path.join(ROOT, "data", "curve-pdas.json"), JSON.stringify(out, null, 0) + "\n");
console.log("wrote", Object.keys(out).length, "curve PDAs -> data/curve-pdas.json");
