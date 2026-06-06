#!/usr/bin/env python3
"""Generate self-hosted token metadata JSON for every launched token.

For each include==true product (plus the $PUMPTANK index token) writes a Metaplex/
pump.fun-style metadata JSON to data/metadata/m/<id>.json, and an id->URI map to
data/metadata/uris.json that the launcher reads (instead of uploading to pump.fun's
IPFS endpoint). Also writes data/metadata/images.json (id -> local source PNG) for
the Spaces upload script.

The on-chain `uri` for each mint is `<BASE>/m/<id>.json` and is IMMUTABLE once set
(pump.fun nulls the update authority). The JSON *content* at that URL stays editable
(it lives on our Spaces), so name/description/image/socials can be fixed post-launch
— only the URL string is frozen. BASE is a custom domain we control forever so the
storage backend behind it stays swappable.

Usage:  python3 scripts/build-token-metadata.py
"""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRODUCTS = ROOT / "data" / "products.json"
OUT_DIR = ROOT / "data" / "metadata"
M_DIR = OUT_DIR / "m"

# Host for the on-chain metadata + image URLs. Defaults to the DO Spaces built-in
# CDN endpoint for the `pumptankmeta` Space (nyc3) -- no Cloudflare/custom domain
# needed. This is baked into immutable on-chain URIs, so it commits us to keeping
# this Space/bucket name on DO. Override with META_BASE to use a custom domain.
BASE = os.environ.get("META_BASE", "https://pumptankmeta.nyc3.cdn.digitaloceanspaces.com")
SITE = "https://thepumptank.fun"
CREATED_ON = "https://pump.fun"
MAX_URI = 200  # pump.fun create_v2 hard limit on the on-chain uri string

# Index token. KEEP IN SYNC with launcher/src/index-launch.ts (INDEX_ID/NAME/SYMBOL/DESCRIPTION).
INDEX_ID = "index-pumptank"
INDEX_NAME = "PUMPTANK"
INDEX_SYMBOL = "PUMPTANK"
INDEX_DESCRIPTION = (
    "PUMPTANK — the index token of the unofficial Shark Tank tribute. Trading fees from "
    "every product token flow to the PUMPTANK treasury. Unofficial parody; not affiliated "
    "with Shark Tank/ABC/Sony; not financial advice; no promise of value."
)


def build_one(tid, name, symbol, description, image_url, website, youtube=None):
    md = {
        "name": name,
        "symbol": symbol,
        "description": description,
        "image": image_url,
        "createdOn": CREATED_ON,
        "website": website,
    }
    if youtube:
        md["youtube"] = youtube
    return md


def main():
    records = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    M_DIR.mkdir(parents=True, exist_ok=True)

    uris = {}
    images = {}  # id -> local source PNG (relative to repo root), for the upload script

    n = 0
    for r in records:
        tok = r.get("token") or {}
        if not (r.get("include") and tok.get("name")):
            continue
        tid = r["id"]
        media = r.get("media") or {}
        md = build_one(
            tid, tok["name"], tok.get("symbol", ""), tok.get("description", ""),
            image_url=f"{BASE}/img/{tid}.png",
            website=f"{SITE}/token/{tid}",
            youtube=media.get("youtube_url"),
        )
        (M_DIR / f"{tid}.json").write_text(json.dumps(md, ensure_ascii=False, indent=2), encoding="utf-8")
        uris[tid] = f"{BASE}/m/{tid}.json"
        images[tid] = f"data/token_images/{tid}.png"
        n += 1

    # Index token ($PUMPTANK)
    idx = build_one(
        INDEX_ID, INDEX_NAME, INDEX_SYMBOL, INDEX_DESCRIPTION,
        image_url=f"{BASE}/img/{INDEX_ID}.png", website=SITE,
    )
    (M_DIR / f"{INDEX_ID}.json").write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")
    uris[INDEX_ID] = f"{BASE}/m/{INDEX_ID}.json"
    images[INDEX_ID] = "data/index/pumptanklogo.png"

    (OUT_DIR / "uris.json").write_text(json.dumps(dict(sorted(uris.items())), indent=2), encoding="utf-8")
    (OUT_DIR / "images.json").write_text(json.dumps(dict(sorted(images.items())), indent=2), encoding="utf-8")

    longest = max(uris.values(), key=len)
    over = [u for u in uris.values() if len(u) > MAX_URI]
    print(json.dumps({
        "product_json": n,
        "total_uris": len(uris),
        "max_uri_len": len(longest),
        "longest_uri": longest,
        "over_200": over,
    }, indent=2))
    if over:
        raise SystemExit(f"ERROR: {len(over)} uris exceed {MAX_URI} chars")


if __name__ == "__main__":
    main()
