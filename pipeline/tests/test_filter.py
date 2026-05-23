from pumptank_pipeline.filter import filter_no_deal
from pumptank_pipeline.models import Pitch


def _pitch(pid, got_deal):
    return Pitch(id=pid, season=1, episode=1, pitch_number=1,
                 company_name=pid, got_deal=got_deal)


def test_keeps_only_no_deal():
    kept = filter_no_deal([_pitch("a", False), _pitch("b", True)])
    assert [p.id for p in kept] == ["a"]


def test_a_deal_is_excluded_regardless_of_type():
    # got_deal True means the sharks did NOT pass -> excluded, even if it was
    # royalty-only / a loan / conditional. The filter only looks at got_deal.
    kept = filter_no_deal([_pitch("royalty-deal", True)])
    assert kept == []
