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
