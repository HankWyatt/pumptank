import { expect, test, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uploadTokenMetadata, metadataUriFor, loadMetadataUris } from "../src/metadata.js";

const item = { id: "a", name: "Acme", symbol: "ACME", description: "no deal", imagePath: __filename, devBuy: true };

// --- self-hosted metadata URI lookup (replaces the pump.fun IPFS upload) ---

test("metadataUriFor returns the pre-built uri for the item id", () => {
  const uris = { a: "https://meta.thepumptank.fun/m/a.json" };
  expect(metadataUriFor({ id: "a" }, uris)).toBe("https://meta.thepumptank.fun/m/a.json");
});

test("metadataUriFor throws when the id is missing from the map", () => {
  expect(() => metadataUriFor({ id: "nope" }, {})).toThrow(/no metadata uri/i);
});

test("metadataUriFor throws on a non-https uri", () => {
  expect(() => metadataUriFor({ id: "a" }, { a: "http://x/m/a.json" })).toThrow(/https/i);
});

test("metadataUriFor throws when the uri exceeds 200 chars", () => {
  const long = "https://meta.thepumptank.fun/m/" + "x".repeat(200) + ".json";
  expect(() => metadataUriFor({ id: "a" }, { a: long })).toThrow(/too long/i);
});

test("loadMetadataUris reads data/metadata/uris.json under the data dir", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-"));
  mkdirSync(join(dir, "metadata"), { recursive: true });
  writeFileSync(join(dir, "metadata", "uris.json"), JSON.stringify({ a: "https://meta.thepumptank.fun/m/a.json" }));
  expect(loadMetadataUris(dir)).toEqual({ a: "https://meta.thepumptank.fun/m/a.json" });
  rmSync(dir, { recursive: true, force: true });
});

test("loadMetadataUris throws a build-the-map hint when the file is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "md-"));
  expect(() => loadMetadataUris(dir)).toThrow(/build-token-metadata/i);
  rmSync(dir, { recursive: true, force: true });
});

test("posts multipart to the pump.fun IPFS endpoint and returns metadataUri", async () => {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ metadataUri: "https://ipfs.io/ipfs/CID" }),
  });
  const uri = await uploadTokenMetadata(item, fetchImpl as any);
  expect(uri).toBe("https://ipfs.io/ipfs/CID");
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe("https://pump.fun/api/ipfs");
  expect(init.method).toBe("POST");
  expect(init.body).toBeInstanceOf(FormData);
});

test("throws on a non-OK response", async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" });
  await expect(uploadTokenMetadata(item, fetchImpl as any)).rejects.toThrow(/ipfs upload failed: 503/i);
});

test("throws if the returned uri exceeds 200 chars", async () => {
  const long = "https://ipfs.io/ipfs/" + "x".repeat(200);
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ metadataUri: long }) });
  await expect(uploadTokenMetadata(item, fetchImpl as any)).rejects.toThrow(/uri too long/i);
});
