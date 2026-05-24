import re
from typing import Optional

from .models import Pitch, TokenAssets

_CORP_SUFFIX = re.compile(r"\s+(?:Company|Co|Inc|LLC|Corp)\.?$", re.IGNORECASE)
_SPACED_DASH = re.compile(r"\s[-–—]\s")


def _clean_name(company_name: str, overrides: dict[str, str], pitch_id: str) -> str:
    """De-smoosh a dataset name into a display name; overrides win."""
    if pitch_id in overrides:
        return overrides[pitch_id]
    name = company_name.strip()
    if " " in name:
        return name
    name = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name)   # camelCase boundary
    name = re.sub(r"(?<=[A-Z])(?=[A-Z][a-z])", " ", name)  # acronym -> word
    return re.sub(r"\s+", " ", name).strip()
