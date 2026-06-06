// mint -> pump.fun bonding-curve PDA, precomputed by scripts/build-curve-pdas.cjs.
// Lets the bulk market-cap route batch-read curves via Helius getMultipleAccounts
// without bundling @solana/web3.js. Re-run the script if products.json gains tokens.
import data from "../../data/curve-pdas.json";
export const CURVE_PDAS: Record<string, string> = data as Record<string, string>;
