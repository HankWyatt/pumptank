import { expect, test, vi } from "vitest";
import { uploadTokenMetadata } from "../src/metadata.js";

const item = { id: "a", name: "Acme", symbol: "ACME", description: "no deal", imagePath: __filename, devBuy: true };

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
