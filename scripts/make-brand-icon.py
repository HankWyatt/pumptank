#!/usr/bin/env python3
"""Generate PUMPTANK's brand icon set (flat seafoam tank glyph on navy) into web/app/.

A photoreal logo turns to mud below ~64px, so the favicon is a purpose-drawn glyph
in the deep-water palette that stays legible at 16px. Outputs Next App Router files:
  web/app/icon.png (512), apple-icon.png (180), favicon.ico (16/32/48).
The social/OG card (opengraph-image.png) is the separate photo crop, not made here.

Usage:  python3 scripts/make-brand-icon.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "web" / "app"
NAVY = "#0a1c2c"; NAVY2 = "#06121e"; SEA = (42, 216, 192, 255)
SS = 4                      # supersample for clean edges
S = 512 * SS

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
def rr(box, r, fill): d.rounded_rectangle([c * SS for c in box], radius=r * SS, fill=fill)

# tile
rr((8, 8, 504, 504), 104, NAVY2)
rr((22, 22, 490, 490), 92, NAVY)
# tank (seafoam, barrel right)
rr((300, 212, 476, 242), 14, SEA)
rr((460, 200, 484, 254), 8, SEA)
rr((178, 168, 330, 256), 30, SEA)
d.ellipse([c * SS for c in (236, 150, 286, 196)], fill=SEA)
rr((96, 250, 432, 330), 22, SEA)
rr((70, 322, 452, 408), 40, SEA)
for cx in range(118, 420, 58):
    d.ellipse([c * SS for c in (cx - 22, 344, cx + 22, 388)], fill=NAVY)
    d.ellipse([c * SS for c in (cx - 9, 357, cx + 9, 375)], fill=SEA)

icon = img.resize((512, 512), Image.LANCZOS)
icon.save(OUT / "icon.png")
icon.resize((180, 180), Image.LANCZOS).save(OUT / "apple-icon.png")
icon.save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
print(f"✓ wrote icon.png, apple-icon.png, favicon.ico to {OUT}")
