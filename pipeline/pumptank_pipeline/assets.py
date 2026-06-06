import re
from typing import Optional

from . import config
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


def _cap_name(name: str, max_len: int) -> str:
    """Byte-aware truncate to Metaplex's name cap (bytes, not chars).

    Overrides should already be in-budget; this is a backstop so a long de-smooshed
    name can never produce a create-failing tx. Slices on a UTF-8 byte boundary
    (errors='ignore' drops any partial trailing multibyte char) and rstrips.
    """
    if len(name.encode("utf-8")) <= max_len:
        return name
    return name.encode("utf-8")[:max_len].decode("utf-8", "ignore").rstrip()


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
    # Deal products get a neutral tail (on the show, no "no deal" hook / terms);
    # no-deal keeps the "— no deal" hook.
    template = (config.DEAL_DESCRIPTION_TAIL if pitch.got_deal
                else config.NO_DEAL_DESCRIPTION_TAIL)
    tail = template.format(season=pitch.season, episode=pitch.episode,
                           disclaimer=disclaimer)
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


def _rank(p: Pitch) -> int:
    if p.selection and p.selection.rank is not None:
        return p.selection.rank
    return 1_000_000


def generate_assets(pitches: list[Pitch], *, max_ticker_len: int,
                    max_description_len: int, disclaimer: str,
                    name_overrides: dict, max_name_len: int,
                    symbol_overrides: dict | None = None) -> list[Pitch]:
    """Set .token on every launched (include==True) pitch; return all pitches.

    Symbols are deduped across the WHOLE launched set into one ``taken`` set, in
    a deterministic order: the dev-buy top-100 first by selection.rank (so they
    get the clean cashtags), then the remaining launched pitches by id. The
    description branches on got_deal (see ``_compose_description``).
    """
    overrides = symbol_overrides or {}
    launched = [p for p in pitches if p.include]
    dev_buys = sorted((p for p in launched if p.dev_buy), key=_rank)
    rest = sorted((p for p in launched if not p.dev_buy), key=lambda p: p.id)
    # Reserve every override symbol up front so the normally-derived shorts can't grab
    # one; overrides are pre-deduped + collision-safe vs the derived set (see config).
    taken: set = set(overrides.values())
    for p in dev_buys + rest:
        name = _cap_name(_clean_name(p.company_name, name_overrides, p.id),
                         max_name_len)
        if p.id in overrides:
            symbol = overrides[p.id]
        else:
            base = _derive_symbol(name, max_ticker_len) or f"TKN{_rank(p)}"
            symbol = _unique_symbol(base, taken, max_ticker_len)
        taken.add(symbol)
        p.token = TokenAssets(
            name=name, symbol=symbol,
            description=_compose_description(
                p, name, disclaimer=disclaimer, max_len=max_description_len),
        )
    return pitches
