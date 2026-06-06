import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LaunchItem } from "./types.js";

const PUMP_IPFS_URL = "https://pump.fun/api/ipfs";
const MAX_URI = 200; // pump.fun create_v2 hard limit on the on-chain uri string

/** id -> the public metadata-JSON URL (self-hosted on our Spaces CDN). */
export type MetadataUris = Record<string, string>;

/**
 * Load the pre-built id->uri map written by scripts/build-token-metadata.py.
 * We self-host metadata on a custom domain we control forever (meta.thepumptank.fun)
 * instead of uploading to pump.fun's IPFS endpoint: it removes the single most
 * failure-prone leg of a 1,481-token run from the launch critical path (all JSON +
 * images are staged + verified BEFORE any spend), and the on-chain uri stays a short,
 * stable URL whose content remains editable post-launch.
 */
export function loadMetadataUris(dataDir: string): MetadataUris {
  const p = join(dataDir, "metadata", "uris.json");
  if (!existsSync(p)) {
    throw new Error(`metadata uri map not found: ${p} -- run scripts/build-token-metadata.py first`);
  }
  return JSON.parse(readFileSync(p, "utf8")) as MetadataUris;
}

/** Resolve the on-chain metadata uri for a launch item, with the create_v2 guards. */
export function metadataUriFor(item: Pick<LaunchItem, "id">, uris: MetadataUris): string {
  const uri = uris[item.id];
  if (!uri) throw new Error(`no metadata uri for id "${item.id}" -- regen scripts/build-token-metadata.py`);
  if (!uri.startsWith("https://")) throw new Error(`metadata uri must be https: ${uri}`);
  if (uri.length > MAX_URI) throw new Error(`metadata uri too long (${uri.length} > ${MAX_URI}): ${uri}`);
  return uri;
}

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
