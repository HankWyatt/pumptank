import { expect, test } from "vitest";
import type { LaunchItem } from "../src/types.js";

test("types module imports", () => {
  const item: LaunchItem = { id: "x", name: "X", symbol: "X", description: "d", imagePath: "/x.png", devBuy: false };
  expect(item.symbol).toBe("X");
});
