from pumptank_pipeline import config


def test_selection_config_present_and_valid():
    assert config.SELECT_TOP_N == 100
    assert config.MAX_SEASON == 16
    assert set(config.SELECTION_WEIGHTS) == {"reach", "ambition", "findability"}
    assert abs(sum(config.SELECTION_WEIGHTS.values()) - 1.0) < 1e-9
