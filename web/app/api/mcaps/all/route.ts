// GET /api/mcaps/all -> { ready: boolean, marketCaps: { <mint>: number|null } }
//
// Whole-archive market caps for the grid's market-cap sort. Computed from the pump.fun
// bonding curves via Helius getMultipleAccounts (15 batched RPC calls for ~1,481 mints,
// NO per-token rate limit — pump.fun's per-token API 429s that volume). Refreshed every
// 5 min by a module-level loop (NOT a per-request promise; Next 14 drops those), so the
// map is always warm => instant sort, ~15 Helius calls / 5 min = trivial credits.
//
// mcap_SOL = virtual_sol_reserves * total_supply / virtual_token_reserves / 1e9
// (verified exact vs pump.fun); mcap_USD = mcap_SOL * SOL/USD.
import { CURVE_PDAS } from "@/lib/curvePdas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REFRESH_MS = 300_000; // 5 min
const BATCH = 100;          // getMultipleAccounts max per call
const SOL_MINT = "So11111111111111111111111111111111111111112";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MINTS = Object.keys(CURVE_PDAS);
const PDAS = MINTS.map((m) => CURVE_PDAS[m]);

let cacheMap: Record<string, number | null> | null = null;
let cacheAt = 0;
let lastSolPrice = 0;

async function getSolPrice(): Promise<number> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { cache: "no-store" }
    );
    const j: any = await r.json();
    const p = j?.solana?.usd;
    if (typeof p === "number" && p > 0) return p;
  } catch {}
  try {
    const r = await fetch(`https://lite-api.jup.ag/price/v2?ids=${SOL_MINT}`, { cache: "no-store" });
    const j: any = await r.json();
    const p = Number(j?.data?.[SOL_MINT]?.price);
    if (isFinite(p) && p > 0) return p;
  } catch {}
  return lastSolPrice; // keep last good (0 only before the first successful fetch)
}

function decodeMcapSol(b64: string): number | null {
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 48) return null;
  const vtoken = buf.readBigUInt64LE(8);
  const vsol = buf.readBigUInt64LE(16);
  const supply = buf.readBigUInt64LE(40);
  if (vtoken === 0n) return null;
  return (Number(vsol) / 1e9) * (Number(supply) / Number(vtoken));
}

async function doRefresh(rpc: string): Promise<void> {
  const solPrice = await getSolPrice();
  if (solPrice > 0) lastSolPrice = solPrice;
  const price = solPrice > 0 ? solPrice : lastSolPrice;
  const map: Record<string, number | null> = {};
  for (let i = 0; i < PDAS.length; i += BATCH) {
    const pdaBatch = PDAS.slice(i, i + BATCH);
    const mintBatch = MINTS.slice(i, i + BATCH);
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "getMultipleAccounts",
        params: [pdaBatch, { encoding: "base64" }],
      }),
    });
    const j: any = await res.json();
    const values: any[] = j?.result?.value ?? [];
    mintBatch.forEach((mint, k) => {
      const acct = values[k];
      const sol = acct?.data?.[0] ? decodeMcapSol(acct.data[0]) : null;
      map[mint] = sol != null && price > 0 ? sol * price : null;
    });
  }
  cacheMap = map;
  cacheAt = Date.now();
}

// Module-level refresh loop (every 5 min, always warm). Needs HELIUS_RPC_URL.
void (async () => {
  for (;;) {
    const rpc = process.env.HELIUS_RPC_URL;
    if (rpc) {
      try {
        await doRefresh(rpc);
      } catch {
        /* keep looping; try again next interval */
      }
    }
    await sleep(REFRESH_MS);
  }
})();

export async function GET() {
  if (cacheMap) {
    return Response.json(
      { ready: true, marketCaps: cacheMap, asOf: cacheAt },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  }
  return Response.json(
    { ready: false, marketCaps: {} },
    { headers: { "Cache-Control": "no-store" } }
  );
}
