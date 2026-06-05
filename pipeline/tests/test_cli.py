import json

import pytest

from pumptank_pipeline import config
from pumptank_pipeline.cli import run


@pytest.fixture(autouse=True)
def _isolate_image_dir(tmp_path, monkeypatch):
    """Keep every CLI test's rendered PNGs out of the real data/token_images/."""
    monkeypatch.setattr(config, "IMAGE_DIR", tmp_path / "imgs")


def test_run_end_to_end(sample_csv, tmp_path):
    out = tmp_path / "products.json"
    schema = tmp_path / "products.schema.json"
    n = run(csv_path=sample_csv, out_path=out, schema_path=schema)

    assert n == 2  # run() returns the launched count: both products launch
    data = json.loads(out.read_text())
    # all-products: BOTH the no-deal and the got-deal product launch (are written)
    assert {r["company_name"] for r in data} == {"DoorBot", "Acme Co"}
    by_name = {r["company_name"]: r for r in data}
    assert all(r["include"] is True for r in data)   # everything launches
    assert all(r["dev_buy"] is False for r in data)  # create-only: no product dev-buys
    assert by_name["DoorBot"]["got_deal"] is False
    assert by_name["Acme Co"]["got_deal"] is True


def test_run_annotates_selection(csv_factory, base_row, tmp_path):
    rows = [
        dict(base_row),  # DoorBot S5 no-deal, findable -> dev-buy
        dict(base_row, **{"Pitch Number": 2, "Startup Name": "OldCo",
                          "Season Number": 17}),                       # S17 -> no dev-buy
        dict(base_row, **{"Pitch Number": 3, "Startup Name": "GhostCo",
                          "Entrepreneur Names": "", "Company Website": ""}),  # unfindable
        dict(base_row, **{"Pitch Number": 4, "Startup Name": "Acme",
                          "Got Deal": 1}),                             # deal -> create-only
    ]
    out = tmp_path / "p.json"
    schema = tmp_path / "s.json"
    run(csv_path=csv_factory(rows), out_path=out, schema_path=schema)
    data = {r["company_name"]: r for r in json.loads(out.read_text())}
    # all-products: every product launches (is written + include=True)
    assert set(data) == {"DoorBot", "OldCo", "GhostCo", "Acme"}
    assert all(r["include"] is True for r in data.values())

    assert data["DoorBot"]["dev_buy"] is False
    assert data["DoorBot"]["selection"]["selected"] is True
    assert data["DoorBot"]["selection"]["rank"] == 1
    assert data["DoorBot"]["got_deal"] is False

    # no-deal but out of the ranked pool: launched, reason annotated
    assert data["OldCo"]["dev_buy"] is False
    assert data["OldCo"]["selection"]["excluded_reason"] == "out_of_scope_season"
    assert data["GhostCo"]["dev_buy"] is False
    assert data["GhostCo"]["selection"]["excluded_reason"] == "unfindable"

    # got a deal: launched (create-only), real got_deal=True, no dev-buy.
    # never ranked, so no selection annotation at all.
    assert data["Acme"]["got_deal"] is True
    assert data["Acme"]["dev_buy"] is False
    assert data["Acme"]["selection"] is None

    # invariant: NO product dev-buys (all create-only); `selected` is now a pure
    # editorial top-N flag on ranked (no-deal) records, for website ordering.
    assert all(r["dev_buy"] is False for r in data.values())
    assert data["DoorBot"]["selection"]["selected"] is True


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


def test_run_generates_images(csv_factory, base_row, tmp_path, monkeypatch):
    from pumptank_pipeline import config
    monkeypatch.setattr(config, "IMAGE_DIR", tmp_path / "imgs")
    out = tmp_path / "p.json"
    schema = tmp_path / "s.json"
    run(csv_path=csv_factory([dict(base_row)]), out_path=out, schema_path=schema)
    rec = json.loads(out.read_text())[0]
    assert rec["media"]["image_source"] == "generated"
    assert rec["media"]["image_url"].endswith(".png")
    assert (config.IMAGE_DIR / f'{rec["id"]}.png').exists()
