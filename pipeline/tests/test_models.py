from pumptank_pipeline.models import Pitch, Product, to_product_fields


def test_pitch_minimal():
    p = Pitch(id="s5e9p1-doorbot", season=5, episode=9, pitch_number=1,
              company_name="DoorBot", got_deal=False)
    assert p.founders == []
    assert p.got_deal is False


def test_product_is_nested_and_defaults():
    prod = Product(id="s5e9p1-doorbot", season=5, episode=9, pitch_number=1,
                   company_name="DoorBot", pitch={"ask_amount": 700000})
    assert prod.outcome.got_deal is False
    assert prod.got_deal is False
    assert prod.media.image_source == "none"
    assert prod.include is True
    assert prod.dev_buy is False
    assert prod.token is None


def test_product_json_schema_generates():
    schema = Product.model_json_schema()
    assert schema["type"] == "object"
    assert "media" in schema["properties"]


def test_selection_defaults():
    from pumptank_pipeline.models import Selection
    s = Selection()
    assert s.selected is False
    assert s.rank is None
    assert s.score is None
    assert s.excluded_reason is None


def test_to_product_fields_wires_website_viewership_selection():
    from pumptank_pipeline.models import Pitch, Product, to_product_fields, Selection
    p = Pitch(id="x", season=5, episode=1, pitch_number=1, company_name="X",
              founders=["A"], company_website="https://x", us_viewership=4.2,
              selection=Selection(selected=True, rank=3, score=0.9),
              include=True, got_deal=False)
    prod = Product(**to_product_fields(p))
    assert prod.media.former_website == "https://x"
    assert prod.us_viewership == 4.2
    assert prod.selection.rank == 3
    assert prod.selection.selected is True
    assert prod.include is True


def test_token_assets_defaults():
    from pumptank_pipeline.models import TokenAssets
    t = TokenAssets(name="Smart Tire Company", symbol="SMARTTIRE", description="x")
    assert t.mint is None


def test_to_product_fields_carries_got_deal_and_dev_buy():
    # got_deal flows to BOTH the top-level field and Outcome; dev_buy threads through.
    deal = Pitch(id="d", season=5, episode=1, pitch_number=1, company_name="Deal Co",
                 got_deal=True, dev_buy=False)
    prod = Product(**to_product_fields(deal))
    assert prod.got_deal is True
    assert prod.outcome.got_deal is True
    assert prod.dev_buy is False

    nodeal = Pitch(id="n", season=5, episode=1, pitch_number=1, company_name="No Deal Co",
                   got_deal=False, dev_buy=True)
    prod = Product(**to_product_fields(nodeal))
    assert prod.got_deal is False
    assert prod.outcome.got_deal is False
    assert prod.dev_buy is True


def test_to_product_fields_passes_token():
    from pumptank_pipeline.models import Pitch, Product, to_product_fields, TokenAssets
    p = Pitch(id="x", season=5, episode=1, pitch_number=1, company_name="X",
              token=TokenAssets(name="X Co", symbol="XCO", description="d"),
              got_deal=False)
    prod = Product(**to_product_fields(p))
    assert prod.token.symbol == "XCO"
    assert prod.token.mint is None


def test_media_allows_generated_source():
    from pumptank_pipeline.models import Media
    assert Media(image_source="generated").image_source == "generated"


def test_to_product_fields_threads_image():
    from pumptank_pipeline.models import Pitch, Product, to_product_fields
    p = Pitch(id="x", season=5, episode=1, pitch_number=1, company_name="X",
              company_website="https://x", image_url="token_images/x.png",
              image_source="generated", got_deal=False)
    prod = Product(**to_product_fields(p))
    assert prod.media.image_url == "token_images/x.png"
    assert prod.media.image_source == "generated"
    assert prod.media.former_website == "https://x"
