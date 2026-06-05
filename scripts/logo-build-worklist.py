#!/usr/bin/env python3
"""Build the logo-discovery worklist: every product, split into small batch files
under data/logo-work/ for agent fan-out. Each record carries the context an agent
needs to find + confirm the right company's logo (name, domain, season/episode,
industry, blurb).

Usage:  python3 scripts/logo-build-worklist.py [batch_size]
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JSON_PATH = ROOT / "data" / "products.json"
WORK = ROOT / "data" / "logo-work"
BATCH = int(sys.argv[1]) if len(sys.argv) > 1 else 10


def main() -> int:
    records = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    (WORK / "batches").mkdir(parents=True, exist_ok=True)
    (WORK / "out").mkdir(exist_ok=True)

    todo = []
    for r in records:
        media = r.get("media") or {}
        todo.append({
            "id": r["id"],
            "company": r.get("company_name", ""),
            "website": media.get("former_website") or "",
            "season": r.get("season"),
            "episode": r.get("episode"),
            "industry": r.get("industry", ""),
            "desc": ((r.get("pitch") or {}).get("description") or "")[:100],
        })

    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]
    for i, b in enumerate(batches):
        (WORK / "batches" / f"batch-{i:03d}.json").write_text(
            json.dumps(b, ensure_ascii=False, indent=2), encoding="utf-8")

    manifest = {"total": len(todo), "batch_size": BATCH, "num_batches": len(batches)}
    (WORK / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
