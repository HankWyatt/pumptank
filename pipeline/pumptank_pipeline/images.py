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


def _draw_card(name, symbol, season, episode, industry, *, size, palette, font_dir):
    font_dir = Path(font_dir)
    bold = str(font_dir / "Carlito-Bold.ttf")
    reg = str(font_dir / "Carlito-Regular.ttf")
    img = Image.new("RGB", (size, size), palette["bg"])
    d = ImageDraw.Draw(img)
    d.polygon(_fin_polygon(size), fill=palette["fin"])
    d.text((MARGIN, 64), "P U M P T A N K", font=ImageFont.truetype(bold, 40),
           fill=palette["accent"])
    pf = ImageFont.truetype(bold, 34)
    lab = "NO DEAL"
    tw = d.textlength(lab, font=pf)
    x2 = size - MARGIN
    d.rounded_rectangle([x2 - tw - 44, 58, x2, 116], radius=28,
                        outline=palette["accent"], width=3)
    d.text((x2 - tw - 22, 64), lab, font=pf, fill=palette["accent"])
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


def render_images(pitches, *, out_dir, font_dir, size, palette):
    """Render + save a card PNG for each include==True pitch; set its image fields."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for p in pitches:
        if not (p.include and p.token):
            continue
        img = _draw_card(p.token.name, p.token.symbol, p.season, p.episode,
                         p.industry or "", size=size, palette=palette, font_dir=font_dir)
        img.save(out_dir / f"{p.id}.png")
        p.image_url = f"{out_dir.name}/{p.id}.png"
        p.image_source = "generated"
    return pitches
