from .models import Pitch


def filter_no_deal(pitches: list[Pitch]) -> list[Pitch]:
    """Keep only pitches the sharks passed on (Got Deal == 0).

    The dataset's Royalty Deal / Loan / Deal-has-conditions columns are NOT
    inputs here — they only ever describe a row where got_deal is True, which is
    excluded anyway. Selection keys solely on got_deal.
    """
    return [p for p in pitches if not p.got_deal]
