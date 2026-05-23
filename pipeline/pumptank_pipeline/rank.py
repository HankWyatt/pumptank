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
