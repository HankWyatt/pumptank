from pumptank_pipeline import config
from PIL import ImageFont


def test_vendored_fonts_present_and_load():
    for name in ("Carlito-Bold.ttf", "Carlito-Regular.ttf"):
        p = config.FONT_DIR / name
        assert p.exists(), f"missing vendored font {p}"
        ImageFont.truetype(str(p), 40)  # loads without raising
