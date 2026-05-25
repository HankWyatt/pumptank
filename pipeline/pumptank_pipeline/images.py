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
