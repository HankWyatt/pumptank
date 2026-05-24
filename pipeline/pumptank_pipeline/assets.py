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


def _derive_symbol(clean_name: str, max_len: int) -> str:
    """Compact uppercase cashtag: drop leading 'The' + corp suffixes, alnum-only, cap len."""
    base = re.sub(r"^The\s+", "", clean_name, flags=re.IGNORECASE)
    base = _CORP_SUFFIX.sub("", base)
    base = re.sub(r"[^A-Za-z0-9]", "", base).upper()
    return base[:max_len]
