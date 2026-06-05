import warnings
from collections import defaultdict
from typing import Optional

from .models import Pitch, Selection


def _pct_rank(values: list[Optional[float]]) -> list[float]:
    """Average-rank percentile in [0,1] (pandas rank(pct=True) semantics).

    None values score 0.0 and are excluded from the ranked population.
    """
    out = [0.0] * len(values)
    present = [(i, v) for i, v in enumerate(values) if v is not None]
    n = len(present)
    if n == 0:
        return out
    present.sort(key=lambda iv: iv[1])
    i = 0
    while i < n:
        j = i
        while j < n and present[j][1] == present[i][1]:
            j += 1
        avg_rank = (i + 1 + j) / 2.0  # mean of 1-based ranks (i+1)..j
        for k in range(i, j):
            out[present[k][0]] = avg_rank / n
        i = j
    return out


def rank_and_select(
    pitches: list[Pitch], *, weights: dict, n: int, max_season: int,
    exclude_ids: dict | None = None,
) -> list[Pitch]:
    """Annotate every (no-deal) pitch with a Selection (editorial rank/score).

    Governs ONLY `selection` — NOT `include` or `dev_buy`. Every product
    launches (`include=True`) and is create-only; no product gets a dev-buy
    (that is reserved for the index token, set elsewhere). `selection.selected`
    marks the top-N no-deal by editorial score purely for website ordering.

    Returns all passed pitches: the ranked pool first (rank order), excluded
    pitches after (id order). Pure function aside from mutating the passed
    Pitches.

    `exclude_ids` is an optional {id: reason} map of no-deal pitches to drop
    from the ranked pool (e.g. too-big-to-engage); they never enter the pool
    (so the next-ranked candidate fills the freed editorial slot) but they still
    launch (create-only, like everything else).
    """
    if abs(sum(weights.values()) - 1.0) > 1e-9:
        raise ValueError(f"weights must sum to 1.0, got {weights}")
    exclude_ids = exclude_ids or {}

    pool: list[Pitch] = []
    excluded: list[Pitch] = []
    for p in pitches:
        if p.id in exclude_ids:
            p.selection = Selection(excluded_reason=exclude_ids[p.id])
            excluded.append(p)
        elif p.season > max_season:
            p.selection = Selection(excluded_reason="out_of_scope_season")
            excluded.append(p)
        elif not p.founders and not p.company_website:
            p.selection = Selection(excluded_reason="unfindable")
            excluded.append(p)
        else:
            pool.append(p)

    # reach = viewership percentile WITHIN season
    by_season: dict[int, list[Pitch]] = defaultdict(list)
    for p in pool:
        by_season[p.season].append(p)
    reach: dict[str, float] = {}
    for members in by_season.values():
        for p, pct in zip(members, _pct_rank([m.us_viewership for m in members])):
            reach[p.id] = pct

    # ambition = valuation percentile across the whole pool
    ambition: dict[str, float] = {}
    for p, pct in zip(pool, _pct_rank([p.valuation_requested for p in pool])):
        ambition[p.id] = pct

    for p in pool:
        find = 0.5 * (1.0 if p.founders else 0.0) + \
               0.5 * (1.0 if p.company_website else 0.0)
        score = (weights["reach"] * reach[p.id]
                 + weights["ambition"] * ambition[p.id]
                 + weights["findability"] * find)
        p.selection = Selection(
            score=score, reach=reach[p.id], ambition=ambition[p.id],
            findability=find,
        )

    # deterministic: score/reach/ambition descending, id ascending
    pool.sort(key=lambda p: (-p.selection.score, -p.selection.reach,
                             -p.selection.ambition, p.id))
    for rank, p in enumerate(pool, start=1):
        p.selection.rank = rank
        p.selection.selected = rank <= n  # editorial top-N (website ordering only)

    if len(pool) < n:
        warnings.warn(f"candidate pool ({len(pool)}) < N ({n}); selecting all")

    excluded.sort(key=lambda p: p.id)
    return pool + excluded
