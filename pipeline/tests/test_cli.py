import json

from pumptank_pipeline.cli import run


def test_run_end_to_end(sample_csv, tmp_path):
    out = tmp_path / "products.json"
    schema = tmp_path / "products.schema.json"
    n = run(csv_path=sample_csv, out_path=out, schema_path=schema)

    assert n == 1  # only DoorBot (no deal); Acme Co got a deal -> excluded
    data = json.loads(out.read_text())
    assert [r["company_name"] for r in data] == ["DoorBot"]


def test_run_annotates_selection(csv_factory, base_row, tmp_path):
    rows = [
        dict(base_row),  # DoorBot S5 no-deal, findable -> selected
        dict(base_row, **{"Pitch Number": 2, "Startup Name": "OldCo",
                          "Season Number": 17}),                       # S17 -> excluded
        dict(base_row, **{"Pitch Number": 3, "Startup Name": "GhostCo",
                          "Entrepreneur Names": "", "Company Website": ""}),  # unfindable
        dict(base_row, **{"Pitch Number": 4, "Startup Name": "Acme",
                          "Got Deal": 1}),                             # deal -> filtered
    ]
    out = tmp_path / "p.json"
    schema = tmp_path / "s.json"
    run(csv_path=csv_factory(rows), out_path=out, schema_path=schema)
    data = {r["company_name"]: r for r in json.loads(out.read_text())}
    assert "Acme" not in data  # got a deal -> removed before ranking
    assert data["DoorBot"]["include"] is True
    assert data["DoorBot"]["selection"]["selected"] is True
    assert data["DoorBot"]["selection"]["rank"] == 1
    assert data["OldCo"]["selection"]["excluded_reason"] == "out_of_scope_season"
    assert data["GhostCo"]["selection"]["excluded_reason"] == "unfindable"
    # spec invariant: include must mirror selection.selected on generated output
    assert all(r["include"] == r["selection"]["selected"] for r in data.values())


def test_run_generates_token_assets(csv_factory, base_row, tmp_path):
    rows = [
        dict(base_row),  # DoorBot S5 no-deal, findable -> selected
        dict(base_row, **{"Pitch Number": 2, "Startup Name": "Acme",
                          "Got Deal": 1}),  # deal -> filtered
    ]
    out = tmp_path / "p.json"
    schema = tmp_path / "s.json"
    run(csv_path=csv_factory(rows), out_path=out, schema_path=schema)
    data = {r["company_name"]: r for r in json.loads(out.read_text())}
    tok = data["DoorBot"]["token"]
    assert tok is not None
    assert tok["symbol"] == "DOORBOT"
    assert "no deal" in tok["description"].lower()
    assert tok["mint"] is None
