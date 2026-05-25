import { expect, test } from "vitest";
import { previewCollect, assertCanBroadcast } from "../src/feescli.js";

test("previewCollect formats the claimable vault balance", () => {
  const line = previewCollect(2_500_000_000n);
  expect(line).toMatch(/2\.5/);
  expect(line).toMatch(/SOL/);
});

test("assertCanBroadcast throws without --confirm", () => {
  expect(() => assertCanBroadcast(false)).toThrow(/confirm/i);
});

test("assertCanBroadcast passes with --confirm", () => {
  expect(() => assertCanBroadcast(true)).not.toThrow();
});
