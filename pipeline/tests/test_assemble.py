import json

from pumptank_pipeline.assemble import write_products
from pumptank_pipeline.models import Pitch


def _pitch(pid):
    return Pitch(id=pid, season=5, episode=9, pitch_number=1,
                 company_name="DoorBot", founders=["Jamie Siminoff"],
                 ask_amount=700000, ask_equity=10, valuation_requested=7000000,
                 description="Video doorbell", got_deal=False)


def test_writes_products_and_schema(tmp_path):
    out = tmp_path / "products.json"
    schema = tmp_path / "products.schema.json"
    products = write_products([_pitch("s5e9p1-doorbot")], out, schema)

    assert len(products) == 1
    data = json.loads(out.read_text())
    rec = data[0]
    assert rec["id"] == "s5e9p1-doorbot"
    assert rec["pitch"]["ask_amount"] == 700000
    assert rec["outcome"]["got_deal"] is False
    assert rec["got_deal"] is False
    assert rec["media"]["image_source"] == "none"
    assert rec["include"] is True
    assert rec["dev_buy"] is False
    assert json.loads(schema.read_text())["type"] == "array"


def test_writes_real_got_deal_and_dev_buy(tmp_path):
    out = tmp_path / "products.json"
    deal = Pitch(id="s1e1p1-acme", season=1, episode=1, pitch_number=1,
                 company_name="Acme", got_deal=True, include=True, dev_buy=False)
    nodeal = Pitch(id="s1e1p2-doorbot", season=1, episode=1, pitch_number=2,
                   company_name="DoorBot", got_deal=False, include=True, dev_buy=True)
    write_products([deal, nodeal], out)
    by_id = {r["id"]: r for r in json.loads(out.read_text())}
    assert by_id["s1e1p1-acme"]["got_deal"] is True
    assert by_id["s1e1p1-acme"]["outcome"]["got_deal"] is True
    assert by_id["s1e1p1-acme"]["dev_buy"] is False
    assert by_id["s1e1p2-doorbot"]["got_deal"] is False
    assert by_id["s1e1p2-doorbot"]["dev_buy"] is True


def test_output_validates_against_schema(tmp_path):
    import jsonschema
    out = tmp_path / "products.json"
    schema = tmp_path / "products.schema.json"
    write_products([_pitch("s5e9p1-doorbot")], out, schema)
    data = json.loads(out.read_text())
    sch = json.loads(schema.read_text())
    jsonschema.validate(data, sch)  # raises jsonschema.ValidationError if invalid
