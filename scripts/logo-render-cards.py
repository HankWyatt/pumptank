#!/usr/bin/env python3
"""Re-render every token card from the CURRENT products.json, baking in a company
logo (from data/logos/{id}.png) when one exists, else the original text-only card.

Reads products.json but does NOT modify it — only overwrites data/token_images/*.png.
This avoids a full pipeline run (which would wipe merged youtube_url links).

Usage:  python3 scripts/logo-render-cards.py
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
from pumptank_pipeline import config
from pumptank_pipeline.images import _draw_card

PRODUCTS = config.DEFAULT_OUTPUT
OUT = config.IMAGE_DIR
LOGOS = config.LOGO_DIR


def main():
    records = json.loads(PRODUCTS.read_text(encoding="utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    n_logo = n_text = 0
    for r in records:
        tok = r.get("token") or {}
        if not (r.get("include") and tok.get("name")):
            continue
        logo = LOGOS / f"{r['id']}.png"
        has_logo = logo.exists()
        img = _draw_card(
            tok["name"], tok.get("symbol", ""), r.get("season"), r.get("episode"),
            r.get("industry") or "", size=config.IMAGE_SIZE,
            palette=config.IMAGE_PALETTE, font_dir=config.FONT_DIR,
            no_deal_badge=not r.get("got_deal"),
            logo_path=str(logo) if has_logo else None,
        )
        img.save(OUT / f"{r['id']}.png")
        if has_logo:
            n_logo += 1
        else:
            n_text += 1
    print(json.dumps({"logo_cards": n_logo, "text_cards": n_text,
                      "total": n_logo + n_text}))


if __name__ == "__main__":
    main()
