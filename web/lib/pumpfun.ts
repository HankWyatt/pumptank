// Shared server-side helper: fetch a single token's USD market cap from pump.fun's
// keyless API. Works for tokens still on the bonding curve (complete:false). Used by
// both /api/mcaps (per-page) and /api/mcaps/all (whole archive, for sorting).
// Retries on 429/5xx with backoff — the bulk archive fetch (~1,481 calls) gets
// throttled otherwise, and most "null" caps are actually just rate-limited requests.
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

// pump.fun's Cloudflare 429s short/bot-ish User-Agents (incl. "Mozilla/5.0 (pumptank.fun)"
// and no-UA); a full real browser UA returns 200. This was THE cause of the bulk fill
// never completing (every request 429'd -> retry-backoff -> ~12min). Don't shorten it.
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function fetchPumpMarketCap(mint: string, retries = 2): Promise<number | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    // AbortController timeout so a single hung socket can't stall the whole bulk fill.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${mint}`, {
        headers: { accept: "application/json", "user-agent": BROWSER_UA },
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (r.status === 429 || r.status >= 500) {
        await sleep(400 * (attempt + 1) + Math.floor(Math.random() * 250));
        continue; // throttled/transient -> back off and retry
      }
      if (!r.ok) return null;
      const j: any = await r.json();
      const mc = j?.usd_market_cap;
      return typeof mc === "number" && isFinite(mc) && mc > 0 ? mc : null;
    } catch {
      await sleep(300 * (attempt + 1)); // includes timeout/abort -> back off and retry
    } finally {
      clearTimeout(timer);
    }
  }
  return null; // exhausted retries (timed out / still throttled)
}
