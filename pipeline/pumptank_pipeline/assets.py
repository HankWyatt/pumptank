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


def _is_junk_blurb(description: Optional[str]) -> bool:
    """Junk = the templated '{Name} - {Category}' pattern: a space-surrounded dash."""
    return bool(description) and bool(_SPACED_DASH.search(description))


def _compose_description(pitch: Pitch, clean_name: str, *,
                         disclaimer: str, max_len: int) -> str:
    industry = pitch.industry or "Shark Tank"
    if _is_junk_blurb(pitch.description):
        blurb = f"{clean_name}, a {industry} product."
    else:
        blurb = (pitch.description or f"A {industry} product.").strip()
    if not blurb.endswith((".", "!", "?")):
        blurb += "."
    tail = f" Pitched on Shark Tank S{pitch.season}E{pitch.episode} — no deal. {disclaimer}"
    budget = max_len - len(tail)
    if len(blurb) > budget:
        blurb = blurb[: max(0, budget - 1)].rstrip() + "…"
    return f"{blurb}{tail}"
