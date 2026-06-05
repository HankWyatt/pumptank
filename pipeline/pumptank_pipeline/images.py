from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .models import Pitch


def _wrap(draw, text, font_path, size, max_w):
    f = ImageFont.truetype(font_path, size)
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return (lines or [""]), f


def _clip_to_width(draw, line, font, max_w):
    if draw.textlength(line, font=font) <= max_w:
        return line
    s = line
    while s and draw.textlength(s + "…", font=font) > max_w:
        s = s[:-1]
    return (s + "…") if s else "…"


def _fit_name(draw, text, font_path, max_w, max_h, max_lines=3,
              size_hi=120, size_lo=44, step=4):
    """Largest size whose wrap fits the box in <= max_lines; else clip at min size."""
    for size in range(size_hi, size_lo - 1, -step):
        lines, f = _wrap(draw, text, font_path, size, max_w)
        a, d = f.getmetrics()
        lh = a + d + 8
        fits_w = all(draw.textlength(ln, font=f) <= max_w for ln in lines)
        if fits_w and len(lines) <= max_lines and lh * len(lines) <= max_h:
            return lines, f, lh
    lines, f = _wrap(draw, text, font_path, size_lo, max_w)
    a, d = f.getmetrics()
    lh = a + d + 8
    had_more = len(lines) > max_lines
    lines = [_clip_to_width(draw, ln, f, max_w) for ln in lines[:max_lines]]
    if had_more and not lines[-1].endswith("…"):
        lines[-1] = _clip_to_width(draw, lines[-1] + "…", f, max_w)
    return lines, f, lh


# --- layout (for IMAGE_SIZE = 1000) ---
MARGIN = 70
TICKER_SIZE = 96
TICKER_Y = 560
TAG_SIZE = 32
TAG_Y = 706
MICRO_SIZE = 23
FOOTER_Y = 924
USABLE_W = 940  # IMAGE_SIZE - 2*30; worst ticker 919px and longest tag 719px both fit
FOOTER = "Unofficial tribute & parody  ·  not affiliated  ·  not financial advice"


def _fin_polygon(size):
    return [(size, size), (size, int(size * 0.8)), (int(size * 0.8), size)]


def _fin_left_x(y, size):
    """Left edge x of the corner fin at height y (for y in [0.8*size, size])."""
    return 1.8 * size - y


def _centered(draw, text, font, y, fill, width):
    w = draw.textlength(text, font=font)
    draw.text(((width - w) // 2, y), text, font=font, fill=fill)


def _should_draw_no_deal_badge(pitch) -> bool:
    """No-deal pitches get the vermilion 'NO DEAL' badge; deal pitches don't
    (generic tribute, no 'GOT A DEAL' badge)."""
    return not pitch.got_deal


def _draw_no_deal_badge(d, size, palette):
    pf = ImageFont.truetype(palette["_bold"], 34)
    lab = "NO DEAL"
    tw = d.textlength(lab, font=pf)
    x2 = size - MARGIN
    d.rounded_rectangle([x2 - tw - 44, 58, x2, 116], radius=28,
                        outline=palette["accent"], width=3)
    d.text((x2 - tw - 22, 64), lab, font=pf, fill=palette["accent"])


# --- logo card variant (when a company logo PNG is available) ---
LOGO_BOX_W = 520        # logo fits inside this box (preserve aspect)
LOGO_BOX_H = 232
LOGO_CHIP_Y = 150       # top of the chip
LOGO_CHIP_PAD = 34
LOGO_LIGHT_LUMA = 175   # mean visible-pixel luminance >= this => treat as a light/white logo
NAME_ZONE = (400, 596)  # name is vertically centered in this band, below the logo
LOGO_TICKER_Y = 612
LOGO_TICKER_SIZE = 80
LOGO_TAG_Y = 732


def _logo_luma(im):
    """Alpha-weighted mean luminance (0-255) of a logo's visible pixels."""
    small = im.convert("RGBA").resize((48, 48))
    lum = tot = 0.0
    for r, g, b, a in small.getdata():
        w = a / 255
        lum += (0.299 * r + 0.587 * g + 0.114 * b) * w
        tot += w
    return (lum / tot) if tot else 255.0


def _paste_logo(card, d, logo_path, palette):
    """Draw the logo on an adaptive chip in the upper zone. Dark/colored logos get a
    cream chip; light/white logos sit on a dark panel so they stay legible."""
    lg = Image.open(logo_path).convert("RGBA")
    s = min(LOGO_BOX_W / lg.size[0], LOGO_BOX_H / lg.size[1])
    lg = lg.resize((max(1, int(lg.size[0] * s)), max(1, int(lg.size[1] * s))), Image.LANCZOS)
    lw, lh = lg.size
    chip_w, chip_h = lw + 2 * LOGO_CHIP_PAD, lh + 2 * LOGO_CHIP_PAD
    cx, cy = (card.size[0] - chip_w) // 2, LOGO_CHIP_Y
    fill = palette["fin"] if _logo_luma(lg) >= LOGO_LIGHT_LUMA else (255, 253, 247, 255)
    d.rounded_rectangle([cx, cy, cx + chip_w, cy + chip_h], radius=30, fill=fill)
    card.alpha_composite(lg, (cx + LOGO_CHIP_PAD, cy + LOGO_CHIP_PAD))


def _draw_card(name, symbol, season, episode, industry, *, size, palette, font_dir,
               no_deal_badge=True, logo_path=None):
    font_dir = Path(font_dir)
    bold = str(font_dir / "Carlito-Bold.ttf")
    reg = str(font_dir / "Carlito-Regular.ttf")
    has_logo = bool(logo_path) and Path(logo_path).exists()

    base_mode = "RGBA" if has_logo else "RGB"
    img = Image.new(base_mode, (size, size), palette["bg"])
    d = ImageDraw.Draw(img)
    d.polygon(_fin_polygon(size), fill=palette["fin"])
    d.text((MARGIN, 64), "P U M P T A N K", font=ImageFont.truetype(bold, 40),
           fill=palette["accent"])
    if no_deal_badge:
        _draw_no_deal_badge(d, size, {**palette, "_bold": bold})

    if has_logo:
        _paste_logo(img, d, logo_path, palette)
        lines, nf, lh = _fit_name(d, name, bold, size - 2 * 90, 150,
                                  max_lines=2, size_hi=92, size_lo=40)
        block = lh * len(lines)
        y = NAME_ZONE[0] + (NAME_ZONE[1] - NAME_ZONE[0] - block) // 2
        for ln in lines:
            _centered(d, ln, nf, y, palette["text"], size)
            y += lh
        _centered(d, "$" + symbol, ImageFont.truetype(bold, LOGO_TICKER_SIZE),
                  LOGO_TICKER_Y, palette["accent"], size)
        tag = f"SHARK TANK  ·  S{season} E{episode}  ·  {industry.upper()}".strip(" ·")
        _centered(d, tag, ImageFont.truetype(reg, 30), LOGO_TAG_Y, palette["muted"], size)
        _centered(d, FOOTER, ImageFont.truetype(reg, MICRO_SIZE), FOOTER_Y,
                  palette["muted"], size)
        return img.convert("RGB")

    # --- no logo: original centered layout (kept byte-identical) ---
    lines, nf, lh = _fit_name(d, name, bold, size - 2 * 80, 300)
    y = 360 - (lh * len(lines)) // 2
    for ln in lines:
        _centered(d, ln, nf, y, palette["text"], size)
        y += lh
    _centered(d, "$" + symbol, ImageFont.truetype(bold, TICKER_SIZE), TICKER_Y,
              palette["accent"], size)
    tag = f"SHARK TANK  ·  S{season} E{episode}  ·  {industry.upper()}".strip(" ·")
    _centered(d, tag, ImageFont.truetype(reg, TAG_SIZE), TAG_Y, palette["muted"], size)
    _centered(d, FOOTER, ImageFont.truetype(reg, MICRO_SIZE), FOOTER_Y,
              palette["muted"], size)
    return img


def render_images(pitches, *, out_dir, font_dir, size, palette, logo_dir=None):
    """Render + save a card PNG for every launched (include==True) pitch with a
    token; set its image fields.

    No-deal pitches get the vermilion 'NO DEAL' badge; deal pitches get the same
    card minus the badge (generic tribute) — see ``_should_draw_no_deal_badge``.
    When ``logo_dir`` is given and ``{logo_dir}/{id}.png`` exists, the card uses the
    logo variant; otherwise it falls back to the original text-only layout.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    logo_dir = Path(logo_dir) if logo_dir else None
    for p in pitches:
        if not (p.include and p.token):
            continue
        logo_path = None
        if logo_dir:
            cand = logo_dir / f"{p.id}.png"
            if cand.exists():
                logo_path = cand
        img = _draw_card(p.token.name, p.token.symbol, p.season, p.episode,
                         p.industry or "", size=size, palette=palette, font_dir=font_dir,
                         no_deal_badge=_should_draw_no_deal_badge(p), logo_path=logo_path)
        img.save(out_dir / f"{p.id}.png")
        p.image_url = f"{out_dir.name}/{p.id}.png"
        p.image_source = "generated"
    return pitches
