#!/usr/bin/env python3
"""Merge filled YouTube links from docs/youtube-links.csv into data/products.json.

Sets each record's media.youtube_url from the CSV's `youtube` column (matched by
`id`). Accepts any link form (watch?v=, youtu.be, /embed/, or a bare 11-char id) —
the site's EpisodeEmbed normalizes it at render time, so paste whatever's handy.
Rows left blank are skipped (stay null). Idempotent; safe to re-run.

Usage:  python3 scripts/merge-youtube.py [path/to/youtube-links.csv]
"""
import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs" / "youtube-links.csv"
JSON_PATH = ROOT / "data" / "products.json"


def main() -> int:
    records = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    by_id = {r["id"]: r for r in records}

    set_count = 0
    cleared = 0
    unknown: list[str] = []
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            rid = (row.get("id") or "").strip()
            if not rid:
                continue
            rec = by_id.get(rid)
            if rec is None:
                unknown.append(rid)
                continue
            link = (row.get("youtube") or "").strip()
            rec.setdefault("media", {})
            if link:
                if rec["media"].get("youtube_url") != link:
                    set_count += 1
                rec["media"]["youtube_url"] = link
            elif rec["media"].get("youtube_url"):
                # blank cell clears a previously set link
                rec["media"]["youtube_url"] = None
                cleared += 1

    JSON_PATH.write_text(
        json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    print(f"✓ merged: {set_count} link(s) set, {cleared} cleared")
    if unknown:
        print(f"⚠ {len(unknown)} unknown id(s) skipped: {', '.join(unknown[:5])}"
              + (" …" if len(unknown) > 5 else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
