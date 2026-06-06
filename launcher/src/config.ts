import type { Config } from "./types.js";

export const SLIPPAGE_BPS_CAP = 300;        // hard upper bound (3%)
export const DEFAULT_DEV_BUY_SOL = 0.4306;  // ~1.5% of total supply at opening curve
export const DEV_BUY_TOKENS = 15_000_000_000_000n; // 1.5% of 1e15 total supply (Token-2022, 6 decimals)

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
  // Per pump.fun guidance: send up to ~15 create_v2 tx per second ("dont do more";
  // "1 per second if you want to make sure it works"). We launch the create-only
  // tributes in concurrent waves of this size, paced by PACING_MS between waves.
  const batchSize = Number(env.BATCH_SIZE ?? "15");
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 15) {
    throw new Error(`BATCH_SIZE ${batchSize} outside [1, 15] (pump.fun: don't exceed 15/sec)`);
  }
  const limit = flag(argv, "--limit");
  return {
    rpcUrl: env.RPC_URL,
    devBuySol: Number(env.DEV_BUY_SOL ?? DEFAULT_DEV_BUY_SOL),
    devBuyTokens: DEV_BUY_TOKENS,
    slippageBps,
    priorityFeeMicroLamports: Number(env.PRIORITY_FEE ?? "200000"),
    pacingMs: Number(env.PACING_MS ?? "1000"),
    batchSize,
    maxTotalSpendSol: Number(env.MAX_TOTAL_SPEND_SOL),
    maxRetriesPerToken: Number(env.MAX_RETRIES ?? "2"),
    confirm: argv.includes("--confirm"),
    only: flag(argv, "--only"),
    limit: limit === undefined ? undefined : Number(limit),
  };
}
