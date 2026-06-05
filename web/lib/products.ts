import data from "../../data/products.json";

export interface RawRecord {
  id: string; include: boolean; season: number; episode: number; industry: string;
  company_name: string; founders: string[]; pitch: Record<string, unknown>;
  air_date?: string | null; us_viewership?: number | null;
  got_deal?: boolean;
  selection: { rank: number | null; reach?: number | null } | null;
  token: { name: string; symbol: string; description: string; mint: string | null };
  media: { image_url: string; former_website: string | null; youtube_url: string | null };
}

export interface Product {
  id: string; name: string; symbol: string; description: string; mint: string | null;
  season: number; episode: number; industry: string; companyName: string;
  founders: string[]; formerWebsite: string | null; youtubeUrl: string | null;
  imagePath: string; rank: number | null;
  gotDeal: boolean;
  // sourced straight from data/products.json
  airDate: string | null;
  ask: number | null; askEquity: number | null; valuation: number | null;
  reach: number | null;
}

export function toProducts(raw: RawRecord[]): Product[] {
  return raw.filter((r) => r.include).map((r) => {
    const pitch = (r.pitch ?? {}) as { ask_amount?: number; ask_equity?: number; valuation_requested?: number };
    return {
      id: r.id, name: r.token.name, symbol: r.token.symbol, description: r.token.description,
      mint: r.token.mint, season: r.season, episode: r.episode, industry: r.industry,
      companyName: r.company_name, founders: r.founders, formerWebsite: r.media.former_website,
      youtubeUrl: r.media.youtube_url, imagePath: `/${r.media.image_url}`, rank: r.selection?.rank ?? null,
      gotDeal: r.got_deal ?? false,
      airDate: r.air_date ?? null,
      ask: pitch.ask_amount ?? null,
      askEquity: pitch.ask_equity ?? null,
      valuation: pitch.valuation_requested ?? null,
      reach: r.selection?.reach ?? null,
    };
  });
}

export function byTributeOrder(a: Product, b: Product): number {
  if (a.gotDeal !== b.gotDeal) return a.gotDeal ? 1 : -1; // no-deal (tribute core) first
  const ra = a.rank ?? Infinity, rb = b.rank ?? Infinity; // then by rank, nulls last
  if (ra !== rb) return ra - rb;
  return a.name.localeCompare(b.name);                     // then by name
}

export function getAllProducts(): Product[] {
  return toProducts(data as unknown as RawRecord[]).sort(byTributeOrder);
}

export function getProduct(id: string): Product | undefined {
  return getAllProducts().find((p) => p.id === id);
}
