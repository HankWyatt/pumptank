import { expect, test } from "vitest";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadLaunchItems } from "../src/products.js";

function fixture(records: unknown[]): string {
  const dir = mkdtempSync(join(tmpdir(), "prod-"));
  mkdirSync(join(dir, "token_images"));
  writeFileSync(join(dir, "token_images", "a.png"), "png");
  writeFileSync(join(dir, "products.json"), JSON.stringify(records));
  return dir;
}
const rec = (over: object = {}) => ({
  id: "s5e9p1-a", include: true,
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
