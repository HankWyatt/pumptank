import pytest
from pumptank_pipeline.ingest import load_pitches, IngestError, COLUMN_MAP


def test_loads_and_normalizes(sample_csv):
    pitches = load_pitches(sample_csv)
    assert len(pitches) == 2
    doorbot = next(p for p in pitches if p.company_name == "DoorBot")
    assert doorbot.got_deal is False
    assert doorbot.founders == ["Jamie Siminoff"]
    assert doorbot.id == "s5e9p1-doorbot"
    assert doorbot.ask_amount == 700000.0


def test_splits_multiple_founders(csv_factory, base_row):
    row = dict(base_row, **{"Entrepreneur Names": "Alice & Bob, Carol"})
    pitches = load_pitches(csv_factory([row]))
    assert pitches[0].founders == ["Alice", "Bob", "Carol"]


def test_missing_column_raises(csv_factory, base_row):
    bad = {k: v for k, v in base_row.items() if k != "Got Deal"}
    with pytest.raises(IngestError, match="missing expected columns"):
        load_pitches(csv_factory([bad]))


def test_null_got_deal_skipped_below_threshold(csv_factory, base_row):
    good = dict(base_row)
    blank = dict(base_row, **{"Pitch Number": 2, "Got Deal": ""})
    pitches = load_pitches(csv_factory([good, blank]), max_null_got_deal=10)
    assert len(pitches) == 1


def test_too_many_null_got_deal_raises(csv_factory, base_row):
    rows = [dict(base_row, **{"Pitch Number": i, "Got Deal": ""}) for i in range(5)]
    with pytest.raises(IngestError, match="null/unparseable Got Deal"):
        load_pitches(csv_factory(rows), max_null_got_deal=2)


def test_ids_unique_within_episode(sample_csv):
    ids = [p.id for p in load_pitches(sample_csv)]
    assert len(ids) == len(set(ids))


def test_blank_key_field_skipped_not_crash(csv_factory, base_row):
    good = dict(base_row)
    broken = dict(base_row, **{"Pitch Number": 2, "Season Number": ""})
    pitches = load_pitches(csv_factory([good, broken]))  # must NOT raise
    assert len(pitches) == 1


def test_strips_percent_in_equity(csv_factory, base_row):
    row = dict(base_row, **{"Original Offered Equity": "10%"})
    pitches = load_pitches(csv_factory([row]))
    assert pitches[0].ask_equity == 10.0


def test_captures_viewership_and_website(sample_csv):
    pitches = load_pitches(sample_csv)
    doorbot = next(p for p in pitches if p.company_name == "DoorBot")
    assert doorbot.us_viewership == 5.0
    assert doorbot.company_website == "https://doorbot.example"
