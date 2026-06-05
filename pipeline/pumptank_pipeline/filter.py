from .models import Pitch


def filter_no_deal(pitches: list[Pitch]) -> list[Pitch]:
    """Return the no-deal subset (Got Deal == 0).

    As of the all-products expansion this is NO LONGER the launch gate — every
    product launches (`include=True`). This now only produces the pool that
    `rank_and_select` ranks to choose the top-100 that get the 1.5% dev-buy.

    The dataset's Royalty Deal / Loan / Deal-has-conditions columns are NOT
    inputs here — they only ever describe a row where got_deal is True, which is
    not in this subset anyway. The split keys solely on got_deal.
    """
    return [p for p in pitches if not p.got_deal]
