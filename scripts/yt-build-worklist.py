#!/usr/bin/env python3
"""Build the YouTube-discovery worklist: every product missing media.youtube_url,
split into small batch files under data/yt-work/ for agent fan-out.

Each batch file is a JSON array of compact records (id, company, season, episode,
industry, founders, desc) — enough context for an agent to search + verify the
right Shark Tank segment without re-reading the 1.8MB products.json.

Usage:  python3 scripts/yt-build-worklist.py [batch_size]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "products.json"
WORK = ROOT / "data" / "yt-work"
BATCH = int(sys.argv[1]) if len(sys.argv) > 1 else 10


def main() -> int:
    records = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "batches").mkdir(exist_ok=True)
    (WORK / "out").mkdir(exist_ok=True)

    todo = []
    for r in records:
        if (r.get("media") or {}).get("youtube_url"):
            continue  # already has a link — skip
        desc = ((r.get("pitch") or {}).get("description") or "")[:120]
        todo.append({
            "id": r["id"],
            "company": r.get("company_name", ""),
            "season": r.get("season"),
            "episode": r.get("episode"),
            "industry": r.get("industry", ""),
            "founders": r.get("founders", []),
            "desc": desc,
        })

    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
    for i, b in enumerate(batches):
        (WORK / "batches" / f"batch-{i:03d}.json").write_text(
            json.dumps(b, ensure_ascii=False, indent=2), encoding="utf-8")

    manifest = {"total_missing": len(todo), "batch_size": BATCH,
                "num_batches": len(batches)}
    (WORK / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
