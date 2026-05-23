import json

from pumptank_pipeline.cli import run


def test_run_end_to_end(sample_csv, tmp_path):
    out = tmp_path / "products.json"
    schema = tmp_path / "products.schema.json"
    n = run(csv_path=sample_csv, out_path=out, schema_path=schema)

    assert n == 1  # only DoorBot (no deal); Acme Co got a deal -> excluded
    data = json.loads(out.read_text())
    assert [r["company_name"] for r in data] == ["DoorBot"]
