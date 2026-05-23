import pandas as pd
import pytest

_BASE_ROW = {
    "Season Number": 5, "Episode Number": 9, "Pitch Number": 1,
    "Startup Name": "DoorBot", "Industry": "Tech",
    "Original Ask Amount": 700000, "Original Offered Equity": 10,
    "Valuation Requested": 7000000, "Business Description": "Video doorbell",
    "Entrepreneur Names": "Jamie Siminoff", "Original Air Date": "2013-11-15",
    "Got Deal": 0,
    "US Viewership": 5.0, "Company Website": "https://doorbot.example",
}


def _write_csv(tmp_path, rows):
    path = tmp_path / "sample.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    return path


@pytest.fixture
def sample_csv(tmp_path):
    no_deal = dict(_BASE_ROW)
    got_deal = dict(_BASE_ROW, **{
        "Pitch Number": 2, "Startup Name": "Acme Co", "Got Deal": 1})
    return _write_csv(tmp_path, [no_deal, got_deal])


@pytest.fixture
def csv_factory(tmp_path):
    def make(rows):
        return _write_csv(tmp_path, rows)
    return make


@pytest.fixture
def base_row():
    """A fresh copy of the canonical row, for tests that tweak one field."""
    return dict(_BASE_ROW)
