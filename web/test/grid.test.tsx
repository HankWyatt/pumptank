import { expect, test } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ProductGrid } from "@/components/ProductGrid";
import type { Product } from "@/lib/products";

const p = (id: string, name: string, symbol: string, industry: string): Product => ({
  id, name, symbol, description: "d", mint: null, season: 5, episode: 9, industry,
  companyName: name, founders: [], formerWebsite: null, youtubeUrl: null,
  imagePath: `/token_images/${id}.png`, rank: 1,
});
const items = [p("a", "Smart Tire", "SMARTTIRE", "Automotive"), p("b", "Joyebells", "JOYEBELLS", "Food and Beverage")];

test("renders all cards initially", () => {
  render(<ProductGrid products={items} />);
  expect(screen.getByText("Smart Tire")).toBeInTheDocument();
  expect(screen.getByText("Joyebells")).toBeInTheDocument();
});

test("filters by query (name/ticker/industry)", () => {
  render(<ProductGrid products={items} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "joye" } });
  expect(screen.queryByText("Smart Tire")).toBeNull();
  expect(screen.getByText("Joyebells")).toBeInTheDocument();
});
