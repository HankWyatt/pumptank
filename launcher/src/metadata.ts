import { readFileSync } from "node:fs";
import type { LaunchItem } from "./types.js";

const PUMP_IPFS_URL = "https://pump.fun/api/ipfs";

/**
 * Upload a token's image + text metadata to pump.fun's IPFS endpoint and return
 * the metadata `uri` that create_v2 needs (must be <= 200 chars). `fetchImpl` is
 * injectable for tests; defaults to global fetch.
 */
export async function uploadTokenMetadata(
  item: LaunchItem,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const img = readFileSync(item.imagePath);
  const form = new FormData();
  form.append("file", new Blob([img], { type: "image/png" }), `${item.symbol}.png`);
  form.append("name", item.name);
  form.append("symbol", item.symbol);
  form.append("description", item.description);
  form.append("showName", "true");
  const res = await fetchImpl(PUMP_IPFS_URL, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`IPFS upload failed: ${res.status} ${body}`);
  }
  const json: any = await res.json();
  const uri: string | undefined = json.metadataUri ?? json.metadata?.uri ?? json.uri;
  if (!uri) throw new Error(`IPFS upload returned no metadataUri: ${JSON.stringify(json).slice(0, 200)}`);
  if (uri.length > 200) throw new Error(`metadata uri too long (${uri.length} > 200): ${uri}`);
  return uri;
}
