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
        if budget <= 1:
            # mandatory hook + disclaimer already fill max_len; drop the blurb
            return tail.strip()
        blurb = blurb[: budget - 1].rstrip() + "…"
    return f"{blurb}{tail}"


def _unique_symbol(base: str, taken: set, max_len: int) -> str:
    if base not in taken:
        return base
    i = 2
    while True:
        suffix = str(i)
        cand = base[: max_len - len(suffix)] + suffix
        if cand not in taken:
            return cand
        i += 1


def generate_assets(pitches: list[Pitch], *, max_ticker_len: int,
                    max_description_len: int, disclaimer: str,
                    name_overrides: dict) -> list[Pitch]:
    """Set .token on every include==True pitch; return all pitches.

    Tickers are deduped deterministically in selection.rank order.
    """
    def _rank(p):
        return p.selection.rank if (p.selection and p.selection.rank is not None) else 1_000_000

    selected = sorted((p for p in pitches if p.include), key=_rank)
    taken: set = set()
    for p in selected:
        name = _clean_name(p.company_name, name_overrides, p.id)
        base = _derive_symbol(name, max_ticker_len) or f"TKN{_rank(p)}"
        symbol = _unique_symbol(base, taken, max_ticker_len)
        taken.add(symbol)
        p.token = TokenAssets(
            name=name, symbol=symbol,
            description=_compose_description(
                p, name, disclaimer=disclaimer, max_len=max_description_len),
        )
    return pitches
