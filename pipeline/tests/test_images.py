from pumptank_pipeline import config
from PIL import ImageFont


def test_vendored_fonts_present_and_load():
    for name in ("Carlito-Bold.ttf", "Carlito-Regular.ttf"):
        p = config.FONT_DIR / name
        assert p.exists(), f"missing vendored font {p}"
        ImageFont.truetype(str(p), 40)  # loads without raising


from PIL import Image, ImageDraw
from pumptank_pipeline.images import _fit_name
from pumptank_pipeline.models import Pitch

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


from pumptank_pipeline.models import TokenAssets, Selection
from pumptank_pipeline.images import (
    _draw_card, render_images, _fin_left_x, _should_draw_no_deal_badge,
    FOOTER, FOOTER_Y, MICRO_SIZE, TICKER_SIZE, TAG_SIZE, USABLE_W,
)

REG = str(config.FONT_DIR / "Carlito-Regular.ttf")


def _pitch(pid, dev_buy=True, got_deal=False, include=True, with_token=True):
    # all launched products (include=True) get a card; got_deal toggles the badge
    tok = TokenAssets(name="Acme Co", symbol="ACME", description="d") if with_token else None
    return Pitch(id=pid, season=5, episode=9, pitch_number=1, company_name="AcmeCo",
                 industry="Tech", got_deal=got_deal, include=include,
                 dev_buy=dev_buy, token=tok,
                 selection=Selection(selected=dev_buy, rank=1 if dev_buy else None))


def test_draw_card_dimensions():
    img = _draw_card("Smart Tire Company", "SMARTTIRE", 13, 10, "Automotive",
                     size=1000, palette=config.IMAGE_PALETTE, font_dir=config.FONT_DIR)
    assert img.size == (1000, 1000)
    assert img.mode == "RGB"


def test_ticker_and_tag_within_usable_width():
    d = _d()
    bold = ImageFont.truetype(BOLD, TICKER_SIZE)
    reg = ImageFont.truetype(REG, TAG_SIZE)
    assert d.textlength("$" + "W" * 10, font=bold) <= USABLE_W
    assert d.textlength("SHARK TANK  ·  S16 E22  ·  FITNESS/SPORTS/OUTDOORS",
                        font=reg) <= USABLE_W


def test_footer_clears_fin():
    d = _d()
    fw = d.textlength(FOOTER, font=ImageFont.truetype(REG, MICRO_SIZE))
    footer_right = 500 + fw / 2
    assert footer_right < _fin_left_x(FOOTER_Y, 1000)


def test_should_draw_no_deal_badge():
    # no-deal -> badge; deal -> no badge (generic tribute, no "GOT A DEAL" badge)
    assert _should_draw_no_deal_badge(_pitch("a", got_deal=False)) is True
    assert _should_draw_no_deal_badge(_pitch("b", got_deal=True)) is False


def test_render_images_all_launched(tmp_path):
    # dev-buy no-deal, non-dev-buy no-deal, and a deal pitch all get cards
    out = render_images(
        [_pitch("a", dev_buy=True, got_deal=False),
         _pitch("b", dev_buy=False, got_deal=False),
         _pitch("d", dev_buy=False, got_deal=True)],
        out_dir=tmp_path, font_dir=config.FONT_DIR,
        size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE)
    by = {p.id: p for p in out}
    for pid in ("a", "b", "d"):
        assert (tmp_path / f"{pid}.png").exists()
        assert by[pid].image_url.endswith(f"{pid}.png")
        assert by[pid].image_source == "generated"
    im = Image.open(tmp_path / "a.png")
    assert im.size == (1000, 1000) and im.format == "PNG"


def test_render_images_skips_unlaunched(tmp_path):
    out = render_images(
        [_pitch("a", include=True), _pitch("x", include=False, with_token=False)],
        out_dir=tmp_path, font_dir=config.FONT_DIR,
        size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE)
    by = {p.id: p for p in out}
    assert (tmp_path / "a.png").exists() and not (tmp_path / "x.png").exists()
    assert by["x"].image_source == "none"


def test_render_images_deal_pitch_renders_card(tmp_path):
    out = render_images([_pitch("d", dev_buy=False, got_deal=True)],
                        out_dir=tmp_path, font_dir=config.FONT_DIR,
                        size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE)
    p = out[0]
    assert (tmp_path / "d.png").exists()
    assert p.image_url.endswith("d.png") and p.image_source == "generated"
    assert _should_draw_no_deal_badge(p) is False  # deal -> no-badge path taken


def test_render_images_deterministic(tmp_path):
    render_images([_pitch("a", True)], out_dir=tmp_path / "x", font_dir=config.FONT_DIR,
                  size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE)
    render_images([_pitch("a", True)], out_dir=tmp_path / "y", font_dir=config.FONT_DIR,
                  size=config.IMAGE_SIZE, palette=config.IMAGE_PALETTE)
    assert (tmp_path / "x/a.png").read_bytes() == (tmp_path / "y/a.png").read_bytes()
