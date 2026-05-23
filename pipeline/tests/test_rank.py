from pumptank_pipeline.rank import _pct_rank


def test_pct_rank_basic_with_ties():
    assert _pct_rank([10, 20, 20, 30]) == [0.25, 0.625, 0.625, 1.0]


def test_pct_rank_nulls_score_zero():
    assert _pct_rank([None, 5.0]) == [0.0, 1.0]


def test_pct_rank_empty_and_all_null():
    assert _pct_rank([]) == []
    assert _pct_rank([None, None]) == [0.0, 0.0]


import pytest
from pumptank_pipeline.models import Pitch
from pumptank_pipeline.rank import rank_and_select

W = {"reach": 0.45, "ambition": 0.30, "findability": 0.25}


def _p(pid, season=5, viewership=5.0, valuation=1_000_000.0,
       founders=("A",), website="https://x"):
    return Pitch(id=pid, season=season, episode=1, pitch_number=1,
                 company_name=pid, founders=list(founders),
                 company_website=website, us_viewership=viewership,
                 valuation_requested=valuation, got_deal=False)


def test_season_above_max_excluded():
    [p] = rank_and_select([_p("a", season=17)], weights=W, n=10, max_season=16)
    assert p.include is False
    assert p.selection.selected is False
    assert p.selection.excluded_reason == "out_of_scope_season"
    assert p.selection.rank is None


def test_unfindable_excluded():
    [p] = rank_and_select([_p("a", founders=(), website=None)],
                          weights=W, n=10, max_season=16)
    assert p.selection.excluded_reason == "unfindable"
    assert p.include is False


def test_founder_only_and_site_only_survive_floor():
    out = rank_and_select(
        [_p("f", founders=("A",), website=None),
         _p("s", founders=(), website="https://y")],
        weights=W, n=10, max_season=16)
    assert all(p.selection.excluded_reason is None for p in out)
    assert all(p.selection.findability == 0.5 for p in out)


def test_top_n_selected_and_ranked():
    pitches = [_p(f"p{i}", viewership=float(i)) for i in range(5)]
    out = rank_and_select(pitches, weights=W, n=2, max_season=16)
    assert sum(1 for p in out if p.include) == 2
    assert [out[0].selection.rank, out[1].selection.rank] == [1, 2]
    assert out[0].selection.selected is True


def test_higher_viewership_ranks_higher():
    out = rank_and_select(
        [_p("low", viewership=1.0), _p("high", viewership=9.0)],
        weights=W, n=2, max_season=16)
    assert out[0].id == "high"
    assert out[0].selection.reach == 1.0


def test_pool_smaller_than_n_warns_and_selects_all():
    with pytest.warns(UserWarning, match="< N"):
        out = rank_and_select([_p("a")], weights=W, n=100, max_season=16)
    assert out[0].include is True


def test_deterministic_id_tiebreak():
    out = rank_and_select([_p("bbb"), _p("aaa")], weights=W, n=2, max_season=16)
    assert [p.id for p in out] == ["aaa", "bbb"]


def test_include_equals_selected_for_every_record():
    pitches = [_p(f"p{i}", viewership=float(i)) for i in range(5)]
    pitches.append(_p("old", season=17))
    pitches.append(_p("ghost", founders=(), website=None))
    out = rank_and_select(pitches, weights=W, n=2, max_season=16)
    for p in out:
        assert p.include == p.selection.selected


def test_bad_weights_raise():
    with pytest.raises(ValueError, match="sum to 1.0"):
        rank_and_select([_p("a")],
                        weights={"reach": 1, "ambition": 1, "findability": 1},
                        n=1, max_season=16)
