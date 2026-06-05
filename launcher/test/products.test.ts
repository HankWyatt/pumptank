import { expect, test } from "vitest";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLaunchItems } from "../src/products.js";

function fixture(records: unknown[], images: string[] = ["a.png"]): string {
  const dir = mkdtempSync(join(tmpdir(), "prod-"));
  mkdirSync(join(dir, "token_images"));
  for (const img of images) writeFileSync(join(dir, "token_images", img), "png");
  writeFileSync(join(dir, "products.json"), JSON.stringify(records));
  return dir;
}
const rec = (over: object = {}) => ({
  id: "s5e9p1-a", include: true, dev_buy: true,
  token: { name: "Acme", symbol: "ACME", description: "d", mint: null },
  media: { image_url: "token_images/a.png" }, ...over,
});

test("loads only included records as items", () => {
  const dir = fixture([rec(), rec({ include: false, id: "s5e9p2-b" })]);
  const items = loadLaunchItems(dir);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ id: "s5e9p1-a", symbol: "ACME" });
  expect(items[0].imagePath).toBe(join(dir, "token_images", "a.png"));
});

test("loads ALL launched records, mapping devBuy from dev_buy", () => {
  const dir = fixture([
    rec({ id: "s5e9p1-a", dev_buy: true }),
    rec({ id: "s5e9p2-b", dev_buy: false, token: { name: "Beta", symbol: "BETA", description: "d", mint: null }, media: { image_url: "token_images/b.png" } }),
    rec({ id: "s5e9p3-c", include: false, dev_buy: false, token: { name: "Gone", symbol: "GONE", description: "d", mint: null } }),
  ], ["a.png", "b.png"]);
  const items = loadLaunchItems(dir);
  expect(items).toHaveLength(2);
  expect(items.find((i) => i.id === "s5e9p1-a")?.devBuy).toBe(true);
  expect(items.find((i) => i.id === "s5e9p2-b")?.devBuy).toBe(false);
  expect(items.find((i) => i.id === "s5e9p3-c")).toBeUndefined();
});

test("treats missing dev_buy as false", () => {
  const dir = fixture([rec({ dev_buy: undefined })]);
  const items = loadLaunchItems(dir);
  expect(items[0].devBuy).toBe(false);
});

test("fails on duplicate id", () => {
  const dir = fixture([rec(), rec({ token: { name: "B", symbol: "B", description: "d", mint: null } })]);
  expect(() => loadLaunchItems(dir)).toThrow(/duplicate id/i);
});

test("fails on duplicate symbol", () => {
  const dir = fixture([rec(), rec({ id: "s5e9p2-b" })]);
  expect(() => loadLaunchItems(dir)).toThrow(/duplicate symbol/i);
});

test("fails on missing image file", () => {
  const dir = fixture([rec({ media: { image_url: "token_images/missing.png" } })]);
  expect(() => loadLaunchItems(dir)).toThrow(/image/i);
});
