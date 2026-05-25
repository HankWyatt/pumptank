import { expect, test } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Ledger } from "../src/ledger.js";

const path = () => join(mkdtempSync(join(tmpdir(), "led-")), "launch-ledger.json");

test("records and reads back; statusOf reflects last write", () => {
  const p = path();
  const l = new Ledger(p);
  l.record({ id: "a", mint: "M", status: "attempting", attempts: 1, ts: "t" });
  expect(l.statusOf("a")).toBe("attempting");
  l.record({ id: "a", mint: "M", signature: "S", status: "success", attempts: 1, ts: "t" });
  expect(l.statusOf("a")).toBe("success");
  expect(new Ledger(p).statusOf("a")).toBe("success"); // persisted across instances
});

test("statusOf is undefined for unknown id", () => {
  expect(new Ledger(path()).statusOf("nope")).toBeUndefined();
});

test("never stores a secret-looking field", () => {
  const p = path();
  const l = new Ledger(p);
  l.record({ id: "a", mint: "M", status: "success", attempts: 1, ts: "t" });
  const raw = readFileSync(p, "utf8");
  expect(raw).not.toMatch(/secret|privateKey|secretKey/i);
});
