from pumptank_pipeline import config
from PIL import ImageFont


def test_vendored_fonts_present_and_load():
    for name in ("Carlito-Bold.ttf", "Carlito-Regular.ttf"):
        p = config.FONT_DIR / name
        assert p.exists(), f"missing vendored font {p}"
        ImageFont.truetype(str(p), 40)  # loads without raising


from PIL import Image, ImageDraw
from pumptank_pipeline.images import _fit_name

BOLD = str(config.FONT_DIR / "Carlito-Bold.ttf")


def _d():
    return ImageDraw.Draw(Image.new("RGB", (1000, 1000)))


def test_fit_name_short_single_line():
    lines, font, lh = _fit_name(_d(), "Joyebells", BOLD, 840, 300)
    assert lines == ["Joyebells"]


def test_fit_name_wraps_long():
    lines, font, lh = _fit_name(_d(), "50 State Capitals in 50 Minutes", BOLD, 840, 300)
    assert 1 < len(lines) <= 3


def test_fit_name_clips_pathological_single_word():
    lines, font, lh = _fit_name(_d(), "Supercalifragilistic" * 4, BOLD, 840, 300)
    assert len(lines) <= 3
    assert lines[-1].endswith("…")
