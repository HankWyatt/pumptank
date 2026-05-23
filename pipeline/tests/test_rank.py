from pumptank_pipeline.rank import _pct_rank


def test_pct_rank_basic_with_ties():
    assert _pct_rank([10, 20, 20, 30]) == [0.25, 0.625, 0.625, 1.0]


def test_pct_rank_nulls_score_zero():
    assert _pct_rank([None, 5.0]) == [0.0, 1.0]


def test_pct_rank_empty_and_all_null():
    assert _pct_rank([]) == []
    assert _pct_rank([None, None]) == [0.0, 0.0]
