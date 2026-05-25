"use client";
import { useState } from "react";
import type { Product } from "@/lib/products";
import { ProductCard } from "./ProductCard";

export function ProductGrid({ products }: { products: Product[] }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? products.filter((p) =>
        [p.name, p.symbol, p.industry].some((f) => f.toLowerCase().includes(needle)))
    : products;
  return (
    <div>
      <input type="search" placeholder="Search 100 tokens…" value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 w-full rounded-lg bg-fin px-4 py-2 text-white placeholder:text-muted" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((p) => <ProductCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}
