import { expect, test } from "vitest";
import { toProducts, type RawRecord } from "@/lib/products";

const raw: RawRecord[] = [
  { id: "s5e9p1-a", include: true, season: 5, episode: 9, industry: "Tech", company_name: "AcmeCo",
    founders: ["A"], pitch: {}, selection: { rank: 1 },
    token: { name: "Acme", symbol: "ACME", description: "d", mint: null },
    media: { image_url: "token_images/s5e9p1-a.png", former_website: "https://x", youtube_url: null } },
  { id: "s5e9p2-b", include: false, season: 5, episode: 9, industry: "Food", company_name: "B",
    founders: [], pitch: {}, selection: { rank: null },
    token: { name: "B", symbol: "B", description: "d", mint: null },
    media: { image_url: "token_images/b.png", former_website: null, youtube_url: null } },
  // got-deal create-only coin: launched (include) but no dev-buy selection (null) — all-products model
  { id: "s10e10p840-gotdeal", include: true, season: 10, episode: 10, industry: "Tech", company_name: "GotDeal",
    founders: ["G"], pitch: {}, selection: null,
    token: { name: "GotDeal", symbol: "DEAL", description: "d", mint: null },
    media: { image_url: "token_images/gotdeal.png", former_website: null, youtube_url: null } },
];

test("toProducts maps + filters to included records", () => {
  const ps = toProducts(raw);
  expect(ps.map((p) => p.id)).toEqual(["s5e9p1-a", "s10e10p840-gotdeal"]);
  expect(ps[0]).toMatchObject({
    id: "s5e9p1-a", name: "Acme", symbol: "ACME", season: 5, episode: 9,
    mint: null, formerWebsite: "https://x", youtubeUrl: null, imagePath: "/token_images/s5e9p1-a.png",
  });
});

test("toProducts handles null selection (got-deal create-only coins)", () => {
  const ps = toProducts(raw);
  const gotDeal = ps.find((p) => p.id === "s10e10p840-gotdeal");
  expect(gotDeal).toBeDefined();
  expect(gotDeal!.rank).toBeNull();
  expect(gotDeal!.reach).toBeNull();
});
