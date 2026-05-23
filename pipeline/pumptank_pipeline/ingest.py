import math
import re
import warnings

import pandas as pd

from .models import Pitch

# field name -> actual CSV column name. Reconcile values against the real header.
COLUMN_MAP = {
    "season": "Season Number",
    "episode": "Episode Number",
    "pitch_number": "Pitch Number",
    "company_name": "Startup Name",
    "industry": "Industry",
    "ask_amount": "Original Ask Amount",
    "ask_equity": "Original Offered Equity",
    "valuation_requested": "Valuation Requested",
    "description": "Business Description",
    "founders": "Entrepreneur Names",
    "air_date": "Original Air Date",
    "got_deal": "Got Deal",
    "us_viewership": "US Viewership",
    "company_website": "Company Website",
}


class IngestError(Exception):
    pass


def _is_blank(value) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return str(value).strip() == ""


def _opt_str(value):
    return None if _is_blank(value) else str(value).strip()


def _opt_float(value):
    s = _opt_str(value)
    if s is None:
        return None
    try:
        return float(s.replace("$", "").replace(",", "").replace("%", "").strip())
    except ValueError:
        return None


def _opt_int(value):
    s = _opt_str(value)
    if s is None:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _parse_got_deal(value):
    """1/0 -> True/False; blanks or anything else -> None (unknown)."""
    if _is_blank(value):
        return None
    s = str(value).strip().lower()
    if s in {"1", "1.0", "true", "yes"}:
        return True
    if s in {"0", "0.0", "false", "no"}:
        return False
    return None


def _parse_founders(value):
    s = _opt_str(value)
    if s is None:
        return []
    parts = re.split(r"\s*(?:,|;|&)\s*", s)
    return [p for p in (x.strip() for x in parts) if p]


def _slug(text):
    s = re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")
    return s or "unknown"


def load_pitches(csv_path, max_null_got_deal: int = 10) -> list[Pitch]:
    df = pd.read_csv(csv_path)
    missing = [c for c in COLUMN_MAP.values() if c not in df.columns]
    if missing:
        raise IngestError(
            f"CSV missing expected columns: {missing}. "
            f"Reconcile COLUMN_MAP against actual headers: {list(df.columns)}"
        )

    pitches: list[Pitch] = []
    skipped = 0
    malformed = 0
    for _, row in df.iterrows():
        got = _parse_got_deal(row[COLUMN_MAP["got_deal"]])
        if got is None:
            skipped += 1
            continue
        season = _opt_int(row[COLUMN_MAP["season"]])
        episode = _opt_int(row[COLUMN_MAP["episode"]])
        pitch_number = _opt_int(row[COLUMN_MAP["pitch_number"]])
        if season is None or episode is None or pitch_number is None:
            malformed += 1
            continue
        company = _opt_str(row[COLUMN_MAP["company_name"]]) or "unknown"
        pitches.append(Pitch(
            id=f"s{season}e{episode}p{pitch_number}-{_slug(company)}",
            season=season, episode=episode, pitch_number=pitch_number,
            air_date=_opt_str(row[COLUMN_MAP["air_date"]]),
            company_name=company,
            founders=_parse_founders(row[COLUMN_MAP["founders"]]),
            industry=_opt_str(row[COLUMN_MAP["industry"]]),
            ask_amount=_opt_float(row[COLUMN_MAP["ask_amount"]]),
            ask_equity=_opt_float(row[COLUMN_MAP["ask_equity"]]),
            valuation_requested=_opt_float(row[COLUMN_MAP["valuation_requested"]]),
            description=_opt_str(row[COLUMN_MAP["description"]]),
            got_deal=got,
            us_viewership=_opt_float(row[COLUMN_MAP["us_viewership"]]),
            company_website=_opt_str(row[COLUMN_MAP["company_website"]]),
        ))

    if malformed:
        warnings.warn(
            f"Skipped {malformed} rows with missing/unparseable "
            f"season/episode/pitch_number."
        )
    if skipped > max_null_got_deal:
        raise IngestError(
            f"{skipped} rows with null/unparseable Got Deal "
            f"(threshold {max_null_got_deal}) — likely a column rename or parse error."
        )
    return pitches
