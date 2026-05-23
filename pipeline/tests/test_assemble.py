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
    assert rec["media"]["image_source"] == "none"
    assert rec["include"] is True
    assert json.loads(schema.read_text())["type"] == "array"


def test_output_validates_against_schema(tmp_path):
    import jsonschema
    out = tmp_path / "products.json"
    schema = tmp_path / "products.schema.json"
    write_products([_pitch("s5e9p1-doorbot")], out, schema)
    data = json.loads(out.read_text())
    sch = json.loads(schema.read_text())
    jsonschema.validate(data, sch)  # raises jsonschema.ValidationError if invalid
