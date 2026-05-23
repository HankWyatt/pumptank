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
    assert prod.media.image_source == "none"
    assert prod.include is True
    assert prod.token is None


def test_product_json_schema_generates():
    schema = Product.model_json_schema()
    assert schema["type"] == "object"
    assert "media" in schema["properties"]
