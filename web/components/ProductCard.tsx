import type { Product } from "@/lib/products";
export function ProductCard({ p }: { p: Product }) {
  return (
    <a href={`/token/${p.id}/`} className="block rounded-xl bg-fin p-3 hover:ring-2 hover:ring-accent">
      <img src={p.imagePath} alt={p.name} className="w-full rounded-lg" />
      <div className="mt-2 font-bold">{p.name}</div>
      <div className="text-accent">${p.symbol}</div>
      <div className="text-muted text-sm">S{p.season}E{p.episode} · {p.industry}</div>
    </a>
  );
}
