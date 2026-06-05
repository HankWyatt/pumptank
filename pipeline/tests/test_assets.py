from pumptank_pipeline.assets import _clean_name, _derive_symbol


def test_clean_name_camelcase():
    assert _clean_name("SmartTireCompany", {}, "id1") == "Smart Tire Company"
    assert _clean_name("BelloVerde", {}, "id2") == "Bello Verde"
    assert _clean_name("TheHappyBirdwatcher", {}, "id3") == "The Happy Birdwatcher"


def test_clean_name_allcaps_and_spaced_passthrough():
    assert _clean_name("ALL33", {}, "id4") == "ALL33"
    assert _clean_name("Already Spaced", {}, "id5") == "Already Spaced"


def test_clean_name_override_wins():
    assert _clean_name("Buzzy4Shots", {"id6": "Buzzy 4 Shots"}, "id6") == "Buzzy 4 Shots"


def test_derive_symbol_basic_and_suffix_strip():
    assert _derive_symbol("Smart Tire Company", 10) == "SMARTTIRE"
    assert _derive_symbol("Bello Verde", 10) == "BELLOVERDE"
    assert _derive_symbol("ALL33", 10) == "ALL33"


def test_derive_symbol_strips_leading_the_and_truncates():
    assert _derive_symbol("The Happy Birdwatcher", 10) == "HAPPYBIRDW"


def test_derive_symbol_strips_nonalnum_and_uppercases():
    assert _derive_symbol("Joye-bells!", 10) == "JOYEBELLS"


from pumptank_pipeline.models import Pitch
from pumptank_pipeline.assets import _is_junk_blurb, _compose_description

DISC = "Not affiliated. Not financial advice."


def _p(desc, name="Skyride", industry="Fitness/Sports/Outdoors", season=3, episode=13):
    return Pitch(id="s3e13p1-x", season=season, episode=episode, pitch_number=1,
                 company_name=name, industry=industry, description=desc, got_deal=False)


def test_is_junk_blurb():
    assert _is_junk_blurb("Skyride - Outdoor Recreation") is True
    assert _is_junk_blurb("Invisible Xero Shoes - Men and Women's Shoes") is True
    assert _is_junk_blurb("High-performance airless tires") is False
    assert _is_junk_blurb("Premium refrigerated pie") is False
    assert _is_junk_blurb(None) is False


def test_compose_description_keeps_real_blurb():
    d = _compose_description(_p("Premium refrigerated pie"), "Joyebells",
                             disclaimer=DISC, max_len=480)
    assert d.startswith("Premium refrigerated pie.")
    assert "Pitched on Shark Tank S3E13 — no deal." in d
    assert d.endswith(DISC)


def test_compose_description_templates_junk():
    d = _compose_description(_p("Skyride - Outdoor Recreation"), "Skyride",
                             disclaimer=DISC, max_len=480)
    assert d.startswith("Skyride, a Fitness/Sports/Outdoors product.")


def test_compose_description_truncates_blurb_only():
    long = "x" * 600
    d = _compose_description(_p(long), "Name", disclaimer=DISC, max_len=120)
    assert len(d) <= 120
    assert d.endswith(DISC)  # disclaimer never trimmed
    assert "…" in d


from pumptank_pipeline.models import Selection
from pumptank_pipeline.assets import generate_assets


def _sel(pid, name, rank, dev_buy=True, desc="A gadget"):
    # all products launch (include=True); tokens are gated on dev_buy for now
    return Pitch(id=pid, season=5, episode=1, pitch_number=1, company_name=name,
                 industry="Tech", description=desc, got_deal=False,
                 include=True, dev_buy=dev_buy,
                 selection=Selection(selected=dev_buy, rank=rank))


def test_generate_assets_only_dev_buy_get_tokens():
    out = generate_assets(
        [_sel("a", "Acme", 1, dev_buy=True), _sel("b", "Beta", None, dev_buy=False)],
        max_ticker_len=10, max_description_len=480, disclaimer="D.", name_overrides={})
    by_id = {p.id: p for p in out}
    assert by_id["a"].token is not None
    assert by_id["a"].token.symbol == "ACME"
    assert by_id["b"].token is None  # launched but no dev-buy -> no token (this task)


def test_generate_assets_dedupes_tickers():
    out = generate_assets(
        [_sel("r1", "Acme", 1), _sel("r2", "Acme", 2)],
        max_ticker_len=10, max_description_len=480, disclaimer="D.", name_overrides={})
    syms = sorted(p.token.symbol for p in out)
    assert syms == ["ACME", "ACME2"]


def test_compose_description_drops_blurb_when_only_tail_fits():
    tail = " Pitched on Shark Tank S3E13 — no deal. " + DISC
    d = _compose_description(_p("x" * 600), "Name", disclaimer=DISC, max_len=len(tail))
    assert d == tail.strip()      # blurb dropped, mandatory content kept
    assert "…" not in d
    assert len(d) <= len(tail)


def test_generate_assets_tkn_fallback_for_symbolless_name():
    out = generate_assets([_sel("z", "@#$%", 1)],
                          max_ticker_len=10, max_description_len=480,
                          disclaimer="D.", name_overrides={})
    assert out[0].token.symbol == "TKN1"
