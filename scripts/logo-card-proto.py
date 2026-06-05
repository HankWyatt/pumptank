#!/usr/bin/env python3
"""Prototype: render token cards with a company logo zone + reflowed layout.
Falls back to the original centered layout when no logo exists.
Renders a handful of samples to /tmp/logopilot/ for review."""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path("pipeline")))
from pumptank_pipeline import config, images as IM

PAL = config.IMAGE_PALETTE
SIZE = config.IMAGE_SIZE
FONT = config.FONT_DIR
BOLD = str(FONT / "Carlito-Bold.ttf")
REG = str(FONT / "Carlito-Regular.ttf")
LOGOS = Path("data/logos")


def _logo_luma(im):
    """Alpha-weighted mean luminance of the logo's visible pixels (0-255)."""
    small = im.convert("RGBA").resize((48, 48))
    tot = lum = 0.0
    for r, g, b, a in small.getdata():
        w = a / 255
        lum += (0.299 * r + 0.587 * g + 0.114 * b) * w
        tot += w
    return (lum / tot) if tot else 255


def _paste_logo(card, d, rid):
    """Draw the logo in the upper zone on an adaptive chip. Returns logo bottom-y."""
    p = LOGOS / f"{rid}.png"
    if not p.exists():
        return None
    lg = Image.open(p).convert("RGBA")
    box_w, box_h = 520, 232
    s = min(box_w / lg.size[0], box_h / lg.size[1])
    lg = lg.resize((max(1, int(lg.size[0] * s)), max(1, int(lg.size[1] * s))), Image.LANCZOS)
    lw, lh = lg.size
    light_logo = _logo_luma(lg) >= 175          # white/light logo -> goes on dark
    pad = 34
    chip_w, chip_h = lw + 2 * pad, lh + 2 * pad
    cx, cy = (SIZE - chip_w) // 2, 150
    if light_logo:
        # subtle dark panel for definition, logo sits on the card's dark world
        d.rounded_rectangle([cx, cy, cx + chip_w, cy + chip_h], radius=30,
                            fill=PAL["fin"])
    else:
        d.rounded_rectangle([cx, cy, cx + chip_w, cy + chip_h], radius=30,
                            fill=(255, 253, 247, 255))
    card.alpha_composite(lg, (cx + pad, cy + pad))
    return cy + chip_h


def render(rec, out):
    name = rec["token"]["name"]
    symbol = rec["token"]["symbol"]
    season, episode = rec["season"], rec["episode"]
    industry = rec.get("industry") or ""
    no_deal = not rec.get("got_deal")
    rid = rec["id"]

    card = Image.new("RGBA", (SIZE, SIZE), PAL["bg"])
    d = ImageDraw.Draw(card)
    d.polygon(IM._fin_polygon(SIZE), fill=PAL["fin"])
    d.text((IM.MARGIN, 64), "P U M P T A N K", font=ImageFont.truetype(BOLD, 40), fill=PAL["accent"])
    if no_deal:
        IM._draw_no_deal_badge(d, SIZE, {**PAL, "_bold": BOLD})

    logo_bottom = _paste_logo(card, d, rid)
    if logo_bottom:
        # reflowed: name below logo, then ticker/tag/footer
        lines, nf, lh = IM._fit_name(d, name, BOLD, SIZE - 2 * 90, 150, max_lines=2,
                                     size_hi=92, size_lo=40)
        y = 452
        for ln in lines:
            IM._centered(d, ln, nf, y, PAL["text"], SIZE); y += lh
        IM._centered(d, "$" + symbol, ImageFont.truetype(BOLD, 80), 612, PAL["accent"], SIZE)
        tag = f"SHARK TANK  ·  S{season} E{episode}  ·  {industry.upper()}".strip(" ·")
        IM._centered(d, tag, ImageFont.truetype(REG, 30), 730, PAL["muted"], SIZE)
    else:
        # original centered layout (no logo)
        lines, nf, lh = IM._fit_name(d, name, BOLD, SIZE - 2 * 80, 300)
        y = 360 - (lh * len(lines)) // 2
        for ln in lines:
            IM._centered(d, ln, nf, y, PAL["text"], SIZE); y += lh
        IM._centered(d, "$" + symbol, ImageFont.truetype(BOLD, IM.TICKER_SIZE), IM.TICKER_Y, PAL["accent"], SIZE)
        tag = f"SHARK TANK  ·  S{season} E{episode}  ·  {industry.upper()}".strip(" ·")
        IM._centered(d, tag, ImageFont.truetype(REG, IM.TAG_SIZE), IM.TAG_Y, PAL["muted"], SIZE)

    IM._centered(d, IM.FOOTER, ImageFont.truetype(REG, IM.MICRO_SIZE), IM.FOOTER_Y, PAL["muted"], SIZE)
    card.convert("RGB").save(out)
    print("wrote", out)


if __name__ == "__main__":
    d = {r["id"]: r for r in json.load(open("data/products.json"))}
    samples = ["s13e10p1129-smarttirecompany", "s15e2p1280-matador",
               "s13e1p1095-pashko", "s1e3p15-voyageairguitar",
               "s1e9p42-virtusphere", "s12e9p1025-all33"]
    for sid in samples:
        if sid in d:
            render(d[sid], f"/tmp/logopilot/proto-{sid}.png")
