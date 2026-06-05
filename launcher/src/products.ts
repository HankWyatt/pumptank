import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LaunchItem } from "./types.js";

interface Record_ {
  id: string;
  include: boolean;
  dev_buy?: boolean;
  token: { name: string; symbol: string; description: string } | null;
  media: { image_url: string | null };
}

export function loadLaunchItems(dataDir: string): LaunchItem[] {
  const records = JSON.parse(readFileSync(join(dataDir, "products.json"), "utf8")) as Record_[];
  const items: LaunchItem[] = [];
  const ids = new Set<string>();
  const symbols = new Set<string>();
  // Load ALL launched records (include === true): the full ~1,481-product set.
  // Products are all create-only (dev_buy is absent/false in products.json); the
  // devBuy flag stays in the model so the index-token dev-buy path can reuse it.
  for (const r of records) {
    if (r.include !== true) continue;
    if (!r.token) throw new Error(`included record ${r.id} has no token`);
    if (ids.has(r.id)) throw new Error(`duplicate id: ${r.id}`);
    if (symbols.has(r.token.symbol)) throw new Error(`duplicate symbol: ${r.token.symbol}`);
    if (!r.media.image_url) throw new Error(`record ${r.id} has no image_url`);
    const imagePath = join(dataDir, r.media.image_url);
    if (!existsSync(imagePath)) throw new Error(`missing image file: ${imagePath}`);
    ids.add(r.id);
    symbols.add(r.token.symbol);
    items.push({
      id: r.id, name: r.token.name, symbol: r.token.symbol,
      description: r.token.description, imagePath, devBuy: r.dev_buy === true,
    });
  }
  return items;
}
