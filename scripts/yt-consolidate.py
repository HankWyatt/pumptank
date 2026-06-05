#!/usr/bin/env python3
"""Consolidate verified YouTube links into products.json + regenerate the worksheet.

Reads the discovery output under data/yt-work/out/ (verified-*.json is source of
truth; found-*.json fills the few ids a verify agent dropped). Writes each kept
link into products.json's media.youtube_url, leaving rejected / null / blocked
ids untouched (stay null). Idempotent.

Also regenerates docs/youtube-links.csv as the FULL worksheet — every product
(id, company, season, episode, youtube) with links filled where known — replacing
the old curated-100 worksheet.

A blocklist file data/yt-work/block-ids.txt (one id per line, # comments ok) lets
the audit force specific ids back to null (e.g. the shared-clip false positives).

Usage:  python3 scripts/yt-consolidate.py [--dry-run]
"""
import csv
import json
import glob
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "products.json"
OUT = ROOT / "data" / "yt-work" / "out"
BLOCK = ROOT / "data" / "yt-work" / "block-ids.txt"
CSV_PATH = ROOT / "docs" / "youtube-links.csv"
DRY = "--dry-run" in sys.argv


def load_dir(pat):
    out = {}
    for f in sorted(glob.glob(str(OUT / pat))):
        for e in json.load(open(f, encoding="utf-8")):
            out[e["id"]] = e
    return out


def main() -> int:
    records = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    verified = load_dir("verified-*.json")
    found = load_dir("found-*.json")

    blocked = set()
    if BLOCK.exists():
        for line in BLOCK.read_text().splitlines():
            s = line.split("#", 1)[0].strip()
            if s:
                blocked.add(s)

    set_count = preserved = blocked_hit = 0
    for r in records:
        rid = r["id"]
        media = r.setdefault("media", {})
        if media.get("youtube_url"):
            preserved += 1
            continue  # pre-existing link — leave as is
        v = verified.get(rid)
        url = None
        if v and v.get("verdict") == "keep" and v.get("youtube_url"):
            url = v["youtube_url"]
        elif rid not in verified:  # verify dropped it; fall back to found if confident
            fe = found.get(rid)
            if fe and fe.get("confidence") in ("high", "medium") and fe.get("youtube_url"):
                url = fe["youtube_url"]
        if url and rid in blocked:
            blocked_hit += 1
            url = None
        if url:
            media["youtube_url"] = url
            set_count += 1

    if not DRY:
        JSON_PATH.write_text(
            json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        # regenerate the full worksheet
        with CSV_PATH.open("w", encoding="utf-8", newline="") as f:
            w = csv.writer(f)
            w.writerow(["id", "company", "season", "episode", "youtube"])
            for r in records:
                w.writerow([r["id"], r.get("company_name", ""),
                            f"S{r.get('season')}E{r.get('episode')}",
                            (r.get("media") or {}).get("youtube_url") or ""])

    total_links = sum(1 for r in records if (r.get("media") or {}).get("youtube_url"))
    print(json.dumps({
        "newly_set": set_count, "preserved_existing": preserved,
        "blocked_to_null": blocked_hit, "total_links_now": total_links,
        "total_products": len(records), "dry_run": DRY,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
