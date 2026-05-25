import data from "../../data/products.json";

export interface RawRecord {
  id: string; include: boolean; season: number; episode: number; industry: string;
  company_name: string; founders: string[]; pitch: Record<string, unknown>;
  selection: { rank: number | null };
  token: { name: string; symbol: string; description: string; mint: string | null };
  media: { image_url: string; former_website: string | null; youtube_url: string | null };
}

export interface Product {
  id: string; name: string; symbol: string; description: string; mint: string | null;
  season: number; episode: number; industry: string; companyName: string;
  founders: string[]; formerWebsite: string | null; youtubeUrl: string | null;
  imagePath: string; rank: number | null;
}

export function toProducts(raw: RawRecord[]): Product[] {
  return raw.filter((r) => r.include).map((r) => ({
    id: r.id, name: r.token.name, symbol: r.token.symbol, description: r.token.description,
    mint: r.token.mint, season: r.season, episode: r.episode, industry: r.industry,
    companyName: r.company_name, founders: r.founders, formerWebsite: r.media.former_website,
    youtubeUrl: r.media.youtube_url, imagePath: `/${r.media.image_url}`, rank: r.selection.rank,
  }));
}

export function getAllProducts(): Product[] {
  return toProducts(data as unknown as RawRecord[]).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
}

export function getProduct(id: string): Product | undefined {
  return getAllProducts().find((p) => p.id === id);
}
